const express = require('express');
const app = express();
const ms1 = (process.env.MS1_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const ms2 = (process.env.MS2_URL || 'http://127.0.0.1:8082').replace(/\/$/, '');
const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 5000);

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Servicio dependiente respondió HTTP ${response.status}`);
  return response.json();
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ms4-smoke-brain' }));

app.get('/api/risk/preview', async (req, res) => {
  try {
    const fires = await getJson(`${ms1}/api/v1/fires?page=0&size=1`);
    if (!Array.isArray(fires.content)) throw new Error('Respuesta de MS1 inválida');
    const fire = fires.content[0];
    const note = 'Vista preliminar del Hito 1; el cálculo de riesgo y viento está pendiente.';
    if (!fire) return res.json({ fire: null, nearby_cities: [], note });
    if (typeof fire.centroidLat !== 'number' || !Number.isFinite(fire.centroidLat) ||
        typeof fire.centroidLon !== 'number' || !Number.isFinite(fire.centroidLon)) {
      throw new Error('Coordenadas del incendio inválidas');
    }
    const params = new URLSearchParams({ lat: fire.centroidLat, lon: fire.centroidLon, radius_km: 150 });
    const cities = await getJson(`${ms2}/api/cities/near?${params}`);
    if (!Array.isArray(cities)) throw new Error('Respuesta de MS2 inválida');
    res.json({ fire, nearby_cities: cities, note });
  } catch (error) {
    console.error(error.message);
    res.status(error.name === 'TimeoutError' ? 504 : 502)
      .json({ error: 'No se pudo obtener la información de MS1 o MS2' });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 8084);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Ms4 en puerto ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
module.exports = { app };
