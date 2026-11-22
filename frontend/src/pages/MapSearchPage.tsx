import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { money, qs } from '../api';
import { defaultSearch, Rating, SearchBar, Spinner, Stars } from '../components';
import HotelMap from '../HotelMap';
import { useSearch } from './SearchPage';

/** Пошук з картою: список ліворуч, карта праворуч */
export default function MapSearchPage() {
  const { params, res, error, loading } = useSearch();
  const [active, setActive] = useState<number | null>(null);
  const init = defaultSearch(params);

  const link = (id: number) =>
    res ? `/hotels/${id}?${qs({ checkIn: res.checkIn, checkOut: res.checkOut, guests: res.guests })}` : `/hotels/${id}`;

  const points = useMemo(
    () => (res?.hotels ?? []).map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, title: h.name, price: h.minPrice, link: link(h.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [res],
  );

  return (
    <div className="container page">
      <SearchBar key={params.toString()} initial={init} target="/map" compact />
      <div className="map-layout">
        <div className="map-list">
          <div className="section-head">
            <h3>{res ? `${res.count} варіантів` : 'Пошук…'}</h3>
            <Link to={`/search?${params.toString()}`}>Списком →</Link>
          </div>
          {loading && <Spinner />}
          {error && <div className="alert err">{error}</div>}
          {res?.hotels.map((h) => (
            <Link
              key={h.id}
              to={link(h.id)}
              className={`map-item ${active === h.id ? 'active' : ''}`}
              onMouseEnter={() => setActive(h.id)}
              onMouseLeave={() => setActive(null)}
            >
              <div>
                <b>{h.name}</b>
                <div className="small muted">
                  <Stars n={h.stars} /> · {h.city}
                </div>
                <Rating value={h.rating} />
              </div>
              <div className="map-item-price">
                <small className="muted">від</small>
                <b>{money(h.minPrice)}</b>
              </div>
            </Link>
          ))}
        </div>
        <HotelMap points={points} activeId={active} height="calc(100vh - 230px)" />
      </div>
    </div>
  );
}
