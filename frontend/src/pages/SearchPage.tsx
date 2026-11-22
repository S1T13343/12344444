import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, ROOM_TYPES, RoomType, SearchHotel } from '../api';
import { defaultSearch, Empty, HotelCard, SearchBar, Spinner } from '../components';

export interface SearchRes {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  count: number;
  hotels: SearchHotel[];
}

export function useSearch() {
  const [params, setParams] = useSearchParams();
  const [res, setRes] = useState<SearchRes | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = params.toString();

  useEffect(() => {
    setLoading(true);
    setError('');
    api<SearchRes>(`/hotels?${key}`)
      .then(setRes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [key]);

  const setFilter = (k: string, v: string | number | undefined) => {
    const p = new URLSearchParams(params);
    if (v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
    setParams(p, { replace: true });
  };
  return { params, res, error, loading, setFilter };
}

export function Filters({ params, setFilter }: { params: URLSearchParams; setFilter: (k: string, v?: string | number) => void }) {
  return (
    <aside className="filters card">
      <h3>Фільтри</h3>
      <label>
        Сортування
        <select value={params.get('sort') || 'rating'} onChange={(e) => setFilter('sort', e.target.value)}>
          <option value="rating">За рейтингом</option>
          <option value="price">Спочатку дешевші</option>
          <option value="-price">Спочатку дорожчі</option>
          <option value="stars">За зірками</option>
        </select>
      </label>
      <label>
        Ціна за ніч, ₴
        <div className="row2">
          <input type="number" placeholder="від" value={params.get('minPrice') || ''} onChange={(e) => setFilter('minPrice', e.target.value)} />
          <input type="number" placeholder="до" value={params.get('maxPrice') || ''} onChange={(e) => setFilter('maxPrice', e.target.value)} />
        </div>
      </label>
      <label>
        Зірковість
        <select value={params.get('stars') || ''} onChange={(e) => setFilter('stars', e.target.value)}>
          <option value="">Будь-яка</option>
          {[2, 3, 4, 5].map((s) => (
            <option key={s} value={s}>
              {s}★ і вище
            </option>
          ))}
        </select>
      </label>
      <label>
        Тип номера
        <select value={params.get('type') || ''} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">Будь-який</option>
          {(Object.keys(ROOM_TYPES) as RoomType[]).map((t) => (
            <option key={t} value={t}>
              {ROOM_TYPES[t]}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}

export default function SearchPage() {
  const { params, res, error, loading, setFilter } = useSearch();
  const init = defaultSearch(params);

  return (
    <div className="container page">
      <SearchBar key={params.toString()} initial={init} compact />
      <div className="search-layout">
        <Filters params={params} setFilter={setFilter} />
        <section>
          <div className="section-head">
            <h2>
              {init.city ? `${init.city}: ` : ''}
              {res ? `знайдено ${res.count}` : 'Пошук…'}
            </h2>
            <Link className="btn ghost sm" to={`/map?${params.toString()}`}>
              🗺 Показати на карті
            </Link>
          </div>
          {loading && <Spinner />}
          {error && <div className="alert err">{error}</div>}
          {!loading && res && !res.hotels.length && (
            <Empty title="Нічого не знайдено">
              <p>Спробуйте змінити дати, кількість гостей або прибрати фільтри.</p>
            </Empty>
          )}
          <div className="list">
            {!loading &&
              res?.hotels.map((h) => (
                <HotelCard
                  key={h.id}
                  h={h}
                  n={res.nights}
                  link={`/hotels/${h.id}?${qs({ checkIn: res.checkIn, checkOut: res.checkOut, guests: res.guests })}`}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
