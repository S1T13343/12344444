import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, Hotel, money, nights, qs, Room, ROOM_TYPES } from '../api';
import { Cover, defaultSearch, Rating, SearchBar, Spinner, Stars } from '../components';
import HotelMap from '../HotelMap';

interface HotelDetails extends Hotel {
  rooms: (Room & { available: boolean; fitsGuests: boolean; total: number })[];
  ownerName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export default function HotelPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [h, setH] = useState<HotelDetails | null>(null);
  const [error, setError] = useState('');
  const s = defaultSearch(params);

  useEffect(() => {
    setH(null);
    api<HotelDetails>(`/hotels/${id}?${qs({ checkIn: s.checkIn, checkOut: s.checkOut, guests: s.guests })}`)
      .then(setH)
      .catch((e) => setError(e.message));
  }, [id, s.checkIn, s.checkOut, s.guests]);

  if (error) return <div className="container page alert err">{error}</div>;
  if (!h) return <div className="container page"><Spinner /></div>;

  const book = (roomId: number) =>
    nav(`/checkout?${qs({ roomId, checkIn: h.checkIn, checkOut: h.checkOut, guests: s.guests })}`);

  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Головна</Link> / <Link to={`/search?${qs({ city: h.city, checkIn: h.checkIn, checkOut: h.checkOut, guests: s.guests })}`}>{h.city}</Link> / {h.name}
      </div>
      <div className="hotel-hero">
        <Cover hue={h.hue} name={h.name} className="hotel-hero-cover" />
        <div className="hotel-hero-info">
          <Stars n={h.stars} />
          <h1>{h.name}</h1>
          <p className="muted">📍 {h.address}, {h.city}</p>
          <Rating value={h.rating} />
          <p>{h.description}</p>
          <div className="chips">
            {(h.amenities ?? []).map((a) => (
              <span key={a} className="chip">
                ✓ {a}
              </span>
            ))}
          </div>
          <p className="small muted">Власник: {h.ownerName}</p>
        </div>
      </div>

      <h2 className="mt">Вільні номери</h2>
      <p className="muted">
        {fmtDate(h.checkIn)} — {fmtDate(h.checkOut)}, {nights(h.nights)}, гостей: {s.guests}
      </p>
      <SearchBar
        key={params.toString()}
        initial={{ ...s, city: h.city }}
        target={`/hotels/${h.id}`}
        compact
      />

      <div className="rooms">
        {h.rooms.map((r) => {
          const can = r.available && r.fitsGuests;
          return (
            <div key={r.id} className={`room card ${can ? '' : 'disabled'}`}>
              <div>
                <h3>
                  {ROOM_TYPES[r.type]} <span className="muted small">№{r.roomNumber}</span>
                </h3>
                <div className="small muted">👤 до {r.capacity} гостей</div>
                {!r.available && <span className="badge bad">Зайнято на ці дати</span>}
                {r.available && !r.fitsGuests && <span className="badge warn">Замало місць</span>}
              </div>
              <div className="room-price">
                <div className="small muted">{money(r.pricePerNight)} / ніч</div>
                <b>{money(r.total)}</b>
                <button className="btn primary" disabled={!can} onClick={() => book(r.id)}>
                  Забронювати
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt">Розташування</h2>
      <HotelMap points={[{ id: h.id, lat: h.lat, lng: h.lng, title: h.name }]} height={320} zoom={15} />
    </div>
  );
}
