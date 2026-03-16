import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatHeader from '../components/chat/ChatHeader';
import ChatMessages from '../components/chat/ChatMessages';
import QuickReplies from '../components/chat/QuickReplies';
import WeightSelector from '../components/chat/WeightSelector';
import ChatInput from '../components/chat/ChatInput';
import useChatStore from '../stores/chatStore';
import { api } from '../lib/api';
import { shopConfig } from '../config/shop';

const CATEGORIES = [
  { value: 'chicken', label: '🐔 Chicken' },
  { value: 'mutton', label: '🐑 Mutton' },
  { value: 'fish', label: '🐟 Fish' },
  { value: 'eggs', label: '🥚 Eggs' },
];

export default function CustomerPage() {
  const navigate = useNavigate();
  const store = useChatStore();
  const [menu, setMenu] = useState([]);
  const [shopOpen, setShopOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showWeightSelector, setShowWeightSelector] = useState(false);

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

      store.addMessage({
        type: 'bot',
        text: `Here's our ${opt.label.replace(/^.+\s/, '')} selection:`,
      });
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
      if (opt.value === 'proceed') {
        store.addMessage({ type: 'user', text: 'Proceed to order' });
        store.addMessage({
          type: 'bot',
          text: 'Please share your delivery address. You can type it below.',
        });
        store.goToStep('ADDRESS_ENTRY');
        return;
      }
      if (opt.value === 'add_more') {
        store.addMessage({ type: 'user', text: 'Add more items' });
        store.addMessage({ type: 'bot', text: 'What else would you like?' });
        store.goToStep('WELCOME');
        return;
      }
    }

    if (step === 'PAYMENT_SELECT') {
      if (opt.value === 'cod') {
        await placeOrder('cod');
      }
    }
  }

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

    store.addMessage({ type: 'bot', text: cartText });
    store.goToStep('CART_REVIEW');
  }

  async function handleAddressInput(address) {
    store.addMessage({ type: 'user', text: address });
    store.setCustomerInfo({ ...(store.customerInfo || {}), address });

    store.addMessage({ type: 'bot', text: 'Calculating delivery charge...' });
    setLoading(true);

    try {
      // Use shop lat/lng as fallback location for now
      // In a real implementation, geocode the address first
      const quote = await api.getDeliveryQuote(
        store.customerInfo?.lat || shopConfig.lat + 0.01,
        store.customerInfo?.lng || shopConfig.lng + 0.01
      );

      if (!quote.withinZone) {
        store.addMessage({
          type: 'bot',
          text: 'Sorry, your address is outside our delivery zone (max 8 km). We cannot deliver there.',
        });
        setLoading(false);
        return;
      }

      store.setDeliveryQuote(quote);
      store.addMessage({
        type: 'bot',
        text: `Delivery charge: ₹${quote.charge} (${quote.distanceKm} km, ~${quote.durationMinutes} min)\n\nWould you like to pay COD? A ₹20 token advance is required to confirm your order.`,
      });
      store.goToStep('PAYMENT_SELECT');
    } catch {
      store.addMessage({
        type: 'bot',
        text: 'Could not calculate delivery charge. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

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
          name: customerInfo?.name || 'Customer',
          phone: customerInfo?.phone || '',
          address: customerInfo?.address || '',
          location: {
            lat: customerInfo?.lat || shopConfig.lat + 0.01,
            lng: customerInfo?.lng || shopConfig.lng + 0.01,
          },
        },
        items,
        payment: { method: paymentMethod },
        notes: '',
      });

      store.setOrderId(result.orderId);

      store.addMessage({
        type: 'order_card',
        order: {
          orderId: result.orderId,
          items: cart,
          pricing: result.pricing,
        },
      });

      if (result.tokenPaymentUrl) {
        store.addMessage({
          type: 'bot',
          text: `Order placed! Please pay ₹20 token advance to confirm:\n\n${result.tokenPaymentUrl}\n\nYour order will be processed once the token is paid.`,
        });
      } else {
        store.addMessage({
          type: 'bot',
          text: `Order placed successfully! Order ID: ${result.orderId}`,
        });
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

  function getQuickReplies() {
    const { step, selectedCategory } = store;

    if (!shopOpen) return [];

    if (step === 'WELCOME') {
      return getAvailableCategories();
    }

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
      return [
        { value: 'add_more', label: '+ Add more items' },
        { value: 'proceed', label: '✓ Proceed to order' },
      ];
    }

    if (step === 'PAYMENT_SELECT') {
      return [{ value: 'cod', label: '💵 Cash on Delivery (COD)' }];
    }

    if (step === 'ORDER_CONFIRM' && store.orderId) {
      return [{ value: 'track', label: '📦 Track order' }];
    }

    return [];
  }

  const replies = getQuickReplies();
  const showInput = store.step === 'ADDRESS_ENTRY';
  const showWeights = showWeightSelector && store.step === 'CUT_SELECTED' && store.selectedItem;

  function handleTrackOrder(opt) {
    if (opt.value === 'track' && store.orderId) {
      navigate(`/track/${store.orderId}`);
    } else {
      handleSelect(opt);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto">
      <ChatHeader shopName={shopConfig.name} isOpen={shopOpen} />
      <ChatMessages messages={store.messages} />

      {loading && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-[#FDF6EC]">Typing...</div>
      )}

      {showWeights && <WeightSelector item={store.selectedItem} onSelect={handleWeightSelect} />}
      {!showWeights && (
        <QuickReplies options={replies} onSelect={handleTrackOrder} disabled={loading} />
      )}
      <ChatInput
        onSend={handleAddressInput}
        disabled={!showInput}
        placeholder="Type your delivery address..."
      />
    </div>
  );
}
