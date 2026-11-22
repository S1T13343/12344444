# StayBook — сервіс онлайн-бронювання готелів

Адаптивний веб-додаток (ПК і телефон) для бронювання невеликих готелів і хостелів.
Реалізує модель з робіт 1–7: варіанти використання, діаграму класів, сценарій бронювання
(Client → Booking → Room → Promotion → Payment → PaymentSystem → PostgreSQL → Notification).

## Стек

| Частина | Технологія |
|---|---|
| Клієнт | React 18 + TypeScript (Vite), React Router |
| Сервер | Node.js + NestJS (REST API `/api`) |
| БД | PostgreSQL (TypeORM). Без `DATABASE_URL` — вбудована SQLite (sql.js) для локального запуску |
| Кеш і блокування | Redis: кеш пошуку (60 с) і блокування номера на 15 хв під час оплати. Без `REDIS_URL` — пам'ять процесу |
| Оплата | Stripe (PaymentIntents + Payment Element). Без ключів — тестова імітація |
| Карта | Google Maps JS API. Без ключа — OpenStreetMap (Leaflet) |
| Листи | Nodemailer через SMTP. Без SMTP — лист пишеться в консоль і в таблицю `notifications` |
| Розгортання | Docker Compose, GitHub Actions (`.github/workflows/ci.yml`) |

## Запуск

### Варіант 1 — локально (потрібен лише Node.js 20+)

```powershell
.\start.cmd
```

Скрипт збирає проєкт (якщо ще не зібраний) і запускає один процес: API віддає і зібраний сайт.
Сайт: http://localhost:3000. Після змін у коді фронтенду виконайте `npm run build` у `frontend`.

Режим розробки з автоперезавантаженням (два процеси, потребує більше пам'яті) — у двох терміналах:

```powershell
cd backend; npm install; npm run start:dev
```

```powershell
cd frontend; npm install; npm run dev
```

Сайт: http://localhost:5173, API: http://localhost:3000/api (стан системи: `/api/health`).

### Варіант 2 — Docker (PostgreSQL + Redis + API + nginx)

```powershell
docker compose up --build
```

Сайт: http://localhost:8080

### Ключі (необов'язково)

Скопіюйте `backend/.env.example` у `backend/.env` і заповніть потрібне: `STRIPE_SECRET_KEY` /
`STRIPE_PUBLISHABLE_KEY` (тестові ключі Stripe), `GOOGLE_MAPS_API_KEY`, `SMTP_*`.

## Тестові акаунти

Створюються автоматично при першому запуску (`backend/src/seed.ts`), пароль для всіх — `password123`:

| Роль | Email |
|---|---|
| Адміністратор | admin@staybook.local |
| Партнер (власник готелів) | partner@staybook.local |
| Клієнт | client@staybook.local |

Промокоди: `WELCOME10` (−10%), `WINTER15` (−15%).
Тестова картка: `4242 4242 4242 4242` — успіх, `4000 0000 0000 0002` — відмова.

## Екрани (відповідають прототипу Figma)

1. Головна — пошук, популярні міста, топ готелів
2. Результати пошуку — фільтри (ціна, зірки, тип номера), сортування
3. Сторінка готелю — опис, зручності, номери з доступністю на дати, карта
4. Оформлення — дані гостя, промокод, підсумок
5. Підтвердження — номер бронювання, лист на email
6. Мобільна версія — увесь інтерфейс адаптивний
7. Вхід і реєстрація (мандрівник / власник готелю)
8. Пошук з картою
9. Мої бронювання — скасування з поверненням коштів, бонусні бали, звернення в підтримку
10. Кабінет власника — дохід, графік за місяцями, готелі й номери, бронювання гостей
11. Адмін-панель — користувачі, готелі, бронювання, акції, підтримка, фінансовий звіт, моніторинг

## Структура

```
backend/src
  entities/        Користувач, Готель, Номер, Бронювання, Платіж, Акція, Сповіщення, ЗверненняПідтримки
  common/enums.ts  СтатусБронювання, СтатусПлатежу, ТипНомера
  auth/            JWT, ролі CLIENT / PARTNER / ADMIN
  hotels/          пошук, каталог, перевірка доступності, блокування в Redis
  bookings/        бронювання, промокоди, оплата, скасування, статистика партнера
  payments/        інтерфейс ПлатіжнаСистема: Stripe і тестова імітація
  notifications/   СервісСповіщень (Nodemailer)
  support/         звернення в підтримку
  admin/           адмін-панель, ФінансовийЗвіт
frontend/src
  pages/           11 екранів
  HotelMap.tsx     Google Maps / Leaflet
```

## Основні ендпоінти API

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | реєстрація / вхід |
| GET | `/api/hotels?city&checkIn&checkOut&guests&minPrice&maxPrice&stars&type&sort` | пошук |
| GET | `/api/hotels/:id?checkIn&checkOut` | готель і доступні номери |
| GET | `/api/bookings/quote` | розрахунок вартості з промокодом |
| POST | `/api/bookings` | створити бронювання (номер блокується на 15 хв) |
| POST | `/api/bookings/:id/payment-intent` | Stripe PaymentIntent |
| POST | `/api/bookings/:id/pay` | оплата → підтвердження → лист |
| POST | `/api/bookings/:id/cancel` | скасування + повернення коштів |
| GET | `/api/partner/*` | кабінет власника |
| GET/PATCH | `/api/admin/*` | адмін-панель |
| GET | `/api/health` | моніторинг стану |
