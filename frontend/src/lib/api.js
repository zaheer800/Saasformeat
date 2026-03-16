const API_URL = import.meta.env.VITE_API_URL;

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.code = data.code;
    err.items = data.items;
    throw err;
  }

  return data;
}

export const api = {
  getMenu: () => request('/api/menu'),
  getShopConfig: () => request('/api/shop/config'),

  getDeliveryQuote: (customerLat, customerLng) =>
    request('/api/delivery/quote', {
      method: 'POST',
      body: { customerLat, customerLng },
    }),

  createOrder: (orderData) =>
    request('/api/orders', { method: 'POST', body: orderData }),

  getOrder: (orderId) => request(`/api/orders/${orderId}`),

  cancelOrder: (orderId, reason, cancelledBy) =>
    request(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      body: { reason, cancelledBy },
    }),

  // Admin endpoints
  getAdminOrders: (token) =>
    request('/api/orders/admin/orders', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateOrderStatus: (orderId, status, token) =>
    request(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status },
      headers: { Authorization: `Bearer ${token}` },
    }),

  assignOwnBoy: (orderId, deliveryBoyPhone, token) =>
    request('/api/delivery/assign-own-boy', {
      method: 'POST',
      body: { orderId, deliveryBoyPhone },
      headers: { Authorization: `Bearer ${token}` },
    }),

  toggleMenuItem: (itemId, token) =>
    request(`/api/menu/${itemId}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }),

  updateMenuPrice: (itemId, pricePerKg, token) =>
    request(`/api/menu/${itemId}/price`, {
      method: 'PATCH',
      body: { pricePerKg },
      headers: { Authorization: `Bearer ${token}` },
    }),

  restockMenu: (items, token) =>
    request('/api/menu/restock', {
      method: 'POST',
      body: { items },
      headers: { Authorization: `Bearer ${token}` },
    }),

  getStockSummary: (token) =>
    request('/api/menu/stock-summary', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  toggleShop: (token) =>
    request('/api/shop/toggle', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }),
};
