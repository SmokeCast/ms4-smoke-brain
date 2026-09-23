const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
let dependency, server, base, mode = 'empty', cityCalls = 0;
before(async () => {
  dependency = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'timeout') return;
    if (mode === 'error') { res.writeHead(500); return res.end('{}'); }
    if (req.url.startsWith('/api/v1/fires')) {
      return res.end(JSON.stringify({ content: mode === 'empty' ? [] : [{ id: 1, centroidLat: 0, centroidLon: 0 }] }));
    }
    if (req.url.startsWith('/api/v1/cities/near')) {
      cityCalls++;
      return res.end(JSON.stringify([{ id: 2, name: 'Ciudad cercana', latitude: 0.1, longitude: 0.1, population: 100000, distance_km: 15 }]));
    }
    if (req.url.startsWith('/api/v1/weather/latest')) {
      return res.end(JSON.stringify({ city_id: 2, city_name: 'Ciudad cercana', wind_speed_kmh: 12, wind_direction_deg: 45 }));
    }
    if (req.url.startsWith('/health')) return res.end(JSON.stringify({ status: 'ok' }));
    res.end('{}');
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => dependency.once('listening', resolve));
  process.env.MS1_URL = process.env.MS2_URL = process.env.MS3_URL = `http://127.0.0.1:${dependency.address().port}`;
  process.env.REQUEST_TIMEOUT_MS = '150';
  server = require('./index').app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections(); dependency.closeAllConnections();
  await Promise.all([new Promise(r => server.close(r)), new Promise(r => dependency.close(r))]);
});
test('sin incendios responde 200 y no consulta ciudades', async () => {
  mode = 'empty';
  const response = await fetch(base + '/api/v1/risk/preview');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.fire, null); assert.deepEqual(data.nearby_cities, []); assert.equal(cityCalls, 0);
});
test('combina MS1 y MS2 con coordenadas cero', async () => {
  mode = 'data';
  const response = await fetch(base + '/api/v1/risk/preview');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nearby_cities[0].id, 2);
});
test('propaga dependencia caída como 502', async () => {
  mode = 'error';
  assert.equal((await fetch(base + '/api/v1/risk/preview')).status, 502);
});
test('limita el tiempo de espera y devuelve 504', async () => {
  mode = 'timeout';
  assert.equal((await fetch(base + '/api/v1/risk/preview')).status, 504);
});
