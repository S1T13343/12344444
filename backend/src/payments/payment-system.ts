import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

export interface PaymentResult {
  ok: boolean;
  transactionId: string | null;
  error?: string;
}

export interface PayInput {
  amount: number; // грн
  currency: string;
  bookingId: number;
  paymentIntentId?: string; // Stripe
  cardNumber?: string; // тестова імітація
}

/** Інтерфейс ПлатіжнаСистема з діаграми класів */
export interface PaymentSystem {
  readonly mode: 'stripe' | 'mock';
  createIntent(amount: number, currency: string, bookingId: number): Promise<{ id: string; clientSecret: string } | null>;
  processPayment(input: PayInput): Promise<PaymentResult>;
  refund(transactionId: string, amount: number): Promise<boolean>;
}

export const PAYMENT_SYSTEM = Symbol('PAYMENT_SYSTEM');

/** Реальна інтеграція зі Stripe (PaymentIntents) */
export class StripePaymentSystem implements PaymentSystem {
  readonly mode = 'stripe' as const;
  private readonly stripe: Stripe;
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createIntent(amount: number, currency: string, bookingId: number) {
    const pi = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { bookingId: String(bookingId) },
      automatic_payment_methods: { enabled: true },
    });
    return { id: pi.id, clientSecret: pi.client_secret as string };
  }

  async processPayment(input: PayInput): Promise<PaymentResult> {
    if (!input.paymentIntentId) return { ok: false, transactionId: null, error: 'Немає paymentIntentId' };
    const pi = await this.stripe.paymentIntents.retrieve(input.paymentIntentId);
    const ok =
      pi.status === 'succeeded' &&
      pi.amount === Math.round(input.amount * 100) &&
      pi.metadata.bookingId === String(input.bookingId);
    return ok
      ? { ok: true, transactionId: pi.id }
      : { ok: false, transactionId: pi.id, error: `Платіж не підтверджено (статус ${pi.status})` };
  }

  async refund(transactionId: string, amount: number) {
    const r = await this.stripe.refunds.create({
      payment_intent: transactionId,
      amount: Math.round(amount * 100),
    });
    return r.status === 'succeeded' || r.status === 'pending';
  }
}

/**
 * Тестова імітація платіжної системи для локального запуску без ключів.
 * Поведінка як у тестових картках Stripe: 4000 0000 0000 0002 — відмова, решта валідних — успіх.
 */
@Injectable()
export class MockPaymentSystem implements PaymentSystem {
  readonly mode = 'mock' as const;
  private readonly log = new Logger('MockPay');

  async createIntent() {
    return null;
  }

  async processPayment(input: PayInput): Promise<PaymentResult> {
    const card = (input.cardNumber || '').replace(/\D/g, '');
    if (card.length < 12 || !luhn(card)) {
      return { ok: false, transactionId: null, error: 'Невірний номер картки' };
    }
    if (card === '4000000000000002') {
      return { ok: false, transactionId: null, error: 'Картку відхилено банком' };
    }
    const id = 'mock_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    this.log.log(`Оплата ${input.amount} ${input.currency} за бронювання #${input.bookingId}: ${id}`);
    return { ok: true, transactionId: id };
  }

  async refund(transactionId: string, amount: number) {
    this.log.log(`Повернення ${amount} грн по ${transactionId}`);
    return true;
  }
}

function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function paymentSystemFactory(): PaymentSystem {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new StripePaymentSystem(key) : new MockPaymentSystem();
}
