import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs, SearchHotel } from '../api';
import { defaultSearch, HotelCard, SearchBar } from '../components';

interface SearchRes {
  nights: number;
  hotels: SearchHotel[];
  checkIn: string;
  checkOut: string;
}

export default function HomePage() {
  const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
  const [top, setTop] = useState<SearchRes | null>(null);
  const d = defaultSearch();

  useEffect(() => {
    api<{ city: string; count: number }[]>('/hotels/cities').then(setCities).catch(() => {});
    api<SearchRes>(`/hotels?${qs({ checkIn: d.checkIn, checkOut: d.checkOut, guests: 2, sort: 'rating' })}`)
      .then(setTop)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Знайдіть місце, до якого хочеться повертатися</h1>
          <p>Невеликі готелі та хостели України — напряму, без зайвих комісій.</p>
          <SearchBar />
        </div>
      </section>

      <section className="container section">
        <h2>Популярні напрямки</h2>
        <div className="city-grid">
          {cities.map((c, i) => (
            <Link
              key={c.city}
              to={`/search?${qs({ city: c.city, checkIn: d.checkIn, checkOut: d.checkOut, guests: 2 })}`}
              className="city-tile"
              style={{ background: `linear-gradient(135deg, hsl(${(i * 47 + 190) % 360} 50% 30%), hsl(${(i * 47 + 230) % 360} 55% 50%))` }}
            >
              <b>{c.city}</b>
              <span>
                {c.count} {c.count === 1 ? 'готель' : c.count < 5 ? 'готелі' : 'готелів'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Найвищий рейтинг гостей</h2>
          <Link to="/search">Усі готелі →</Link>
        </div>
        <div className="list">
          {top?.hotels.slice(0, 4).map((h) => (
            <HotelCard
              key={h.id}
              h={h}
              n={top.nights}
              link={`/hotels/${h.id}?${qs({ checkIn: top.checkIn, checkOut: top.checkOut, guests: 2 })}`}
            />
          ))}
        </div>
      </section>

      <section className="container section features">
        <div>
          <b>🔒 Чесна ціна</b>
          <p>Ціна в пошуку — це остаточна сума. Без прихованих зборів.</p>
        </div>
        <div>
          <b>⏱ Номер за вами</b>
          <p>Під час оплати номер блокується на 15 хвилин — ніхто його не перехопить.</p>
        </div>
        <div>
          <b>↩ Безкоштовне скасування</b>
          <p>Скасуйте до дати заїзду — гроші повернуться на картку.</p>
        </div>
        <div>
          <b>🏨 Для власників</b>
          <p>
            Комісія 10% замість 15–25% у великих агрегаторах. <Link to="/login?tab=register&role=PARTNER">Додати готель</Link>
          </p>
        </div>
      </section>
    </>
  );
}
