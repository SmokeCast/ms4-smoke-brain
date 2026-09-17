const express = require('express');
const axios = require('axios');
const app = express();

// Endpoint de prueba: junta un incendio de Ms1 con las ciudades cercanas de Ms2
// Nota: Ms1 (localhost:8081) y Ms2 (localhost:8082) deben estar corriendo para que este endpoint funcione.
app.get('/api/risk/preview', async (req, res) => {
  try {
    const fires = await axios.get('http://localhost:8081/api/v1/fires?page=0&size=10');
    const firstFire = fires.data.content[0];

    // Obtener las ciudades cercanas al incendio
    const nearCities = await axios.get('http://localhost:8082/api/cities/near', {
      params: { lat: firstFire.centroidLat, lon: firstFire.centroidLon, radius_km: 150 }
    });

    res.json({
      fire: firstFire,
      nearby_cities: nearCities.data,
      note: 'Esqueleto Ms4 - la fórmula completa de riesgo prevista agregar para el Hito 2'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(8084, () => console.log('Ms4 (esqueleto) corriendo en 8084'));