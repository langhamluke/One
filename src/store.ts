export type RentalStatus = 'awaiting_payment' | 'paid' | 'payment_failed';

export interface Rental {
  checkoutSessionId: string;
  status: RentalStatus;
  season: string;
  customerId: string | null;
  paymentIntentId: string | null;
  // Saved card used for off-session damage/late-fee charges.
  paymentMethodId: string | null;
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
  children: { packageLookupKey: string; ageBracket: string; size: string }[];
  updatedAt: string;
}

// Persistence boundary. Swap InMemoryRentalStore for your database (e.g. a
// Base44 "Rental" entity) keyed on checkoutSessionId.
export interface RentalStore {
  get(checkoutSessionId: string): Promise<Rental | undefined>;
  put(rental: Rental): Promise<void>;
}

export class InMemoryRentalStore implements RentalStore {
  private readonly rentals = new Map<string, Rental>();

  async get(id: string) {
    return this.rentals.get(id);
  }

  async put(rental: Rental) {
    this.rentals.set(rental.checkoutSessionId, rental);
  }
}
