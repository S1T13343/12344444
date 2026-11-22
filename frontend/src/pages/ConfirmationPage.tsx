import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Booking, fmtDate, money, nights, ROOM_TYPES, STATUS } from '../api';
import { Spinner } from '../components';
import { useApp } from '../context';

export default function ConfirmationPage() {
  const { id } = useParams();
  const { refreshUser } = useApp();
  const [b, setB] = useState<Booking | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Booking>(`/bookings/${id}`).then(setB).catch((e) => setErr(e.message));
    refreshUser();
  }, [id, refreshUser]);

  if (err) return <div className="container page alert err">{err}</div>;
  if (!b) return <div className="container page"><Spinner /></div>;
  const paid = b.payments?.find((p) => p.status === 'SUCCESS');

  return (
    <div className="container page narrow-page">
      <div className="card confirm">
        <div className="confirm-icon">✓</div>
        <h1>Бронювання підтверджено!</h1>
        <p className="muted">
          Номер бронювання <b>#{b.id}</b>. Підтвердження надіслано на <b>{b.guestEmail}</b>.
        </p>
        <div className="kv"><span>Готель</span><b>{b.room.hotel.name}</b></div>
        <div className="kv"><span>Адреса</span><span>{b.room.hotel.address}, {b.room.hotel.city}</span></div>
        <div className="kv"><span>Номер</span><span>{ROOM_TYPES[b.room.type]} №{b.room.roomNumber}</span></div>
        <div className="kv"><span>Дати</span><span>{fmtDate(b.checkIn)} — {fmtDate(b.checkOut)} ({nights(b.nights)})</span></div>
        <div className="kv"><span>Гостей</span><span>{b.guests}</span></div>
        <div className="kv"><span>Статус</span><span className={`badge ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span></div>
        <div className="kv total"><span>Сплачено</span><b>{money(b.totalPrice)}</b></div>
        {paid && <div className="small muted">Транзакція: {paid.transactionId}</div>}
        <div className="actions">
          <Link className="btn primary" to="/my">Мої бронювання</Link>
          <Link className="btn ghost" to="/">На головну</Link>
        </div>
      </div>
    </div>
  );
}
