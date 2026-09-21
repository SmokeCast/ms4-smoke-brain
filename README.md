# MS4 — Smoke Brain

Agregador Express sin base de datos. Puerto predeterminado: 8084.

## Ejecución local

Requiere Node.js 22.12 o superior (versión de referencia: 22).
Desde esta carpeta:

```sh
npm ci
cp env.example .env
# Editar .env con la configuración local.
npm start
```

`npm run dev` reinicia al editar archivos. `npm test` ejecuta las pruebas.
Las dependencias están fijadas en `package-lock.json`.

## Endpoints y alcance

- `GET /health`: comprueba que esta API responde; no verifica MS1/MS2.
- `GET /api/risk/preview`: obtiene un incendio desde `/api/v1/fires` de MS1
  y hasta 20 ciudades a 150 km desde MS2. Devuelve `{fire, nearby_cities, note}`.

Configurar `MS1_URL`, `MS2_URL` y `REQUEST_TIMEOUT_MS` (5000 por defecto).
Si no hay incendios, devuelve `fire: null` y una lista vacía con HTTP 200.
Una dependencia fallida devuelve 502; un timeout devuelve 504.

Se mantiene el alcance del Hito 1: todavía no calcula trayectoria, hora de llegada
ni puntaje de riesgo, y no consulta MS3. No devuelve alertas simuladas.
