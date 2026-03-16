import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { shopConfig } from '../config/shop';

export function useStock() {
  const [stockSummary, setStockSummary] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'menu'),
        where('shopId', '==', shopConfig.slug),
        orderBy('sortOrder')
      ),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const data = { id: doc.id, ...doc.data() };
          data.availableGrams = data.stockGrams - data.reservedGrams - data.soldGrams;
          return data;
        });
        setStockSummary(items);
      }
    );

    return unsubscribe;
  }, []);

  return stockSummary;
}
