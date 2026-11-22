import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, Booking, fmtDate, Hotel, money, nights, qs, Room, ROOM_TYPES } from '../api';
import { Spinner } from '../components';
import { useApp } from '../context';

interface Quote {
  room: Room & { hotel: Hotel };
  checkIn: string;
  checkOut: string;
  nights: number;
  basePrice: number;
  discount: number;
  totalPrice: number;
  promo: { code: string; name: string; discountPercent: number } | null;
  promoInvalid: boolean;
  available: boolean;
}

let stripePromise: Promise<Stripe | null> | null = null;

/** Оформлення бронювання: дані гостя → промокод → створення бронювання → оплата */
export default function CheckoutPage() {
  const [params] = useSearchParams();
  const { user, config, toast } = useApp();
  const nav = useNavigate();
  const [promo, setPromo] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [q, setQ] = useState<Quote | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [guest, setGuest] = useState({ guestName: user?.name ?? '', guestEmail: user?.email ?? '', guestPhone: user?.phone ?? '', comment: '' });

  const roomId = params.get('roomId');
  const checkIn = params.get('checkIn') ?? '';
  const checkOut = params.get('checkOut') ?? '';
  const guests = Number(params.get('guests') || 1);

  useEffect(() => {
    api<Quote>(`/bookings/quote?${qs({ roomId, checkIn, checkOut, promoCode: appliedPromo })}`)
      .then((r) => {
        setQ(r);
        if (r.promoInvalid) toast('Промокод недійсний', 'err');
      })
      .catch((e) => setErr(e.message));
  }, [roomId, checkIn, checkOut, appliedPromo, toast]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const b = await api<Booking>('/bookings', {
        body: { roomId: Number(roomId), checkIn, checkOut, guests, ...guest, promoCode: q?.promo?.code },
      });
      setBooking(b);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPaid = (b: Booking) => nav(`/bookings/${b.id}/done`);

  if (err && !q) return <div className="container page alert err">{err}</div>;
  if (!q) return <div className="container page"><Spinner /></div>;

  return (
    <div className="container page">
      <h1>Оформлення бронювання</h1>
      <div className="steps">
        <span className="done">1. Вибір номера</span>
        <span className={booking ? 'done' : 'current'}>2. Ваші дані</span>
        <span className={booking ? 'current' : ''}>3. Оплата</span>
      </div>
      <div className="checkout">
        <div>
          {!booking ? (
            <form className="card form" onSubmit={create}>
              <h3>Дані гостя</h3>
              <label>
                Ім'я та прізвище
                <input required minLength={2} value={guest.guestName} onChange={(e) => setGuest({ ...guest, guestName: e.target.value })} />
              </label>
              <div className="row2">
                <label>
                  Email для підтвердження
                  <input type="email" required value={guest.guestEmail} onChange={(e) => setGuest({ ...guest, guestEmail: e.target.value })} />
                </label>
                <label>
                  Телефон
                  <input value={guest.guestPhone} onChange={(e) => setGuest({ ...guest, guestPhone: e.target.value })} placeholder="+380…" />
                </label>
              </div>
              <label>
                Побажання до готелю
                <textarea rows={2} value={guest.comment} onChange={(e) => setGuest({ ...guest, comment: e.target.value })} />
              </label>
              {err && <div className="alert err">{err}</div>}
              {!q.available && <div className="alert err">На жаль, номер уже зайнятий на ці дати.</div>}
              <button className="btn accent big" disabled={busy || !q.available}>
                {busy ? 'Створюємо…' : 'Перейти до оплати'}
              </button>
              <p className="small muted">Номер буде заблоковано за вами на 15 хвилин, поки ви оплачуєте.</p>
            </form>
          ) : config.paymentMode === 'stripe' && config.stripePublishableKey ? (
            <StripePay booking={booking} pk={config.stripePublishableKey} onPaid={onPaid} />
          ) : (
            <MockPay booking={booking} onPaid={onPaid} />
          )}
        </div>

        <aside className="card summary">
          <h3>{q.room.hotel.name}</h3>
          <div className="small muted">{q.room.hotel.address}, {q.room.hotel.city}</div>
          <hr />
          <div className="kv"><span>Номер</span><b>{ROOM_TYPES[q.room.type]} №{q.room.roomNumber}</b></div>
          <div className="kv"><span>Заїзд</span><b>{fmtDate(q.checkIn)}</b></div>
          <div className="kv"><span>Виїзд</span><b>{fmtDate(q.checkOut)}</b></div>
          <div className="kv"><span>Гостей</span><b>{guests}</b></div>
          <hr />
          <div className="kv"><span>{money(q.room.pricePerNight)} × {nights(q.nights)}</span><span>{money(q.basePrice)}</span></div>
          {q.discount > 0 && (
            <div className="kv ok-text"><span>Знижка {q.promo?.code} (−{q.promo?.discountPercent}%)</span><span>−{money(q.discount)}</span></div>
          )}
          <div className="kv total"><span>До сплати</span><b>{money(q.totalPrice)}</b></div>
          {!booking && (
            <div className="promo">
              <input placeholder="Промокод" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
              <button type="button" className="btn ghost sm" onClick={() => setAppliedPromo(promo)}>
                Застосувати
              </button>
            </div>
          )}
          <p className="small muted">Спробуйте промокод WELCOME10</p>
        </aside>
      </div>
    </div>
  );
}

/** Тестова оплата (без ключів Stripe) */
function MockPay({ booking, onPaid }: { booking: Booking; onPaid: (b: Booking) => void }) {
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [exp, setExp] = useState('12/30');
  const [cvc, setCvc] = useState('123');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onPaid(await api<Booking>(`/bookings/${booking.id}/pay`, { body: { cardNumber: card } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={pay}>
      <h3>Оплата карткою</h3>
      <div className="alert info small">
        Тестовий режим: 4242 4242 4242 4242 — успішна оплата, 4000 0000 0000 0002 — відмова банку.
      </div>
      <label>
        Номер картки
        <input inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} required />
      </label>
      <div className="row2">
        <label>
          Термін дії
          <input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="ММ/РР" required />
        </label>
        <label>
          CVC
          <input value={cvc} onChange={(e) => setCvc(e.target.value)} maxLength={4} required />
        </label>
      </div>
      {err && <div className="alert err">{err}</div>}
      <button className="btn accent big" disabled={busy}>
        {busy ? 'Обробка платежу…' : `Сплатити ${money(booking.totalPrice)}`}
      </button>
      <Link className="small" to="/my">Оплатити пізніше</Link>
    </form>
  );
}

/** Оплата через Stripe Payment Element */
function StripePay({ booking, pk, onPaid }: { booking: Booking; pk: string; onPaid: (b: Booking) => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const stripe = useMemo(() => (stripePromise ??= loadStripe(pk)), [pk]);

  useEffect(() => {
    api<{ id: string; clientSecret: string }>(`/bookings/${booking.id}/payment-intent`, { body: {} })
      .then((r) => setSecret(r.clientSecret))
      .catch((e) => setErr(e.message));
  }, [booking.id]);

  if (err) return <div className="alert err">{err}</div>;
  if (!secret) return <Spinner />;
  return (
    <Elements stripe={stripe} options={{ clientSecret: secret, locale: 'auto' }}>
      <StripeForm booking={booking} onPaid={onPaid} />
    </Elements>
  );
}

function StripeForm({ booking, onPaid }: { booking: Booking; onPaid: (b: Booking) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr('');
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (error || !paymentIntent) {
      setErr(error?.message || 'Оплата не пройшла');
      setBusy(false);
      return;
    }
    try {
      onPaid(await api<Booking>(`/bookings/${booking.id}/pay`, { body: { paymentIntentId: paymentIntent.id } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={pay}>
      <h3>Оплата (Stripe)</h3>
      <PaymentElement />
      {err && <div className="alert err">{err}</div>}
      <button className="btn accent big" disabled={busy || !stripe}>
        {busy ? 'Обробка платежу…' : `Сплатити ${money(booking.totalPrice)}`}
      </button>
    </form>
  );
}
