const { Client } = require('@googlemaps/google-maps-services-js');
const client = new Client({});

const SHOP_LAT = parseFloat(process.env.SHOP_LAT);
const SHOP_LNG = parseFloat(process.env.SHOP_LNG);

const DELIVERY_SLABS = [
  { minKm: 0, maxKm: 2, charge: 20 },
  { minKm: 2, maxKm: 4, charge: 35 },
  { minKm: 4, maxKm: 6, charge: 50 },
  { minKm: 6, maxKm: 8, charge: 70 },
];

const MAX_DELIVERY_KM = 8;

async function getDeliveryCharge(customerLat, customerLng) {
  const response = await client.distancematrix({
    params: {
      origins: [`${SHOP_LAT},${SHOP_LNG}`],
      destinations: [`${customerLat},${customerLng}`],
      mode: 'driving',
      key: process.env.GOOGLE_MAPS_API_KEY,
    },
  });

  const element = response.data.rows[0].elements[0];

  if (element.status !== 'OK') {
    throw new Error('Could not calculate distance');
  }

  const distanceKm = element.distance.value / 1000;
  const durationMin = Math.ceil(element.duration.value / 60);

  if (distanceKm > MAX_DELIVERY_KM) {
    return { withinZone: false, distanceKm, charge: 0, durationMinutes: 0 };
  }

  const slab =
    DELIVERY_SLABS.find((s) => distanceKm >= s.minKm && distanceKm < s.maxKm) ||
    DELIVERY_SLABS[DELIVERY_SLABS.length - 1];

  return {
    withinZone: true,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: durationMin,
    charge: slab.charge,
  };
}

module.exports = { getDeliveryCharge };
