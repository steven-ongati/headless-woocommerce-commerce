export type OrderTimelineEntry = {
  at: string;
  type: string;
  message: string;
};

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
  total: string;
};

export type OrderView = {
  reference: string;
  status: string;
  amount: string;
  currency: string;
  email: string;
  holdExpiresAt: string;
  items: OrderItem[];
  timeline: OrderTimelineEntry[];
};

export type CheckoutResult = {
  order: OrderView;
  paymentMode: "simulator" | "stripe-test";
};
