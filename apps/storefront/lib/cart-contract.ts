export type StoredCartLine = {
  sku: string;
  quantity: number;
  name: string;
  capturedPrice: string;
  currency: string;
  capturedAt: string;
};

export type StoredCart = {
  id: string;
  lines: StoredCartLine[];
  updatedAt: string;
};

export type CartLineView = StoredCartLine & {
  currentPrice: string | null;
  priceChanged: boolean;
  available: boolean;
};

export type CartView = {
  id: string;
  lines: CartLineView[];
  itemCount: number;
  subtotal: string;
  currency: string;
  updatedAt: string;
};
