export type Role = 'CLIENT' | 'PARTNER' | 'ADMIN';
export type RoomType = 'STANDARD' | 'LUX' | 'FAMILY' | 'HOSTEL';
export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  bonusPoints: number;
  companyName: string | null;
  isBlocked: boolean;
  registeredAt: string;
}

export interface Hotel {
  id: number;
  name: string;
  city: string;
  address: string;
  stars: number;
  rating: number;
  description: string;
  lat: number;
  lng: number;
  amenities: string[] | null;
  hue: number;
  isActive: boolean;
}

export interface SearchHotel extends Hotel {
  minPrice: number;
  totalFrom: number;
  freeRooms: number;
}

export interface Room {
  id: number;
  roomNumber: string;
  type: RoomType;
  capacity: number;
  pricePerNight: number;
  amenities: string[] | null;
  hotelId: number;
}

export interface Payment {
  id: number;
  amount: number;
  status: 'CREATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  method: string;
  transactionId: string | null;
  createdAt: string;
}

export interface Booking {
  id: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  status: BookingStatus;
  basePrice: number;
  discount: number;
  totalPrice: number;
  promoCode: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  createdAt: string;
  roomId: number;
  room: Room & { hotel: Hotel };
  payments?: Payment[];
  client?: User;
}

const TOKEN_KEY = 'staybook_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('; ') : data?.message || `Помилка ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const qs = (o: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();

// ---------- форматування ----------
export const money = (n: number) => n.toLocaleString('uk-UA') + ' ₴';

export const fmtDate = (s: string) =>
  new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const ROOM_TYPES: Record<RoomType, string> = {
  STANDARD: 'Стандарт',
  LUX: 'Люкс',
  FAMILY: 'Сімейний',
  HOSTEL: 'Хостел (ліжко)',
};

export const STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Очікує оплати', cls: 'warn' },
  CONFIRMED: { label: 'Підтверджено', cls: 'ok' },
  CANCELLED: { label: 'Скасовано', cls: 'bad' },
  COMPLETED: { label: 'Завершено', cls: 'muted' },
};

export const nights = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ніч`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ночі`;
  return `${n} ночей`;
};

export function isoDate(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function plusDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
