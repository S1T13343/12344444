import { FormEvent, useEffect, useState } from 'react';
import { api, Booking, fmtDate, isoDate, money, plusDays, qs, STATUS, User } from '../api';
import { Spinner } from '../components';
import { useApp } from '../context';

interface Report {
  periodStart: string;
  periodEnd: string;
  payments: number;
  refunds: number;
  refundedAmount: number;
  totalRevenue: number;
  commissionPercent: number;
  commission: number;
}
interface Stats {
  users: number;
  partners: number;
  hotels: number;
  bookings: number;
  openTickets: number;
  last30: Report;
}
interface AdminHotel {
  id: number;
  name: string;
  city: string;
  stars: number;
  isActive: boolean;
  ownerName: string;
  rooms: number;
}
interface Promo {
  id: number;
  name: string;
  promoCode: string;
  discountPercent: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
interface Ticket {
  id: number;
  subject: string;
  text: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  answer: string | null;
  createdAt: string;
  client: User;
}
interface Health {
  status: string;
  db: { ok: boolean; type: string };
  cache: { ok: boolean; mode: string };
  payments: string;
  mail: string;
  uptimeSec: number;
}

type Tab = 'stats' | 'users' | 'hotels' | 'bookings' | 'promos' | 'support' | 'report';
const ROLE: Record<string, string> = { CLIENT: 'Клієнт', PARTNER: 'Партнер', ADMIN: 'Адмін' };

export default function AdminPage() {
  const { toast } = useApp();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const today = isoDate(new Date());
  const [period, setPeriod] = useState({ from: plusDays(today, -30), to: today });
  const [report, setReport] = useState<Report | null>(null);
  const [promoForm, setPromoForm] = useState({ name: '', promoCode: '', discountPercent: 10, startDate: today, endDate: plusDays(today, 30) });

  const err = (e: Error) => toast(e.message, 'err');
  const load = () => {
    if (tab === 'stats') {
      api<Stats>('/admin/stats').then(setStats).catch(err);
      api<Health>('/health').then(setHealth).catch(err);
    }
    if (tab === 'users') api<User[]>('/admin/users').then(setUsers).catch(err);
    if (tab === 'hotels') api<AdminHotel[]>('/admin/hotels').then(setHotels).catch(err);
    if (tab === 'bookings') api<Booking[]>('/admin/bookings').then(setBookings).catch(err);
    if (tab === 'promos') api<Promo[]>('/admin/promotions').then(setPromos).catch(err);
    if (tab === 'support') api<Ticket[]>('/admin/support').then(setTickets).catch(err);
    if (tab === 'report') api<Report>(`/admin/report?${qs(period)}`).then(setReport).catch(err);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab]);

  const patch = async (path: string, body: unknown, msg: string) => {
    try {
      await api(path, { method: 'PATCH', body });
      toast(msg);
      load();
    } catch (e) {
      err(e as Error);
    }
  };

  const createPromo = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/admin/promotions', { body: { ...promoForm, discountPercent: Number(promoForm.discountPercent) } });
      toast('Акцію створено');
      setPromoForm({ ...promoForm, name: '', promoCode: '' });
      load();
    } catch (e) {
      err(e as Error);
    }
  };

  const tabs: [Tab, string][] = [
    ['stats', '📊 Огляд'],
    ['users', '👥 Користувачі'],
    ['hotels', '🏨 Готелі'],
    ['bookings', '📅 Бронювання'],
    ['promos', '🏷 Акції'],
    ['support', '💬 Підтримка'],
    ['report', '💰 Фінансовий звіт'],
  ];

  return (
    <div className="dash">
      <aside className="dash-nav dark">
        <b>Адмін-панель</b>
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </aside>
      <div className="dash-main">
        {tab === 'stats' &&
          (stats ? (
            <>
              <h1>Огляд платформи</h1>
              <div className="kpis">
                <div className="kpi"><span>Клієнтів</span><b>{stats.users}</b></div>
                <div className="kpi"><span>Партнерів</span><b>{stats.partners}</b></div>
                <div className="kpi"><span>Готелів</span><b>{stats.hotels}</b></div>
                <div className="kpi"><span>Оплачених бронювань</span><b>{stats.bookings}</b></div>
                <div className="kpi"><span>Оборот за 30 днів</span><b>{money(stats.last30.totalRevenue)}</b></div>
                <div className="kpi"><span>Комісія за 30 днів</span><b>{money(stats.last30.commission)}</b></div>
                <div className="kpi"><span>Відкритих звернень</span><b>{stats.openTickets}</b></div>
              </div>
              {health && (
                <div className="card">
                  <h3>Стан системи (моніторинг)</h3>
                  <div className="kv"><span>База даних</span><span className={`badge ${health.db.ok ? 'ok' : 'bad'}`}>{health.db.type} · {health.db.ok ? 'OK' : 'збій'}</span></div>
                  <div className="kv"><span>Кеш / блокування</span><span className={`badge ${health.cache.ok ? 'ok' : 'bad'}`}>{health.cache.mode} · {health.cache.ok ? 'OK' : 'збій'}</span></div>
                  <div className="kv"><span>Платіжна система</span><span className="badge muted">{health.payments}</span></div>
                  <div className="kv"><span>Пошта</span><span className="badge muted">{health.mail}</span></div>
                  <div className="kv"><span>Аптайм</span><span>{Math.floor(health.uptimeSec / 60)} хв</span></div>
                </div>
              )}
            </>
          ) : (
            <Spinner />
          ))}

        {tab === 'users' && (
          <>
            <h1>Користувачі</h1>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>#</th><th>Ім'я</th><th>Email</th><th>Роль</th><th>Бали</th><th>Статус</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.name}{u.companyName && <div className="small muted">{u.companyName}</div>}</td>
                      <td>{u.email}</td>
                      <td>{ROLE[u.role]}</td>
                      <td>{u.bonusPoints}</td>
                      <td>{u.isBlocked ? <span className="badge bad">заблоковано</span> : <span className="badge ok">активний</span>}</td>
                      <td className="right">
                        {u.role !== 'ADMIN' && (
                          <button className="link" onClick={() => patch(`/admin/users/${u.id}`, { isBlocked: !u.isBlocked }, 'Збережено')}>
                            {u.isBlocked ? 'розблокувати' : 'заблокувати'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'hotels' && (
          <>
            <h1>Каталог готелів</h1>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>#</th><th>Назва</th><th>Місто</th><th>★</th><th>Номерів</th><th>Власник</th><th>Статус</th><th /></tr></thead>
                <tbody>
                  {hotels.map((h) => (
                    <tr key={h.id}>
                      <td>{h.id}</td>
                      <td>{h.name}</td>
                      <td>{h.city}</td>
                      <td>{h.stars}</td>
                      <td>{h.rooms}</td>
                      <td>{h.ownerName}</td>
                      <td>{h.isActive ? <span className="badge ok">активний</span> : <span className="badge bad">вимкнено</span>}</td>
                      <td className="right">
                        <button className="link" onClick={() => patch(`/admin/hotels/${h.id}`, { isActive: !h.isActive }, 'Збережено')}>
                          {h.isActive ? 'вимкнути' : 'увімкнути'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'bookings' && (
          <>
            <h1>Усі бронювання</h1>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>#</th><th>Клієнт</th><th>Готель</th><th>Дати</th><th>Сума</th><th>Промокод</th><th>Статус</th></tr></thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.client?.name}<div className="small muted">{b.client?.email}</div></td>
                      <td>{b.room.hotel.name}<div className="small muted">№{b.room.roomNumber}</div></td>
                      <td>{fmtDate(b.checkIn)} — {fmtDate(b.checkOut)}</td>
                      <td>{money(b.totalPrice)}</td>
                      <td>{b.promoCode ?? '—'}</td>
                      <td><span className={`badge ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'promos' && (
          <>
            <h1>Акції та промокоди</h1>
            <form className="card form inline-form wrap" onSubmit={createPromo}>
              <input required placeholder="Назва акції" value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} />
              <input required placeholder="КОД" value={promoForm.promoCode} onChange={(e) => setPromoForm({ ...promoForm, promoCode: e.target.value.toUpperCase() })} />
              <input type="number" min={1} max={90} title="Знижка, %" value={promoForm.discountPercent} onChange={(e) => setPromoForm({ ...promoForm, discountPercent: Number(e.target.value) })} />
              <input type="date" value={promoForm.startDate} onChange={(e) => setPromoForm({ ...promoForm, startDate: e.target.value })} />
              <input type="date" value={promoForm.endDate} onChange={(e) => setPromoForm({ ...promoForm, endDate: e.target.value })} />
              <button className="btn primary sm">+ Створити</button>
            </form>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>Код</th><th>Назва</th><th>Знижка</th><th>Період</th><th>Статус</th><th /></tr></thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.promoCode}</b></td>
                      <td>{p.name}</td>
                      <td>{p.discountPercent}%</td>
                      <td>{fmtDate(p.startDate)} — {fmtDate(p.endDate)}</td>
                      <td>{p.isActive ? <span className="badge ok">активна</span> : <span className="badge muted">вимкнена</span>}</td>
                      <td className="right">
                        <button
                          className="link"
                          onClick={() => {
                            const { id, ...rest } = p;
                            patch(`/admin/promotions/${id}`, { ...rest, isActive: !p.isActive }, 'Збережено');
                          }}
                        >
                          {p.isActive ? 'вимкнути' : 'увімкнути'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'support' && (
          <>
            <h1>Звернення в підтримку</h1>
            {!tickets.length && <p className="muted">Звернень немає.</p>}
            <div className="list">
              {tickets.map((t) => (
                <div key={t.id} className="card">
                  <div className="section-head">
                    <div>
                      <b>{t.subject}</b>
                      <div className="small muted">{t.client.name} · {t.client.email} · {fmtDate(t.createdAt)}</div>
                    </div>
                    <select value={t.status} onChange={(e) => patch(`/admin/support/${t.id}`, { status: e.target.value }, 'Статус змінено')}>
                      <option value="OPEN">Відкрито</option>
                      <option value="IN_PROGRESS">В роботі</option>
                      <option value="CLOSED">Закрито</option>
                    </select>
                  </div>
                  <p>{t.text}</p>
                  {t.answer ? (
                    <div className="alert info"><b>Відповідь:</b> {t.answer}</div>
                  ) : (
                    <div className="inline-form">
                      <input placeholder="Відповідь клієнту (буде надіслана на email)" value={answers[t.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [t.id]: e.target.value })} />
                      <button className="btn primary sm" disabled={!answers[t.id]} onClick={() => patch(`/admin/support/${t.id}`, { status: 'CLOSED', answer: answers[t.id] }, 'Відповідь надіслано')}>
                        Відповісти
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'report' && (
          <>
            <h1>Фінансовий звіт</h1>
            <div className="card inline-form">
              <label>З <input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></label>
              <label>По <input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></label>
              <button className="btn primary sm" onClick={load}>Сформувати</button>
            </div>
            {report && (
              <div className="kpis">
                <div className="kpi"><span>Оборот</span><b>{money(report.totalRevenue)}</b></div>
                <div className="kpi"><span>Комісія платформи ({report.commissionPercent}%)</span><b>{money(report.commission)}</b></div>
                <div className="kpi"><span>Успішних платежів</span><b>{report.payments}</b></div>
                <div className="kpi"><span>Повернень</span><b>{report.refunds} · {money(report.refundedAmount)}</b></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
