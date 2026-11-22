import type { Hotel, RoomType } from './api';

/** Фото з Unsplash (безкоштовна ліцензія Unsplash). Розмір підбирається під місце показу */
export const unsplash = (id: string, w = 800, h?: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=70`;

/** Змінює ширину вже готового URL Unsplash (для мініатюр) */
export function sized(url: string, w: number, h?: number) {
  if (!url.includes('images.unsplash.com')) return url;
  const u = new URL(url);
  u.searchParams.set('w', String(w));
  if (h) u.searchParams.set('h', String(h));
  else u.searchParams.delete('h');
  u.searchParams.set('fit', 'crop');
  return u.toString();
}

export const HERO_PHOTO = unsplash('1566073771259-6a8506099945', 1800);
export const AUTH_PHOTO = unsplash('1520250497591-112f2f40a3f4', 1200);

export const CITY_PHOTOS: Record<string, string> = {
  Київ: '1561542320-9a18cd340469',
  Львів: '1514924013411-cbf25faa35bb',
  Одеса: '1586611292717-f828b167408c',
  Буковель: '1506905925346-21bda4d32df4',
  Харків: '1574362848149-11496d93a7c7',
  Ужгород: '1522798514-97ceb8c4f1c8',
};
const CITY_FALLBACK = ['1551882547-ff40c63fe5fa', '1600011689032-8b628b8a8747', '1610641818989-c2051b5e2cfd'];

export const cityPhoto = (city: string, i = 0) =>
  unsplash(CITY_PHOTOS[city] ?? CITY_FALLBACK[i % CITY_FALLBACK.length], 600, 400);

/** Запасні фото для готелів без власних (наприклад, щойно доданих власником) */
const HOTEL_POOL = [
  '1564501049412-61c2a3083791',
  '1455587734955-081b22074882',
  '1568084680786-a84f91d1153c',
  '1600011689032-8b628b8a8747',
  '1542314831-068cd1dbfeeb',
  '1571896349842-33c89424de2d',
];

const ROOM_PHOTOS: Record<RoomType, string[]> = {
  STANDARD: ['1631049307264-da0ec9d70304', '1618773928121-c32242e63f39', '1590490360182-c33d57733427', '1578683010236-d716f9a3f461'],
  LUX: ['1611892440504-42a792e24d32', '1596394516093-501ba68a0ba6', '1505693416388-ac5ce068fe85', '1584132915807-fd1f5fbc078f'],
  FAMILY: ['1595576508898-0ad5c879a061', '1502672260266-1c1ef2d93688', '1609766857041-ed402ea8069a'],
  HOSTEL: ['1555854877-bab0e564b8d5', '1520277739336-7bf67edfa768'],
};

export function hotelPhotos(h: Pick<Hotel, 'id' | 'photos'>): string[] {
  if (h.photos?.length) return h.photos;
  const first = HOTEL_POOL[h.id % HOTEL_POOL.length];
  return [unsplash(first, 1200), unsplash(ROOM_PHOTOS.STANDARD[h.id % 4], 1200), unsplash(ROOM_PHOTOS.LUX[h.id % 4], 1200)];
}

export const roomPhoto = (type: RoomType, roomId: number) => {
  const list = ROOM_PHOTOS[type];
  return unsplash(list[roomId % list.length], 400, 300);
};
