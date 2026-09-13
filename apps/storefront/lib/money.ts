export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyFormatError";
  }
}

export function formatPrice(price: string, currency: string): string {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    throw new MoneyFormatError(`Invalid price projection: ${price}`);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}
