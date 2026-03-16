// Shop config loaded from environment variables.
// Matches the ShopConfig schema from 01-architecture.md.

const shopConfig = {
  id: process.env.SHOP_SLUG,
  name: process.env.SHOP_NAME,
  slug: process.env.SHOP_SLUG,
  phone: process.env.SHOP_PHONE,
  address: process.env.SHOP_ADDRESS,
  location: {
    lat: parseFloat(process.env.SHOP_LAT),
    lng: parseFloat(process.env.SHOP_LNG),
  },
  deliveryZoneKm: 8,
  minOrderValue: 150,
  cod: {
    enabled: true,
    maxDistanceKm: 5,
    tokenAmount: 20,
  },
  cancellation: {
    freeCancelWindowMinutes: 2,
    cancellationFee: 50,
  },
  workingHours: {
    open: '07:00',
    close: '20:00',
  },
};

function isShopOpen(manualOverride = true) {
  if (!manualOverride) return false;

  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${hh}:${mm}`;

  return (
    currentTime >= shopConfig.workingHours.open &&
    currentTime < shopConfig.workingHours.close
  );
}

module.exports = { shopConfig, isShopOpen };
