import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Booking, fmtDate, money, nights, qs, ROOM_TYPES, STATUS } from '../api';
import { Cover, Empty, Spinner } from '../components';
import { useApp } from '../context';

interface Ticket {
  id: number;
  subject: string;
  text: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  answer: string | null;
  createdAt: string;
}

const TICKET: Record<Ticket['status'], string> = { OPEN: 'Відкрито', IN_PROGRESS: 'В роботі', CLOSED: 'Закрито' };

export default function MyBookingsPage() {
  const { user, toast, refreshUser } = useApp();
  const [list, setList] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState<'active' | 'past' | 'support'>('active');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [t, setT] = useState({ subject: '', text: '' });

  const load = () => {
    api<Booking[]>('/bookings/my').then(setList).catch((e) => toast(e.message, 'err'));
    api<Ticket[]>('/support/my').then(setTickets).catch(() => {});
  };
  useEffect(load, [toast]);

  const cancel = async (b: Booking) => {
    const paid = b.status === 'CONFIRMED';
    if (!confirm(`Скасувати бронювання #${b.id}?${paid ? `\nНа картку буде повернено ${money(b.totalPrice)}.` : ''}`)) return;
    try {
      await api(`/bookings/${b.id}/cancel`, { body: {} });
      toast(paid ? 'Бронювання скасовано, кошти повернуто' : 'Бронювання скасовано');
      load();
      refreshUser();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const sendTicket = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/support', { body: t });
      setT({ subject: '', text: '' });
      toast('Звернення надіслано');
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  if (!list) return <div className="container page"><Spinner /></div>;
  const active = list.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT');
  const past = list.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');
  const shown = tab === 'active' ? active : past;

  return (
    <div className="container page">
      <div className="section-head">
        <h1>Мої бронювання</h1>
        <span className="badge ok">🎁 {user?.bonusPoints ?? 0} бонусних балів</span>
      </div>
      <div className="tabs inline">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Актуальні ({active.length})
        </button>
        <button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>
          Історія ({past.length})
        </button>
        <button className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>
          Підтримка ({tickets.length})
        </button>
      </div>

      {tab !== 'support' && (
        <div className="list">
          {!shown.length && (
            <Empty title="Тут поки порожньо">
              <Link to="/search" className="btn primary">Знайти готель</Link>
            </Empty>
          )}
          {shown.map((b) => (
            <div key={b.id} className="booking card">
              <Cover hue={b.room.hotel.hue} name={b.room.hotel.name} className="booking-cover" />
              <div className="booking-body">
                <div className="section-head">
                  <div>
                    <Link to={`/hotels/${b.room.hotel.id}?${qs({ checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests })}`}>
                      <h3>{b.room.hotel.name}</h3>
                    </Link>
                    <div className="small muted">{b.room.hotel.city} · {ROOM_TYPES[b.room.type]} №{b.room.roomNumber} · #{b.id}</div>
                  </div>
                  <span className={`badge ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                </div>
                <div>
                  📅 {fmtDate(b.checkIn)} — {fmtDate(b.checkOut)} ({nights(b.nights)}) · 👤 {b.guests}
                </div>
                <div className="booking-foot">
                  <b>{money(b.totalPrice)}</b>
                  {b.payments?.some((p) => p.status === 'REFUNDED') && <span className="small muted">кошти повернуто</span>}
                  <div className="actions">
                    {b.status === 'PENDING_PAYMENT' && (
                      <Link className="btn accent sm" to={`/checkout?${qs({ roomId: b.roomId, checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests })}`}>
                        Оформити знову
                      </Link>
                    )}
                    {(b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT') && (
                      <button className="btn danger sm" onClick={() => cancel(b)}>
                        Скасувати
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'support' && (
        <div className="support-grid">
          <form className="card form" onSubmit={sendTicket}>
            <h3>Нове звернення</h3>
            <label>
              Тема
              <input required minLength={3} value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
            </label>
            <label>
              Повідомлення
              <textarea required minLength={5} rows={5} value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} />
            </label>
            <button className="btn primary">Надіслати</button>
          </form>
          <div className="list">
            {!tickets.length && <Empty title="Звернень ще немає" />}
            {tickets.map((x) => (
              <div key={x.id} className="card">
                <div className="section-head">
                  <b>{x.subject}</b>
                  <span className={`badge ${x.status === 'CLOSED' ? 'muted' : 'warn'}`}>{TICKET[x.status]}</span>
                </div>
                <p>{x.text}</p>
                {x.answer && <div className="alert info"><b>Відповідь підтримки:</b> {x.answer}</div>}
                <div className="small muted">{fmtDate(x.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
