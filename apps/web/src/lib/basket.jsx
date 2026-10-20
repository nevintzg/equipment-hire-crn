import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The hire basket: items plus the hire window. Kept in localStorage as a
 * per-browser convenience only — prices are always re-quoted by the server,
 * and the server re-prices again when the booking is submitted.
 */
const KEY = 'eqhire.basket.v1';
const BasketContext = createContext(null);

const empty = {
  items: [],
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '17:00',
  pickupLocationId: '',
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

export function BasketProvider({ children }) {
  const [basket, setBasket] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(basket));
    } catch {
      /* private mode — the basket just will not survive a reload */
    }
  }, [basket]);

  const value = useMemo(() => {
    const setItem = (item, quantity) =>
      setBasket((b) => {
        const rest = b.items.filter((i) => i.equipmentId !== item.equipmentId);
        if (quantity <= 0) return { ...b, items: rest };
        const existing = b.items.find((i) => i.equipmentId === item.equipmentId);
        const next = { ...existing, ...item, quantity };
        return {
          ...b,
          items: existing
            ? b.items.map((i) => (i.equipmentId === item.equipmentId ? next : i))
            : [...b.items, next],
        };
      });
    return {
      ...basket,
      count: basket.items.reduce((n, i) => n + i.quantity, 0),
      add: (item, qty = 1) => {
        const current = basket.items.find((i) => i.equipmentId === item.equipmentId)?.quantity ?? 0;
        setItem(item, current + qty);
      },
      setQuantity: (equipmentId, qty) => setItem({ equipmentId }, qty),
      remove: (equipmentId) => setItem({ equipmentId }, 0),
      setWindow: (patch) => setBasket((b) => ({ ...b, ...patch })),
      clear: () => setBasket(empty),
      has: (equipmentId) => basket.items.some((i) => i.equipmentId === equipmentId),
    };
  }, [basket]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export const useBasket = () => useContext(BasketContext);
