import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Role } from '../api';
import { useApp } from '../context';
import { AUTH_PHOTO } from '../photos';

export default function AuthPage() {
  const [params] = useSearchParams();
  const { login, register, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<'login' | 'register'>(params.get('tab') === 'register' ? 'register' : 'login');
  const [role, setRole] = useState<Role>(params.get('role') === 'PARTNER' ? 'PARTNER' : 'CLIENT');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', companyName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const home = (r: Role) => params.get('next') || (r === 'ADMIN' ? '/admin' : r === 'PARTNER' ? '/owner' : '/');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const u =
        tab === 'login'
          ? await login(f.email, f.password)
          : await register({ ...f, role, ...(role === 'PARTNER' ? {} : { companyName: '' }) });
      toast(tab === 'login' ? `Вітаємо, ${u.name}!` : 'Акаунт створено');
      nav(home(u.role), { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div
        className="auth-side"
        style={{ backgroundImage: `linear-gradient(160deg, rgba(15,76,92,.9), rgba(22,105,122,.6)), url(${AUTH_PHOTO})` }}
      >
        <h2>StayBook</h2>
        <p>Бронюйте невеликі готелі напряму. Отримуйте 5% бонусних балів з кожного бронювання.</p>
      </div>
      <div className="auth-form">
        <div className="tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            Вхід
          </button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
            Реєстрація
          </button>
        </div>
        <form className="form" onSubmit={submit}>
          {tab === 'register' && (
            <>
              <div className="seg">
                <button type="button" className={role === 'CLIENT' ? 'active' : ''} onClick={() => setRole('CLIENT')}>
                  Я мандрівник
                </button>
                <button type="button" className={role === 'PARTNER' ? 'active' : ''} onClick={() => setRole('PARTNER')}>
                  Я власник готелю
                </button>
              </div>
              <label>
                Ім'я
                <input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </label>
              {role === 'PARTNER' && (
                <label>
                  Назва компанії / готелю
                  <input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
                </label>
              )}
              <label>
                Телефон
                <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+380…" />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
          </label>
          <label>
            Пароль
            <input
              type="password"
              required
              minLength={tab === 'register' ? 6 : 1}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {err && <div className="alert err">{err}</div>}
          <button className="btn primary big" disabled={busy}>
            {busy ? '…' : tab === 'login' ? 'Увійти' : 'Створити акаунт'}
          </button>
          {tab === 'login' && (
            <p className="small muted">Демо-акаунти описані в README.md (розділ «Тестові акаунти»).</p>
          )}
        </form>
      </div>
    </div>
  );
}
