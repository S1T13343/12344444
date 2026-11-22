import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { addDays, today } from './common/dates';
import { Role, RoomType } from './common/enums';
import { Hotel, Promotion, Room, User } from './entities';

/**
 * Початкові демо-дані. Виконується, лише якщо таблиця users порожня.
 * Тестові акаунти (пароль для всіх: password123):
 *   admin@staybook.local    — адміністратор
 *   partner@staybook.local  — власник готелів
 *   client@staybook.local   — клієнт
 */
export const DEMO_PASSWORD = 'password123';

const HOTELS: Array<{
  name: string;
  city: string;
  address: string;
  stars: number;
  rating: number;
  lat: number;
  lng: number;
  description: string;
  amenities: string[];
  rooms: Array<[RoomType, number, number, number]>; // тип, місткість, ціна, кількість
}> = [
  {
    name: 'Готель «Дніпровські Схили»', city: 'Київ', address: 'вул. Грушевського, 12', stars: 4, rating: 8.9,
    lat: 50.4467, lng: 30.5375,
    description: 'Затишний бутік-готель у центрі Києва з видом на Дніпро. 5 хвилин пішки до Хрещатика.',
    amenities: ['Wi-Fi', 'Сніданок', 'Кондиціонер', 'Паркінг', 'Цілодобова рецепція'],
    rooms: [[RoomType.STANDARD, 2, 2400, 4], [RoomType.LUX, 2, 4800, 2], [RoomType.FAMILY, 4, 3900, 2]],
  },
  {
    name: 'Podil Loft Hostel', city: 'Київ', address: 'вул. Сагайдачного, 25', stars: 2, rating: 8.4,
    lat: 50.4635, lng: 30.5193,
    description: 'Сучасний хостел на Подолі для молодих мандрівників. Спільна кухня і лаунж-зона.',
    amenities: ['Wi-Fi', 'Спільна кухня', 'Пральня'],
    rooms: [[RoomType.HOSTEL, 1, 450, 6], [RoomType.STANDARD, 2, 1300, 2]],
  },
  {
    name: 'Kyiv Business Hotel', city: 'Київ', address: 'просп. Перемоги, 40', stars: 5, rating: 9.2,
    lat: 50.4547, lng: 30.4462,
    description: 'Готель для ділових поїздок: конференц-зали, фітнес-центр, трансфер з аеропорту.',
    amenities: ['Wi-Fi', 'Сніданок', 'Фітнес', 'Конференц-зал', 'Трансфер', 'Паркінг'],
    rooms: [[RoomType.STANDARD, 2, 3600, 4], [RoomType.LUX, 3, 7200, 2]],
  },
  {
    name: 'Львівська Кам\'яниця', city: 'Львів', address: 'пл. Ринок, 7', stars: 4, rating: 9.4,
    lat: 49.8419, lng: 24.0316,
    description: 'Історична кам\'яниця XVII ст. на площі Ринок. Кава з власної обсмажки щоранку.',
    amenities: ['Wi-Fi', 'Сніданок', 'Кав\'ярня', 'Кондиціонер'],
    rooms: [[RoomType.STANDARD, 2, 2200, 3], [RoomType.LUX, 2, 4100, 1], [RoomType.FAMILY, 4, 3500, 1]],
  },
  {
    name: 'Leopolis Hostel', city: 'Львів', address: 'вул. Городоцька, 18', stars: 2, rating: 8.1,
    lat: 49.8387, lng: 24.0208,
    description: 'Бюджетний хостел за 7 хвилин від центру. Безкоштовні піші екскурсії.',
    amenities: ['Wi-Fi', 'Спільна кухня', 'Камера схову'],
    rooms: [[RoomType.HOSTEL, 1, 380, 8], [RoomType.STANDARD, 2, 1100, 2]],
  },
  {
    name: 'Одеса Марина', city: 'Одеса', address: 'Приморський бульвар, 9', stars: 4, rating: 8.7,
    lat: 46.4875, lng: 30.7426,
    description: 'Готель на Приморському бульварі з терасою та видом на порт і Потьомкінські сходи.',
    amenities: ['Wi-Fi', 'Сніданок', 'Тераса', 'Кондиціонер', 'Басейн'],
    rooms: [[RoomType.STANDARD, 2, 2600, 4], [RoomType.LUX, 2, 5200, 2], [RoomType.FAMILY, 5, 4300, 2]],
  },
  {
    name: 'Аркадія Резорт', city: 'Одеса', address: 'вул. Генуезька, 24', stars: 5, rating: 9.0,
    lat: 46.4301, lng: 30.7605,
    description: 'Курортний готель біля пляжу Аркадія з SPA-зоною та власним пляжем.',
    amenities: ['Wi-Fi', 'Сніданок', 'SPA', 'Басейн', 'Пляж', 'Паркінг'],
    rooms: [[RoomType.STANDARD, 2, 3900, 4], [RoomType.LUX, 2, 8500, 2], [RoomType.FAMILY, 4, 6400, 2]],
  },
  {
    name: 'Карпатська Садиба', city: 'Буковель', address: 'урочище Паленица, 3', stars: 3, rating: 9.1,
    lat: 48.3586, lng: 24.4006,
    description: 'Дерев\'яна садиба біля підйомника №1. Камін, чан та домашня кухня.',
    amenities: ['Wi-Fi', 'Сніданок', 'Сауна', 'Камін', 'Паркінг'],
    rooms: [[RoomType.STANDARD, 2, 2800, 3], [RoomType.FAMILY, 6, 5600, 2]],
  },
  {
    name: 'Харків Сіті Хаб', city: 'Харків', address: 'вул. Сумська, 15', stars: 3, rating: 8.3,
    lat: 49.9945, lng: 36.2338,
    description: 'Компактний міський готель поруч із садом Шевченка.',
    amenities: ['Wi-Fi', 'Кондиціонер', 'Цілодобова рецепція'],
    rooms: [[RoomType.STANDARD, 2, 1600, 5], [RoomType.FAMILY, 4, 2600, 1]],
  },
  {
    name: 'Ужгородський Замок Готель', city: 'Ужгород', address: 'вул. Капітульна, 5', stars: 3, rating: 8.8,
    lat: 48.6236, lng: 22.3038,
    description: 'Невеликий сімейний готель біля Ужгородського замку. Закарпатські вина у барі.',
    amenities: ['Wi-Fi', 'Сніданок', 'Бар', 'Паркінг'],
    rooms: [[RoomType.STANDARD, 2, 1700, 4], [RoomType.LUX, 2, 3000, 1]],
  },
];

/** Фото Unsplash (безкоштовна ліцензія Unsplash) */
const ph = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;

/** Фото демо-готелів у тому ж порядку, що й HOTELS. Перше — обкладинка */
const SEED_PHOTOS: string[][] = [
  ['1590381105924-c72589b9ef3f', '1618773928121-c32242e63f39', '1631049307264-da0ec9d70304', '1584132915807-fd1f5fbc078f'],
  ['1555854877-bab0e564b8d5', '1520277739336-7bf67edfa768', '1502672260266-1c1ef2d93688', '1574362848149-11496d93a7c7'],
  ['1517840901100-8179e982acb7', '1568084680786-a84f91d1153c', '1582719478250-c89cae4dc85b', '1595576508898-0ad5c879a061'],
  ['1514924013411-cbf25faa35bb', '1611892440504-42a792e24d32', '1601565415267-724db0e9fbdf', '1505693416388-ac5ce068fe85'],
  ['1520277739336-7bf67edfa768', '1555854877-bab0e564b8d5', '1502672260266-1c1ef2d93688', '1578683010236-d716f9a3f461'],
  ['1564501049412-61c2a3083791', '1596394516093-501ba68a0ba6', '1584132967334-10e028bd69f7', '1590490360182-c33d57733427'],
  ['1586611292717-f828b167408c', '1540541338287-41700207dee6', '1596436889106-be35e843f974', '1559599238-308793637427'],
  ['1595521624992-48a59aef95e3', '1601918774946-25832a4be0d6', '1506905925346-21bda4d32df4', '1601565415267-724db0e9fbdf'],
  ['1574362848149-11496d93a7c7', '1609766857041-ed402ea8069a', '1595576508898-0ad5c879a061', '1502672260266-1c1ef2d93688'],
  ['1522798514-97ceb8c4f1c8', '1445019980597-93fa8acb246c', '1505693416388-ac5ce068fe85', '1582719478250-c89cae4dc85b'],
].map((ids) => ids.map(ph));

/** Додає фото демо-готелям у вже існуючій БД (створеній до появи поля photos) */
async function backfillPhotos(ds: DataSource) {
  const repo = ds.getRepository(Hotel);
  for (const [i, h] of HOTELS.entries()) {
    const hotel = await repo.findOne({ where: { name: h.name } });
    if (hotel && !hotel.photos?.length) await repo.update(hotel.id, { photos: SEED_PHOTOS[i] });
  }
}

export async function seed(ds: DataSource) {
  const log = new Logger('Seed');
  const users = ds.getRepository(User);
  if ((await users.count()) > 0) return backfillPhotos(ds);

  log.log('Порожня БД — створюю демо-дані');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [_admin, partner, partner2] = await users.save([
    users.create({ name: 'Адміністратор', email: 'admin@staybook.local', passwordHash: hash, role: Role.ADMIN, accessLevel: 10 }),
    users.create({ name: 'Олена Коваль', email: 'partner@staybook.local', passwordHash: hash, role: Role.PARTNER, companyName: 'Koval Hotels', partnerType: 'HOTEL', phone: '+380501112233' }),
    users.create({ name: 'Андрій Мельник', email: 'partner2@staybook.local', passwordHash: hash, role: Role.PARTNER, companyName: 'Melnyk Hospitality', partnerType: 'HOSTEL' }),
    users.create({ name: 'Іван Петренко', email: 'client@staybook.local', passwordHash: hash, role: Role.CLIENT, phone: '+380671234567' }),
  ]);

  const hotelRepo = ds.getRepository(Hotel);
  for (const [i, h] of HOTELS.entries()) {
    const rooms: Partial<Room>[] = [];
    let n = 101;
    for (const [type, capacity, price, count] of h.rooms) {
      for (let k = 0; k < count; k++) {
        rooms.push({ roomNumber: String(n++), type, capacity, pricePerNight: price, amenities: [] });
      }
      n = Math.ceil(n / 100) * 100 + 1;
    }
    const { rooms: _r, ...data } = h;
    await hotelRepo.save(
      hotelRepo.create({
        ...data,
        hue: (i * 37 + 180) % 360,
        photos: SEED_PHOTOS[i],
        ownerId: i % 3 === 1 ? partner2.id : partner.id,
        rooms: rooms as Room[],
      }),
    );
  }

  await ds.getRepository(Promotion).save([
    { name: 'Перше бронювання', promoCode: 'WELCOME10', discountPercent: 10, startDate: addDays(today(), -30), endDate: addDays(today(), 365), isActive: true },
    { name: 'Зимовий розпродаж', promoCode: 'WINTER15', discountPercent: 15, startDate: addDays(today(), -5), endDate: addDays(today(), 90), isActive: true },
  ]);
  log.log(`Створено ${HOTELS.length} готелів і тестові акаунти (пароль: ${DEMO_PASSWORD})`);
}
