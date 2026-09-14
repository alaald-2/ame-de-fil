import type { CartResponse } from "@ame-de-fil/types";
import { api } from "./api-client";
import { getErrorMessage } from "./error-message";
import { readCsrfCookie } from "./csrf";
import type { AppLocale } from "./locale";

export const EMPTY_CART: CartResponse = {
  cartId: null,
  items: [],
  itemCount: 0,
  subtotal: { amountMinor: 0, currency: "SEK" },
};

export interface CartState {
  cart: CartResponse;
  isLoading: boolean;
  errorMessage: string | null;
}

const INITIAL_STATE: CartState = { cart: EMPTY_CART, isLoading: true, errorMessage: null };

// An external store (react-hooks/set-state-in-effect's own sanctioned
// pattern: "subscribe for updates from some external system, calling
// setState in a callback function when external state changes") — the
// initial fetch and every mutation happen here, outside React's render/
// effect lifecycle entirely, and CartProvider just reads it via
// useSyncExternalStore. Avoids the classic "fetch in useEffect + setState"
// shape the adopted eslint-plugin-react-hooks ruleset flags.
//
// Every mutation sends an x-csrf-token header — harmless (and previously
// omitted) for a guest with no session at all (CsrfGuard's own
// @OptionalAuth() bypass), but required the moment a customer is signed in:
// these routes are @OptionalAuth(), not @Public(), so CsrfGuard enforces
// the double-submit check as soon as request.auth is populated from a real
// session cookie (csrf.guard.ts's own comment on exactly this bypass).
export class CartStore {
  private state: CartState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  // Bumped before every mutating request; a response only gets applied if
  // no newer request has been issued since. Without this, two overlapping
  // requests (e.g. editing one line item's quantity while removing another)
  // can resolve out of order — a slow update's response landing after a
  // fast remove's would silently revert the removal on screen.
  private requestVersion = 0;

  constructor(private readonly locale: AppLocale) {
    void this.refresh();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartState => this.state;

  private setState(partial: Partial<CartState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  async refresh(): Promise<void> {
    const version = ++this.requestVersion;
    const { data } = await api.GET("/api/v1/cart", { params: { query: { locale: this.locale } } });
    if (version !== this.requestVersion) return;
    this.setState({ cart: data ?? EMPTY_CART, isLoading: false });
  }

  async addItem(variantId: string, quantity: number): Promise<boolean> {
    const version = ++this.requestVersion;
    this.setState({ errorMessage: null });
    const { data, error } = await api.POST("/api/v1/cart/items", {
      params: { query: { locale: this.locale } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { variantId, quantity },
    });
    if (error) {
      if (version === this.requestVersion) {
        this.setState({ errorMessage: getErrorMessage(error, "Failed to add to cart") });
      }
      return false;
    }
    if (version === this.requestVersion) this.setState({ cart: data });
    return true;
  }

  async updateQuantity(itemId: string, quantity: number): Promise<boolean> {
    const version = ++this.requestVersion;
    this.setState({ errorMessage: null });
    const { data, error } = await api.PATCH("/api/v1/cart/items/{itemId}", {
      params: { path: { itemId }, query: { locale: this.locale } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { quantity },
    });
    if (error) {
      if (version === this.requestVersion) {
        this.setState({ errorMessage: getErrorMessage(error, "Failed to update quantity") });
      }
      return false;
    }
    if (version === this.requestVersion) this.setState({ cart: data });
    return true;
  }

  async removeItem(itemId: string): Promise<boolean> {
    const version = ++this.requestVersion;
    this.setState({ errorMessage: null });
    const { data, error } = await api.DELETE("/api/v1/cart/items/{itemId}", {
      params: { path: { itemId }, query: { locale: this.locale } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });
    if (error) {
      if (version === this.requestVersion) {
        this.setState({ errorMessage: getErrorMessage(error, "Failed to remove item") });
      }
      return false;
    }
    if (version === this.requestVersion) this.setState({ cart: data });
    return true;
  }

  clearError(): void {
    this.setState({ errorMessage: null });
  }
}
