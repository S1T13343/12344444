import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Booking, fmtDate, Hotel, money, Room, ROOM_TYPES, RoomType, STATUS } from '../api';
import { Empty, Spinner, Stars } from '../components';
import { useApp } from '../context';

interface Stats {
  bookings: number;
  cancelled: number;
  revenue: number;
  commission: number;
  payout: number;
  commissionPercent: number;
  currentGuests: number;
  upcoming: number;
  byMonth: { month: string; amount: number }[];
}
type HotelWithRooms = Hotel & { rooms: Room[] };

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div key={d.label} className="bar-col" title={money(d.value)}>
          <span className="bar-val">{d.value ? Math.round(d.value / 1000) + 'k' : ''}</span>
          <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const emptyHotel = { name: '', city: '', address: '', description: '', stars: 3, lat: 50.45, lng: 30.52, amenities: 'Wi-Fi, Сніданок' };
const emptyRoom = { roomNumber: '', type: 'STANDARD' as RoomType, capacity: 2, pricePerNight: 1500 };

/** Кабінет власника (Партнер) */
export default function OwnerPage() {
  const { toast } = useApp();
  const [tab, setTab] = useState<'dash' | 'hotels' | 'bookings'>('dash');
  const [stats, setStats] = useState<Stats | null>(null);
  const [hotels, setHotels] = useState<HotelWithRooms[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hotelForm, setHotelForm] = useState<(typeof emptyHotel & { id?: number }) | null>(null);
  const [roomForm, setRoomForm] = useState<{ hotelId: number; id?: number } & typeof emptyRoom | null>(null);

  const load = () => {
    api<Stats>('/partner/stats').then(setStats).catch((e) => toast(e.message, 'err'));
    api<HotelWithRooms[]>('/partner/hotels').then(setHotels).catch(() => {});
    api<Booking[]>('/partner/bookings').then(setBookings).catch(() => {});
  };
  useEffect(load, [toast]);

  const saveHotel = async (e: FormEvent) => {
    e.preventDefault();
    if (!hotelForm) return;
    const { id, amenities, ...rest } = hotelForm;
    const body = { ...rest, stars: Number(rest.stars), lat: Number(rest.lat), lng: Number(rest.lng), amenities: amenities.split(',').map((s) => s.trim()).filter(Boolean) };
    try {
      await api(id ? `/partner/hotels/${id}` : '/partner/hotels', { method: id ? 'PATCH' : 'POST', body });
      toast(id ? 'Готель оновлено' : 'Готель додано');
      setHotelForm(null);
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const saveRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomForm) return;
    const { hotelId, id, ...rest } = roomForm;
    const body = { ...rest, capacity: Number(rest.capacity), pricePerNight: Number(rest.pricePerNight) };
    try {
      await api(id ? `/partner/rooms/${id}` : `/partner/hotels/${hotelId}/rooms`, { method: id ? 'PATCH' : 'POST', body });
      toast('Номер збережено');
      setRoomForm(null);
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const deleteRoom = async (r: Room) => {
    if (!confirm(`Видалити номер ${r.roomNumber}?`)) return;
    try {
      await api(`/partner/rooms/${r.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div className="dash">
      <aside className="dash-nav">
        <b>Кабінет власника</b>
        <button className={tab === 'dash' ? 'active' : ''} onClick={() => setTab('dash')}>📊 Огляд</button>
        <button className={tab === 'hotels' ? 'active' : ''} onClick={() => setTab('hotels')}>🏨 Готелі та номери</button>
        <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>📅 Бронювання гостей</button>
      </aside>
      <div className="dash-main">
        {tab === 'dash' &&
          (stats ? (
            <>
              <h1>Огляд</h1>
              <div className="kpis">
                <div className="kpi"><span>Дохід</span><b>{money(stats.revenue)}</b></div>
                <div className="kpi"><span>До виплати (−{stats.commissionPercent}%)</span><b>{money(stats.payout)}</b></div>
                <div className="kpi"><span>Бронювань</span><b>{stats.bookings}</b></div>
                <div className="kpi"><span>Гостей зараз / майбутні</span><b>{stats.currentGuests} / {stats.upcoming}</b></div>
              </div>
              <div className="card">
                <h3>Дохід за місяцями (за датою заїзду)</h3>
                <BarChart data={stats.byMonth.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.amount }))} />
              </div>
            </>
          ) : (
            <Spinner />
          ))}

        {tab === 'hotels' && (
          <>
            <div className="section-head">
              <h1>Мої готелі</h1>
              <button className="btn primary" onClick={() => setHotelForm({ ...emptyHotel })}>+ Додати готель</button>
            </div>
            {hotelForm && (
              <form className="card form" onSubmit={saveHotel}>
                <h3>{hotelForm.id ? 'Редагувати готель' : 'Новий готель'}</h3>
                <div className="row2">
                  <label>Назва<input required value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })} /></label>
                  <label>Місто<input required value={hotelForm.city} onChange={(e) => setHotelForm({ ...hotelForm, city: e.target.value })} /></label>
                </div>
                <div className="row2">
                  <label>Адреса<input required value={hotelForm.address} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} /></label>
                  <label>Зірок<input type="number" min={1} max={5} value={hotelForm.stars} onChange={(e) => setHotelForm({ ...hotelForm, stars: Number(e.target.value) })} /></label>
                </div>
                <div className="row2">
                  <label>Широта<input type="number" step="any" value={hotelForm.lat} onChange={(e) => setHotelForm({ ...hotelForm, lat: Number(e.target.value) })} /></label>
                  <label>Довгота<input type="number" step="any" value={hotelForm.lng} onChange={(e) => setHotelForm({ ...hotelForm, lng: Number(e.target.value) })} /></label>
                </div>
                <label>Опис<textarea rows={3} value={hotelForm.description} onChange={(e) => setHotelForm({ ...hotelForm, description: e.target.value })} /></label>
                <label>Зручності (через кому)<input value={hotelForm.amenities} onChange={(e) => setHotelForm({ ...hotelForm, amenities: e.target.value })} /></label>
                <div className="actions">
                  <button className="btn primary">Зберегти</button>
                  <button type="button" className="btn ghost" onClick={() => setHotelForm(null)}>Скасувати</button>
                </div>
              </form>
            )}
            {!hotels.length && !hotelForm && <Empty title="Ви ще не додали жодного готелю" />}
            {hotels.map((h) => (
              <div key={h.id} className="card">
                <div className="section-head">
                  <div>
                    <h3>
                      <Link to={`/hotels/${h.id}`}>{h.name}</Link> <Stars n={h.stars} />
                    </h3>
                    <div className="small muted">{h.city}, {h.address} {!h.isActive && <span className="badge bad">вимкнено адміністратором</span>}</div>
                  </div>
                  <div className="actions">
                    <button className="btn ghost sm" onClick={() => setHotelForm({ id: h.id, name: h.name, city: h.city, address: h.address, description: h.description, stars: h.stars, lat: h.lat, lng: h.lng, amenities: (h.amenities ?? []).join(', ') })}>Редагувати</button>
                    <button className="btn primary sm" onClick={() => setRoomForm({ hotelId: h.id, ...emptyRoom })}>+ Номер</button>
                  </div>
                </div>
                {roomForm?.hotelId === h.id && (
                  <form className="form inline-form" onSubmit={saveRoom}>
                    <input placeholder="№" required value={roomForm.roomNumber} onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })} />
                    <select value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value as RoomType })}>
                      {(Object.keys(ROOM_TYPES) as RoomType[]).map((t) => <option key={t} value={t}>{ROOM_TYPES[t]}</option>)}
                    </select>
                    <input type="number" min={1} title="Місткість" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} />
                    <input type="number" min={1} title="Ціна за ніч" value={roomForm.pricePerNight} onChange={(e) => setRoomForm({ ...roomForm, pricePerNight: Number(e.target.value) })} />
                    <button className="btn primary sm">Зберегти</button>
                    <button type="button" className="btn ghost sm" onClick={() => setRoomForm(null)}>×</button>
                  </form>
                )}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>№</th><th>Тип</th><th>Місць</th><th>Ціна/ніч</th><th /></tr></thead>
                    <tbody>
                      {h.rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber)).map((r) => (
                        <tr key={r.id}>
                          <td>{r.roomNumber}</td>
                          <td>{ROOM_TYPES[r.type]}</td>
                          <td>{r.capacity}</td>
                          <td>{money(r.pricePerNight)}</td>
                          <td className="right">
                            <button className="link" onClick={() => setRoomForm({ hotelId: h.id, id: r.id, roomNumber: r.roomNumber, type: r.type, capacity: r.capacity, pricePerNight: r.pricePerNight })}>змінити</button>{' '}
                            <button className="link danger-text" onClick={() => deleteRoom(r)}>видалити</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'bookings' && (
          <>
            <h1>Бронювання гостей</h1>
            {!bookings.length ? (
              <Empty title="Бронювань ще немає" />
            ) : (
              <div className="card table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Гість</th><th>Готель / номер</th><th>Дати</th><th>Сума</th><th>Статус</th></tr></thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td>{b.id}</td>
                        <td>{b.guestName}<div className="small muted">{b.guestPhone || b.guestEmail}</div></td>
                        <td>{b.room.hotel.name}<div className="small muted">№{b.room.roomNumber}, {b.guests} гост.</div></td>
                        <td>{fmtDate(b.checkIn)} — {fmtDate(b.checkOut)}</td>
                        <td>{money(b.totalPrice)}</td>
                        <td><span className={`badge ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
