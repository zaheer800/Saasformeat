import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ChatHeader from '../components/chat/ChatHeader';
import ChatMessages from '../components/chat/ChatMessages';
import QuickReplies from '../components/chat/QuickReplies';
import WeightSelector from '../components/chat/WeightSelector';
import ChatInput from '../components/chat/ChatInput';
import OfflineBanner from '../components/shared/OfflineBanner';
import useChatStore from '../stores/chatStore';
import { api } from '../lib/api';
import { shopConfig } from '../config/shop';

const MIN_ORDER = 150;

const CATEGORIES = [
  { value: 'chicken', label: '🐔 Chicken' },
  { value: 'mutton', label: '🐑 Mutton' },
  { value: 'fish', label: '🐟 Fish' },
  { value: 'eggs', label: '🥚 Eggs' },
];

// chat input modes
const INPUT_NONE = null;
const INPUT_NAME = 'name';
const INPUT_PHONE = 'phone';
const INPUT_ADDRESS = 'address';

export default function CustomerPage() {
  const navigate = useNavigate();
  const store = useChatStore();
  const [menu, setMenu] = useState([]);
  const [shopOpen, setShopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showWeightSelector, setShowWeightSelector] = useState(false);
  const [inputMode, setInputMode] = useState(INPUT_NONE);

  // Subscribe to shopConfig for live open/close updates
  useEffect(() => {
    const ref = doc(db, 'shopConfig', shopConfig.slug);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setShopOpen(snap.data().isOpen !== false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [menuData, configData] = await Promise.all([
          api.getMenu(),
          api.getShopConfig(),
        ]);
        setMenu(menuData);
        setShopOpen(configData.isOpen);
        store.reset();

        if (!configData.isOpen) {
          store.addMessage({
            type: 'bot',
            text: `${shopConfig.name} is currently closed. Please check back during working hours (${configData.workingHours?.open} – ${configData.workingHours?.close}).`,
          });
          return;
        }

        store.addMessage({
          type: 'bot',
          text: `Welcome to ${shopConfig.name}! 🥩\n\nWhat would you like to order today?`,
        });
        store.goToStep('WELCOME');
      } catch {
        store.addMessage({
          type: 'bot',
          text: 'Could not load the menu. Please refresh and try again.',
        });
      }
    }
    init();
  }, []);

  // ─── helpers ─────────────────────────────────────────────────────────────

  function getAvailableCategories() {
    const available = new Set(menu.filter((i) => i.isAvailable).map((i) => i.category));
    return CATEGORIES.filter((c) => available.has(c.value));
  }

  function getItemsForCategory(category) {
    return menu.filter((i) => i.category === category && i.isAvailable);
  }

  function getCartTotal() {
    return store.cart.reduce((sum, i) => sum + i.totalPrice, 0);
  }

  // ─── geolocation ─────────────────────────────────────────────────────────

  function getGPSLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('Location denied')),
        { timeout: 10000 }
      );
    });
  }

  // ─── chat FSM ─────────────────────────────────────────────────────────────

  async function handleSelect(opt) {
    if (loading) return;
    const { step } = store;

    if (step === 'WELCOME') {
      store.addMessage({ type: 'user', text: opt.label });
      store.setSelectedCategory(opt.value);

      const items = getItemsForCategory(opt.value);
      if (items.length === 0) {
        store.addMessage({ type: 'bot', text: 'Sorry, no items available in this category right now.' });
        return;
      }
      store.addMessage({ type: 'bot', text: `Here's our ${opt.label.replace(/^.+\s/, '')} selection:` });
      store.goToStep('CATEGORY_SELECTED');
      return;
    }

    if (step === 'CATEGORY_SELECTED') {
      const item = menu.find((i) => i.id === opt.value);
      if (!item) return;
      store.addMessage({ type: 'user', text: opt.label });
      store.setSelectedItem(item);

      if (item.cuts && item.cuts.length > 0) {
        store.addMessage({ type: 'bot', text: `How would you like your ${item.name} cut?` });
        store.goToStep('ITEM_SELECTED');
      } else {
        store.setSelectedCut(null);
        store.addMessage({ type: 'bot', text: `How much ${item.name} would you like?` });
        setShowWeightSelector(true);
        store.goToStep('CUT_SELECTED');
      }
      return;
    }

    if (step === 'ITEM_SELECTED') {
      store.addMessage({ type: 'user', text: opt.label });
      store.setSelectedCut(opt.value);
      store.addMessage({
        type: 'bot',
        text: `How much ${store.selectedItem.name} (${opt.label}) would you like?`,
      });
      setShowWeightSelector(true);
      store.goToStep('CUT_SELECTED');
      return;
    }

    if (step === 'WEIGHT_SELECTED') {
      if (opt.value === 'add_more') {
        store.addMessage({ type: 'user', text: 'Add more items' });
        store.addMessage({ type: 'bot', text: 'What else would you like?' });
        store.goToStep('WELCOME');
        return;
      }
      if (opt.value === 'view_cart') {
        showCart();
        return;
      }
    }

    if (step === 'CART_REVIEW') {
      if (opt.value === 'add_more') {
        store.addMessage({ type: 'user', text: 'Add more items' });
        store.addMessage({ type: 'bot', text: 'What else would you like?' });
        store.goToStep('WELCOME');
        return;
      }
      if (opt.value === 'proceed') {
        const total = getCartTotal();
        if (total < MIN_ORDER) {
          store.addMessage({
            type: 'bot',
            text: `Minimum order is ₹${MIN_ORDER}. Your cart is ₹${total}. Please add more items.`,
          });
          return;
        }
        store.addMessage({ type: 'user', text: 'Proceed to order' });
        store.addMessage({ type: 'bot', text: "What's your name?" });
        setInputMode(INPUT_NAME);
        store.goToStep('CUSTOMER_NAME');
        return;
      }
    }

    if (step === 'PAYMENT_SELECT') {
      if (opt.value === 'cod') {
        await placeOrder('cod');
      }
    }

    if (step === 'ORDER_CONFIRM' && opt.value === 'track') {
      navigate(`/track/${store.orderId}`);
    }
  }

  // ─── text input handler — routes to the right step ───────────────────────

  async function handleTextInput(text) {
    if (inputMode === INPUT_NAME) {
      store.addMessage({ type: 'user', text });
      store.setCustomerInfo({ ...(store.customerInfo || {}), name: text });
      store.addMessage({ type: 'bot', text: 'And your phone number? (10 digits)' });
      setInputMode(INPUT_PHONE);
      store.goToStep('CUSTOMER_PHONE');
      return;
    }

    if (inputMode === INPUT_PHONE) {
      const digits = text.replace(/\D/g, '');
      if (digits.length < 10) {
        store.addMessage({ type: 'bot', text: 'Please enter a valid 10-digit phone number.' });
        return;
      }
      store.addMessage({ type: 'user', text });
      store.setCustomerInfo({ ...(store.customerInfo || {}), phone: digits });

      store.addMessage({
        type: 'bot',
        text: 'Please share your delivery address.\n\nYou can tap the button below to share your live location, or type your address.',
      });
      setInputMode(INPUT_ADDRESS);
      store.goToStep('ADDRESS_ENTRY');
      return;
    }

    if (inputMode === INPUT_ADDRESS) {
      await handleAddressInput(text, null, null);
    }
  }

  // ─── GPS location share button ────────────────────────────────────────────

  async function handleShareLocation() {
    if (loading) return;
    store.addMessage({ type: 'user', text: '📍 Shared live location' });
    store.addMessage({ type: 'bot', text: 'Getting your location...' });
    setLoading(true);

    try {
      const coords = await getGPSLocation();
      await handleAddressInput(null, coords.lat, coords.lng);
    } catch {
      store.addMessage({
        type: 'bot',
        text: 'Could not get your location. Please type your address instead.',
      });
      setLoading(false);
    }
  }

  // ─── address + delivery quote ─────────────────────────────────────────────

  async function handleAddressInput(addressText, lat, lng) {
    if (addressText) {
      store.addMessage({ type: 'user', text: addressText });
    }

    const currentInfo = store.customerInfo || {};
    let resolvedLat = lat;
    let resolvedLng = lng;

    // If no GPS coords, try browser geolocation silently
    if (!resolvedLat || !resolvedLng) {
      try {
        const coords = await getGPSLocation();
        resolvedLat = coords.lat;
        resolvedLng = coords.lng;
      } catch {
        // Geolocation denied — use shop's area as rough fallback
        // The backend will still calculate based on actual coords if available
        resolvedLat = shopConfig.lat;
        resolvedLng = shopConfig.lng;
      }
    }

    store.setCustomerInfo({
      ...currentInfo,
      address: addressText || currentInfo.address || 'Live location',
      lat: resolvedLat,
      lng: resolvedLng,
    });

    store.addMessage({ type: 'bot', text: 'Calculating delivery charge...' });
    setLoading(true);
    setInputMode(INPUT_NONE);

    try {
      const quote = await api.getDeliveryQuote(resolvedLat, resolvedLng);

      if (!quote.withinZone) {
        store.addMessage({
          type: 'bot',
          text: 'Sorry, your address is outside our delivery zone (max 8 km). We cannot deliver there.',
        });
        setInputMode(INPUT_ADDRESS);
        setLoading(false);
        return;
      }

      store.setDeliveryQuote(quote);
      store.addMessage({
        type: 'bot',
        text: `Delivery charge: ₹${quote.charge} (${quote.distanceKm} km, ~${quote.durationMinutes} min)\n\nPayment method: COD only. A ₹20 token advance is required to confirm your order.`,
      });
      store.goToStep('PAYMENT_SELECT');
    } catch {
      store.addMessage({
        type: 'bot',
        text: 'Could not calculate delivery charge. Please try again.',
      });
      setInputMode(INPUT_ADDRESS);
    } finally {
      setLoading(false);
    }
  }

  // ─── weight selection ─────────────────────────────────────────────────────

  function handleWeightSelect(grams) {
    const { selectedItem, selectedCut } = store;
    if (!selectedItem) return;

    setShowWeightSelector(false);

    const cut = selectedItem.cuts?.find((c) => c.id === selectedCut);
    const pricePerKg = selectedItem.pricePerKg + (cut?.priceModifier || 0);
    const totalPrice = Math.round((grams / 1000) * pricePerKg);
    const label = grams >= 1000 ? `${grams / 1000} kg` : `${grams}g`;
    const cutLabel = cut ? ` (${cut.label})` : '';

    store.addMessage({ type: 'user', text: `${label} ${selectedItem.name}${cutLabel}` });

    store.addToCart({
      menuItemId: selectedItem.id,
      name: selectedItem.name,
      category: selectedItem.category,
      cut: selectedCut,
      cutLabel: cut?.label || '',
      weight: grams,
      pricePerKg,
      totalPrice,
    });

    const cartTotal = getCartTotal() + totalPrice;
    store.addMessage({
      type: 'bot',
      text: `Added! ${label} ${selectedItem.name}${cutLabel} — ₹${totalPrice}\n\nCart total: ₹${cartTotal}`,
    });

    store.goToStep('WEIGHT_SELECTED');
  }

  // ─── cart display ─────────────────────────────────────────────────────────

  function showCart() {
    const { cart } = store;
    const total = getCartTotal();

    store.addMessage({ type: 'user', text: 'View cart' });

    let cartText = 'Your cart:\n\n';
    cart.forEach((item, i) => {
      const w = item.weight >= 1000 ? `${item.weight / 1000} kg` : `${item.weight}g`;
      const cut = item.cutLabel ? ` (${item.cutLabel})` : '';
      cartText += `${i + 1}. ${item.name}${cut} — ${w} — ₹${item.totalPrice}\n`;
    });
    cartText += `\nTotal: ₹${total}`;

    if (total < MIN_ORDER) {
      cartText += `\n\n⚠ Minimum order is ₹${MIN_ORDER}. Please add ₹${MIN_ORDER - total} more.`;
    }

    store.addMessage({ type: 'bot', text: cartText });
    store.goToStep('CART_REVIEW');
  }

  // ─── place order ──────────────────────────────────────────────────────────

  async function placeOrder(paymentMethod) {
    const { cart, customerInfo, deliveryQuote } = store;
    store.addMessage({ type: 'user', text: 'Cash on Delivery (COD)' });
    store.addMessage({ type: 'bot', text: 'Placing your order...' });
    setLoading(true);

    try {
      const items = cart.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        cut: item.cut,
        weight: item.weight,
        pricePerKg: item.pricePerKg,
        totalPrice: item.totalPrice,
      }));

      const result = await api.createOrder({
        customer: {
          name: customerInfo.name,
          phone: customerInfo.phone,
          address: customerInfo.address,
          location: {
            lat: customerInfo.lat,
            lng: customerInfo.lng,
          },
        },
        items,
        payment: { method: paymentMethod },
        notes: '',
      });

      store.setOrderId(result.orderId);

      store.addMessage({
        type: 'order_card',
        order: { orderId: result.orderId, items: cart, pricing: result.pricing },
      });

      if (result.tokenPaymentUrl) {
        store.addMessage({
          type: 'bot',
          text: `Order placed! Please pay ₹20 token advance to confirm:\n\n${result.tokenPaymentUrl}\n\nYour order will be processed once the token is paid.`,
        });
      } else {
        store.addMessage({ type: 'bot', text: `Order placed! ID: ${result.orderId}` });
      }

      store.goToStep('ORDER_CONFIRM');
    } catch (err) {
      store.addMessage({
        type: 'bot',
        text: err.message || 'Failed to place order. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  // ─── quick replies ────────────────────────────────────────────────────────

  function getQuickReplies() {
    const { step, selectedCategory } = store;
    if (!shopOpen) return [];

    if (step === 'WELCOME') return getAvailableCategories();

    if (step === 'CATEGORY_SELECTED') {
      return getItemsForCategory(selectedCategory).map((item) => ({
        value: item.id,
        label: `${item.name} — ₹${item.pricePerKg}/kg`,
      }));
    }

    if (step === 'ITEM_SELECTED') {
      return (store.selectedItem?.cuts || []).map((cut) => ({
        value: cut.id,
        label: `${cut.label}${cut.priceModifier !== 0 ? ` (${cut.priceModifier > 0 ? '+' : ''}₹${cut.priceModifier}/kg)` : ''}`,
      }));
    }

    if (step === 'WEIGHT_SELECTED') {
      return [
        { value: 'add_more', label: '+ Add more items' },
        { value: 'view_cart', label: `🛒 View cart (₹${getCartTotal()})` },
      ];
    }

    if (step === 'CART_REVIEW') {
      const total = getCartTotal();
      return [
        { value: 'add_more', label: '+ Add more items' },
        {
          value: 'proceed',
          label: '✓ Proceed to order',
          disabled: total < MIN_ORDER,
        },
      ];
    }

    if (step === 'ADDRESS_ENTRY') {
      return [{ value: 'gps', label: '📍 Share my location' }];
    }

    if (step === 'PAYMENT_SELECT') {
      return [{ value: 'cod', label: '💵 Cash on Delivery (COD)' }];
    }

    if (step === 'ORDER_CONFIRM' && store.orderId) {
      return [{ value: 'track', label: '📦 Track order' }];
    }

    return [];
  }

  function handleQuickReply(opt) {
    if (opt.value === 'gps') {
      handleShareLocation();
    } else {
      handleSelect(opt);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────

  const replies = getQuickReplies();
  const showWeights = showWeightSelector && store.step === 'CUT_SELECTED' && store.selectedItem;
  const showTextInput = inputMode !== INPUT_NONE;
  const inputPlaceholder =
    inputMode === INPUT_NAME ? 'Your name...' :
    inputMode === INPUT_PHONE ? 'Phone number...' :
    'Type your address...';

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto">
      <OfflineBanner />
      <ChatHeader shopName={shopConfig.name} isOpen={shopOpen} />
      <ChatMessages messages={store.messages} />

      {loading && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-[#FDF6EC]">Typing...</div>
      )}

      {showWeights && <WeightSelector item={store.selectedItem} onSelect={handleWeightSelect} />}
      {!showWeights && (
        <QuickReplies options={replies} onSelect={handleQuickReply} disabled={loading} />
      )}
      <ChatInput
        onSend={handleTextInput}
        disabled={!showTextInput || loading}
        placeholder={inputPlaceholder}
      />
    </div>
  );
}
