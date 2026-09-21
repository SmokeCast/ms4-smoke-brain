const express = require('express');

const app = express();
const ms1 = (process.env.MS1_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const ms2 = (process.env.MS2_URL || 'http://127.0.0.1:8082').replace(/\/$/, '');
const ms3 = (process.env.MS3_URL || 'http://127.0.0.1:8083').replace(/\/$/, '');
const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 5000);
const radiusKm = Number(process.env.RISK_RADIUS_KM || 150);

app.use(express.json());
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Servicio dependiente respondió HTTP ${response.status}`);
  return response.json();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function haversine(lat1, lon1, lat2, lon2) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const radians = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * radians) * Math.cos(lat2 * radians);
  const x = Math.cos(lat1 * radians) * Math.sin(lat2 * radians)
    - Math.sin(lat1 * radians) * Math.cos(lat2 * radians) * Math.cos((lon2 - lon1) * radians);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

function angularDistance(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }
function classifyRisk(score) {
  if (score >= 70) return 'Crítico';
  if (score >= 45) return 'Alto';
  if (score >= 20) return 'Moderado';
  return 'Bajo';
}

function evaluateCity(fire, city, weather) {
  const fireLat = finite(fire.centroidLat ?? fire.centroid_lat);
  const fireLon = finite(fire.centroidLon ?? fire.centroid_lon);
  const cityLat = finite(city.latitude);
  const cityLon = finite(city.longitude);
  const distance = finite(city.distance_km, haversine(fireLat, fireLon, cityLat, cityLon));
  const targetBearing = bearing(fireLat, fireLon, cityLat, cityLon);
  const windSpeed = finite(weather?.wind_speed_kmh, 0);
  const windFrom = finite(weather?.wind_direction_deg, null);
  // Las APIs meteorológicas expresan la dirección de origen; la pluma avanza al lado opuesto.
  const smokeDirection = windFrom == null ? null : (windFrom + 180) % 360;
  const angle = smokeDirection == null ? 90 : angularDistance(targetBearing, smokeDirection);
  const alignment = smokeDirection == null ? 0.25 : Math.max(0, Math.cos(angle * Math.PI / 180));
  const proximity = Math.max(0, 1 - distance / radiusKm);
  const intensity = Math.min(1, Math.max(0, finite(fire.maxFrp ?? fire.max_frp, 0) / 200));
  const windFactor = windSpeed > 1 ? 0.35 + 0.65 * alignment : 0.25;
  const populationFactor = Math.min(1, Math.log10(Math.max(10, finite(city.population, 10))) / 7);
  const score = Math.round(100 * (0.5 * intensity + 0.25 * proximity + 0.15 * windFactor + 0.1 * populationFactor) * alignment);
  const eta = windSpeed > 1 ? Math.max(0.1, distance / (windSpeed * 0.8)) : null;
  return {
    ...city,
    distance_km: Number(distance.toFixed(1)), bearing_deg: Number(targetBearing.toFixed(1)),
    smoke_direction_deg: smokeDirection == null ? null : Number(smokeDirection.toFixed(1)),
    wind_alignment: Number(alignment.toFixed(3)), wind_speed_kmh: windSpeed,
    risk_score: score, level: classifyRisk(score), eta_hours: eta == null ? null : Number(eta.toFixed(1)),
    weather: weather || null,
  };
}

async function getFire(fireId) {
  if (fireId == null) {
    const page = await getJson(`${ms1}/api/v1/fires?page=0&size=1`);
    if (!Array.isArray(page.content)) throw new Error('Respuesta de MS1 inválida');
    return page.content[0] || null;
  }
  const id = Number(fireId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('fire_id inválido');
  return getJson(`${ms1}/api/v1/fires/${id}`);
}

async function calculateRisk(fireId) {
  const fire = await getFire(fireId);
  const note = 'Evaluación heurística basada en FRP, distancia, población y dirección del viento; no sustituye una alerta oficial.';
  if (!fire) return { fire: null, nearby_cities: [], alerts: [], note };
  const fireLat = finite(fire.centroidLat ?? fire.centroid_lat);
  const fireLon = finite(fire.centroidLon ?? fire.centroid_lon);
  if (fireLat == null || fireLon == null) throw new Error('Coordenadas del incendio inválidas');
  const cities = await getJson(`${ms2}/api/cities/near?lat=${fireLat}&lon=${fireLon}&radius_km=${radiusKm}`);
  if (!Array.isArray(cities)) throw new Error('Respuesta de MS2 inválida');
  const evaluated = await Promise.all(cities.map(async city => {
    try {
      const weather = await getJson(`${ms3}/api/weather/latest?city_id=${encodeURIComponent(city.id)}`);
      return evaluateCity(fire, city, weather);
    } catch (error) {
      if (error.message.includes('HTTP 404')) return evaluateCity(fire, city, null);
      throw error;
    }
  }));
  evaluated.sort((a, b) => b.risk_score - a.risk_score);
  return { fire, nearby_cities: evaluated, alerts: evaluated, note };
}

app.get('/health', async (req, res) => {
  if (req.query.deep !== 'true') return res.json({ status: 'ok', service: 'ms4-smoke-brain' });
  const checks = await Promise.allSettled([
    getJson(`${ms1}/api/v1/fires?page=0&size=1`), getJson(`${ms2}/health`), getJson(`${ms3}/health`),
  ]);
  const dependencies = { ms1: checks[0].status === 'fulfilled', ms2: checks[1].status === 'fulfilled', ms3: checks[2].status === 'fulfilled' };
  const healthy = Object.values(dependencies).every(Boolean);
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', service: 'ms4-smoke-brain', dependencies });
});

app.get('/api/risk/preview', async (req, res) => {
  try { res.json(await calculateRisk(req.query.fire_id)); }
  catch (error) {
    console.error('MS4:', error.message);
    res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: 'No se pudo calcular el riesgo con MS1, MS2 y MS3' });
  }
});

app.get('/api/risk/:cityId', async (req, res) => {
  try {
    const result = await calculateRisk(req.query.fire_id);
    const city = result.alerts.find(item => item.id === Number(req.params.cityId));
    if (!city) return res.status(404).json({ error: 'No se encontró evaluación para la ciudad' });
    res.json(city);
  } catch (error) {
    console.error('MS4:', error.message);
    res.status(error.name === 'TimeoutError' ? 504 : 502).json({ error: 'No se pudo calcular el riesgo' });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 8084);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Ms4 en puerto ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}

module.exports = { app, evaluateCity, calculateRisk, haversine, bearing };
