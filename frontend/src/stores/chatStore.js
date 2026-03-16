import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  messages: [],
  step: 'WELCOME',
  cart: [],
  selectedCategory: null,
  selectedItem: null,
  selectedCut: null,
  selectedWeight: null,
  customerInfo: null,
  deliveryQuote: null,
  orderId: null,

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, id: Date.now() + Math.random() }],
    })),

  goToStep: (step) => set({ step }),

  addToCart: (item) =>
    set((state) => ({
      cart: [...state.cart, { ...item, cartId: Date.now() + Math.random() }],
    })),

  removeFromCart: (cartId) =>
    set((state) => ({
      cart: state.cart.filter((i) => i.cartId !== cartId),
    })),

  clearCart: () => set({ cart: [] }),

  setCustomerInfo: (info) => set({ customerInfo: info }),
  setDeliveryQuote: (quote) => set({ deliveryQuote: quote }),
  setOrderId: (id) => set({ orderId: id }),
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSelectedCut: (cut) => set({ selectedCut: cut }),
  setSelectedWeight: (w) => set({ selectedWeight: w }),

  cartTotal: () => {
    const { cart } = get();
    return cart.reduce((sum, i) => sum + i.totalPrice, 0);
  },

  reset: () =>
    set({
      messages: [],
      step: 'WELCOME',
      cart: [],
      selectedCategory: null,
      selectedItem: null,
      selectedCut: null,
      selectedWeight: null,
      customerInfo: null,
      deliveryQuote: null,
      orderId: null,
    }),
}));

export default useChatStore;
