export enum Role {
  CLIENT = 'CLIENT',
  PARTNER = 'PARTNER',
  ADMIN = 'ADMIN',
}

/** СтатусБронювання */
export enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT', // ОЧІКУЄ_ОПЛАТИ
  CONFIRMED = 'CONFIRMED', // ПІДТВЕРДЖЕНО
  CANCELLED = 'CANCELLED', // СКАСОВАНО
  COMPLETED = 'COMPLETED', // ЗАВЕРШЕНО
}

/** СтатусПлатежу */
export enum PaymentStatus {
  CREATED = 'CREATED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

/** ТипНомера */
export enum RoomType {
  STANDARD = 'STANDARD',
  LUX = 'LUX',
  FAMILY = 'FAMILY',
  HOSTEL = 'HOSTEL',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
}

/** Скільки хвилин номер блокується на час оплати */
export const PAYMENT_LOCK_MINUTES = 15;
