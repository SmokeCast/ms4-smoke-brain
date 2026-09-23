const publicBasePath = (process.env.PUBLIC_BASE_PATH || '/').trim().replace(/\/+$/, '') || '/';

const spec = {
  openapi: '3.0.3', info: {title: 'MS4 — Smoke Brain API', version: '1.0.0', description: 'Calcula una evaluación heurística de exposición al humo combinando MS1, MS2 y MS3; MS2 aporta sitios sensibles por ciudad.'},
  servers: [{url: publicBasePath}],
  paths: {
    '/health': {get: {tags: ['Monitoreo'], summary: 'Estado del servicio', parameters: [{name: 'deep', in: 'query', schema: {type: 'boolean', default: false}}], responses: {'200': {description: 'Disponible'}, '503': {description: 'Dependencia degradada'}}}},
    '/api/v1/risk/preview': {get: {tags: ['Riesgo'], summary: 'Evalúa un incendio y sus ciudades expuestas', parameters: [{name: 'fire_id', in: 'query', schema: {type: 'integer', minimum: 1}}], responses: {'200': {description: 'Evaluación'}, '502': {description: 'Dependencia no disponible'}}}},
    '/api/v1/risk/{city_id}': {get: {tags: ['Riesgo'], summary: 'Obtiene la evaluación de una ciudad', parameters: [{name: 'city_id', in: 'path', required: true, schema: {type: 'integer', minimum: 1}}, {name: 'fire_id', in: 'query', schema: {type: 'integer', minimum: 1}}], responses: {'200': {description: 'Evaluación de riesgo'}, '404': {description: 'Evaluación no encontrada'}}}}
  }
};
const html = `<!doctype html><html><head><title>MS4 Swagger UI</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.10/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.11.10/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'openapi.json',dom_id:'#swagger-ui',deepLinking:true,presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset]})</script></body></html>`;
module.exports = { spec, html };
