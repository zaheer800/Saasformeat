/**
 * Tests for the chatStore Zustand store.
 *
 * We reset the store between tests to prevent state leakage.
 * The store contains no async logic, so no mocking needed.
 */

import useChatStore from '../../stores/chatStore';

// Reset store state before each test
beforeEach(() => {
  useChatStore.getState().reset();
});

describe('initial state', () => {
  test('starts at WELCOME step with empty cart', () => {
    const state = useChatStore.getState();
    expect(state.step).toBe('WELCOME');
    expect(state.cart).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.orderId).toBeNull();
  });
});

describe('addMessage', () => {
  test('appends a message with a unique id', () => {
    const { addMessage } = useChatStore.getState();
    addMessage({ role: 'bot', text: 'Hello!' });

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('bot');
    expect(messages[0].text).toBe('Hello!');
    expect(messages[0].id).toBeDefined();
  });

  test('appends multiple messages in order', () => {
    const { addMessage } = useChatStore.getState();
    addMessage({ role: 'bot', text: 'First' });
    addMessage({ role: 'user', text: 'Second' });

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('First');
    expect(messages[1].text).toBe('Second');
  });
});

describe('goToStep', () => {
  test('updates the current step', () => {
    useChatStore.getState().goToStep('CATEGORY_SELECTED');
    expect(useChatStore.getState().step).toBe('CATEGORY_SELECTED');
  });
});

describe('cart operations', () => {
  const CHICKEN = { menuItemId: 'chicken', name: 'Chicken', weight: 500, totalPrice: 200 };
  const MUTTON = { menuItemId: 'mutton', name: 'Mutton', weight: 300, totalPrice: 150 };

  test('addToCart adds items and assigns a cartId', () => {
    useChatStore.getState().addToCart(CHICKEN);
    const { cart } = useChatStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].name).toBe('Chicken');
    expect(cart[0].cartId).toBeDefined();
  });

  test('addToCart allows duplicate items (different cartIds)', () => {
    useChatStore.getState().addToCart(CHICKEN);
    useChatStore.getState().addToCart(CHICKEN);
    expect(useChatStore.getState().cart).toHaveLength(2);
  });

  test('removeFromCart removes only the matching cartId', () => {
    useChatStore.getState().addToCart(CHICKEN);
    useChatStore.getState().addToCart(MUTTON);
    const { cart } = useChatStore.getState();
    const chickenCartId = cart[0].cartId;

    useChatStore.getState().removeFromCart(chickenCartId);

    const updatedCart = useChatStore.getState().cart;
    expect(updatedCart).toHaveLength(1);
    expect(updatedCart[0].name).toBe('Mutton');
  });

  test('clearCart empties the cart', () => {
    useChatStore.getState().addToCart(CHICKEN);
    useChatStore.getState().clearCart();
    expect(useChatStore.getState().cart).toEqual([]);
  });

  test('cartTotal sums all item prices', () => {
    useChatStore.getState().addToCart(CHICKEN);
    useChatStore.getState().addToCart(MUTTON);
    expect(useChatStore.getState().cartTotal()).toBe(350);
  });

  test('cartTotal returns 0 for empty cart', () => {
    expect(useChatStore.getState().cartTotal()).toBe(0);
  });
});

describe('setters', () => {
  test('setCustomerInfo stores customer data', () => {
    const info = { name: 'Ravi', phone: '+919999999999', address: '123 St' };
    useChatStore.getState().setCustomerInfo(info);
    expect(useChatStore.getState().customerInfo).toEqual(info);
  });

  test('setDeliveryQuote stores quote', () => {
    const quote = { charge: 35, distanceKm: 3, withinZone: true };
    useChatStore.getState().setDeliveryQuote(quote);
    expect(useChatStore.getState().deliveryQuote).toEqual(quote);
  });

  test('setOrderId stores order ID', () => {
    useChatStore.getState().setOrderId('order-abc');
    expect(useChatStore.getState().orderId).toBe('order-abc');
  });
});

describe('reset', () => {
  test('restores initial state after modifications', () => {
    const store = useChatStore.getState();
    store.goToStep('CART_REVIEW');
    store.addToCart({ menuItemId: 'x', name: 'X', weight: 100, totalPrice: 50 });
    store.setOrderId('order-xyz');

    store.reset();

    const state = useChatStore.getState();
    expect(state.step).toBe('WELCOME');
    expect(state.cart).toEqual([]);
    expect(state.orderId).toBeNull();
  });
});
