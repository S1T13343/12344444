import { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Role } from './api';
import { useApp } from './context';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import CheckoutPage from './pages/CheckoutPage';
import ConfirmationPage from './pages/ConfirmationPage';
import HomePage from './pages/HomePage';
import HotelPage from './pages/HotelPage';
import MapSearchPage from './pages/MapSearchPage';
import MyBookingsPage from './pages/MyBookingsPage';
import OwnerPage from './pages/OwnerPage';
import SearchPage from './pages/SearchPage';

function Header() {
  const { user, logout } = useApp();
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">S</span>StayBook
        </Link>
        <nav className="nav">
          <NavLink to="/search">Пошук</NavLink>
          <NavLink to="/map">Карта</NavLink>
          {user?.role === 'CLIENT' && <NavLink to="/my">Мої бронювання</NavLink>}
          {user?.role === 'PARTNER' && <NavLink to="/owner">Кабінет власника</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/admin">Адмін-панель</NavLink>}
        </nav>
        <div className="header-user">
          {user ? (
            <>
              <span className="user-chip" title={user.email}>
                {user.name.split(' ')[0]}
                {user.role === 'CLIENT' && <small> · {user.bonusPoints} балів</small>}
              </span>
              <button className="btn ghost sm" onClick={logout}>
                Вийти
              </button>
            </>
          ) : (
            <>
              <Link className="btn ghost sm" to="/login">
                Увійти
              </Link>
              <Link className="btn primary sm hide-xs" to="/login?tab=register">
                Реєстрація
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <div className="container page"><div className="spinner" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && !roles.includes(user.role))
    return (
      <div className="container page empty">
        <h2>Немає доступу</h2>
        <p>Ця сторінка доступна лише для ролей: {roles.join(', ')}.</p>
      </div>
    );
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/map" element={<MapSearchPage />} />
          <Route path="/hotels/:id" element={<HotelPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/checkout" element={<RequireRole><CheckoutPage /></RequireRole>} />
          <Route path="/bookings/:id/done" element={<RequireRole><ConfirmationPage /></RequireRole>} />
          <Route path="/my" element={<RequireRole><MyBookingsPage /></RequireRole>} />
          <Route path="/owner" element={<RequireRole roles={['PARTNER', 'ADMIN']}><OwnerPage /></RequireRole>} />
          <Route path="/admin" element={<RequireRole roles={['ADMIN']}><AdminPage /></RequireRole>} />
          <Route path="*" element={<div className="container page empty"><h2>Сторінку не знайдено</h2><Link to="/">На головну</Link></div>} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          © {new Date().getFullYear()} StayBook — бронювання невеликих готелів і хостелів без високих комісій.
        </div>
      </footer>
    </>
  );
}
