export const shopConfig = {
  name: import.meta.env.VITE_SHOP_NAME,
  slug: import.meta.env.VITE_SHOP_SLUG,
  phone: import.meta.env.VITE_SHOP_PHONE,
  lat: parseFloat(import.meta.env.VITE_SHOP_LAT),
  lng: parseFloat(import.meta.env.VITE_SHOP_LNG),
};
