# MS4 — Smoke Brain

Agregador Express sin base de datos. Puerto predeterminado: 8084.

## Ejecución local

Requiere Node.js 22.12 o superior:

```sh
npm ci
cp env.example .env
npm start
```

MS1, MS2 y MS3 deben estar disponibles antes de consultar el riesgo.

## Endpoints

- `GET /health`: confirma que MS4 responde.
- `GET /health?deep=true`: verifica también MS1, MS2 y MS3; devuelve 503 si alguna dependencia no responde.
- `GET /api/v1/risk/preview`: toma el primer incendio de MS1, consulta ciudades próximas en MS2 y clima reciente en MS3.
- `GET /api/v1/risk/preview?fire_id=123`: evalúa un incendio específico.
- `GET /api/v1/risk/{city_id}`: devuelve el detalle de riesgo de una ciudad del incendio evaluado.

La evaluación combina potencia radiativa (FRP), distancia al incendio, población,
velocidad del viento y alineación de la ciudad con la dirección de desplazamiento de
la pluma. Produce `risk_score`, `level`, `eta_hours`, `distance_km`, `bearing_deg`,
`sensitive_sites_count` y `sensitive_site_types`. MS4 consulta los sitios sensibles
de MS2 y les asigna un peso moderado según su tipo (salud, cuidado, educación,
infraestructura crítica o áreas protegidas); no reemplaza el efecto de la
intensidad, distancia, población y viento.
`smoke_direction_deg`. La dirección meteorológica se interpreta como dirección de
origen y se invierte para estimar el desplazamiento del humo.

Es un modelo heurístico para el proyecto; no reemplaza una alerta oficial ni un
modelo físico de dispersión atmosférica.

Configurar `MS1_URL`, `MS2_URL`, `MS3_URL`, `REQUEST_TIMEOUT_MS` y `RISK_RADIUS_KM`.

Documentación OpenAPI/Swagger: `http://127.0.0.1:8084/docs` · JSON: `http://127.0.0.1:8084/openapi.json`.
