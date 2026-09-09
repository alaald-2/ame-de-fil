"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CartResponse } from "@ame-de-fil/types";
import { CartStore, EMPTY_CART } from "../lib/cart-store";
import type { AppLocale } from "../lib/locale";

interface CartContextValue {
  cart: CartResponse;
  isLoading: boolean;
  errorMessage: string | null;
  addItem: (variantId: string, quantity: number) => Promise<boolean>;
  updateQuantity: (itemId: string, quantity: number) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clearError: () => void;
  // Re-syncs from the server — used after checkout succeeds, since the API
  // clears the cart server-side as part of that transaction.
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const SERVER_SNAPSHOT = { cart: EMPTY_CART, isLoading: true, errorMessage: null };

// Talks to the API directly from the browser (credentials: "include" on the
// shared `api` client, ARCHITECTURE.md's cross-origin cookie setup) — never
// through this app's own server, so the guest-cart cookie the API sets is
// simply a normal cross-origin Set-Cookie the browser handles itself. No
// server-side cart reads exist in this checkpoint. State lives in a
// CartStore (see cart-store.ts) read via useSyncExternalStore, not
// component state set from a data-fetching effect.
export function CartProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const [store] = useState(() => new CartStore(locale));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      addItem: (variantId, quantity) => store.addItem(variantId, quantity),
      updateQuantity: (itemId, quantity) => store.updateQuantity(itemId, quantity),
      removeItem: (itemId) => store.removeItem(itemId),
      clearError: () => store.clearError(),
      refresh: () => store.refresh(),
    }),
    [state, store],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
