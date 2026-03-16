import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { shopConfig } from '../config/shop';

export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'orders'),
        where('shopId', '==', shopConfig.slug),
        where('timestamps.createdAt', '>=', today),
        orderBy('timestamps.createdAt', 'desc')
      ),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrders(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribe;
  }, []);

  return { orders, loading };
}

export function useOrder(orderId) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    const ref = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setOrder({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [orderId]);

  return { order, loading };
}
