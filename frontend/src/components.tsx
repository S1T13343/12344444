import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isoDate, money, nights, plusDays, qs, SearchHotel } from './api';

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`${n} зірок`}>
      {'★'.repeat(n)}
      <span className="stars-off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function Rating({ value }: { value: number }) {
  const label = value >= 9 ? 'Чудово' : value >= 8.5 ? 'Дуже добре' : value >= 8 ? 'Добре' : 'Непогано';
  return (
    <span className="rating">
      <b>{value.toFixed(1)}</b> {label}
    </span>
  );
}

/** Обкладинка-заглушка готелю (градієнт + ініціали) */
export function Cover({ hue, name, className = '' }: { hue: number; name: string; className?: string }) {
  const initials = name
    .replace(/[«»"'’]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div
      className={`cover ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 60% 52%))`,
      }}
    >
      <span>{initials}</span>
    </div>
  );
}

export interface SearchValues {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function defaultSearch(p?: URLSearchParams): SearchValues {
  const ci = p?.get('checkIn') || plusDays(isoDate(new Date()), 1);
  return {
    city: p?.get('city') || '',
    checkIn: ci,
    checkOut: p?.get('checkOut') || plusDays(ci, 2),
    guests: Number(p?.get('guests') || 2),
  };
}

export function SearchBar({ initial, target = '/search', compact }: { initial?: SearchValues; target?: string; compact?: boolean }) {
  const nav = useNavigate();
  const [v, setV] = useState<SearchValues>(initial ?? defaultSearch());
  const today = isoDate(new Date());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`${target}?${qs({ ...v })}`);
  };

  return (
    <form className={`searchbar ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <label className="sb-field grow">
        <span>Куди</span>
        <input
          placeholder="Місто, напр. Львів"
          value={v.city}
          onChange={(e) => setV({ ...v, city: e.target.value })}
          list="cities"
        />
        <datalist id="cities">
          {['Київ', 'Львів', 'Одеса', 'Буковель', 'Харків', 'Ужгород'].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="sb-field">
        <span>Заїзд</span>
        <input
          type="date"
          min={today}
          value={v.checkIn}
          onChange={(e) => {
            const ci = e.target.value;
            setV({ ...v, checkIn: ci, checkOut: v.checkOut <= ci ? plusDays(ci, 1) : v.checkOut });
          }}
          required
        />
      </label>
      <label className="sb-field">
        <span>Виїзд</span>
        <input
          type="date"
          min={plusDays(v.checkIn, 1)}
          value={v.checkOut}
          onChange={(e) => setV({ ...v, checkOut: e.target.value })}
          required
        />
      </label>
      <label className="sb-field narrow">
        <span>Гості</span>
        <input
          type="number"
          min={1}
          max={10}
          value={v.guests}
          onChange={(e) => setV({ ...v, guests: Math.max(1, Number(e.target.value)) })}
        />
      </label>
      <button className="btn accent">Знайти</button>
    </form>
  );
}

export function HotelCard({
  h,
  n,
  link,
  active,
  onHover,
}: {
  h: SearchHotel;
  n: number;
  link: string;
  active?: boolean;
  onHover?: (id: number | null) => void;
}) {
  return (
    <Link
      to={link}
      className={`hotel-card ${active ? 'active' : ''}`}
      onMouseEnter={() => onHover?.(h.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Cover hue={h.hue} name={h.name} className="hotel-card-cover" />
      <div className="hotel-card-body">
        <div className="hotel-card-top">
          <div>
            <h3>{h.name}</h3>
            <Stars n={h.stars} />
            <div className="muted small">
              {h.city}, {h.address}
            </div>
          </div>
          <Rating value={h.rating} />
        </div>
        <p className="muted small clamp2">{h.description}</p>
        <div className="chips">
          {(h.amenities ?? []).slice(0, 4).map((a) => (
            <span key={a} className="chip">
              {a}
            </span>
          ))}
        </div>
        <div className="hotel-card-price">
          <span className="muted small">
            {nights(n)}, від {money(h.minPrice)}/ніч · вільно номерів: {h.freeRooms}
          </span>
          <b>{money(h.totalFrom)}</b>
        </div>
      </div>
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
