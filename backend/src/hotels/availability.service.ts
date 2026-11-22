import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { eachNight } from '../common/dates';
import { BookingStatus, PAYMENT_LOCK_MINUTES } from '../common/enums';
import { Booking } from '../entities';

const lockKey = (roomId: number, night: string) => `lock:room:${roomId}:${night}`;

/**
 * Перевірка доступності номерів (Room.перевіритиДоступність) і
 * блокування номера в Redis на час оплати.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly cache: CacheService,
  ) {}

  /** Повертає множину зайнятих roomId серед переданих на період [checkIn, checkOut) */
  async busyRoomIds(roomIds: number[], checkIn: string, checkOut: string, ignoreBookingId?: number) {
    const busy = new Set<number>();
    if (!roomIds.length) return busy;

    const overlapping = await this.bookings.find({
      where: {
        roomId: In(roomIds),
        status: In([BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT]),
        checkIn: LessThan(checkOut),
        checkOut: MoreThan(checkIn),
      },
    });
    const staleBefore = Date.now() - PAYMENT_LOCK_MINUTES * 60_000;
    for (const b of overlapping) {
      if (b.id === ignoreBookingId) continue;
      if (b.status === BookingStatus.CONFIRMED) busy.add(b.roomId);
      // Неоплачене бронювання тримає номер лише поки діє блокування
      else if (new Date(b.createdAt).getTime() > staleBefore) busy.add(b.roomId);
    }

    // Блокування в Redis (інші клієнти саме зараз оплачують)
    const nights = eachNight(checkIn, checkOut);
    for (const id of roomIds) {
      if (busy.has(id)) continue;
      for (const n of nights) {
        const owner = await this.cache.getRaw(lockKey(id, n));
        if (owner && owner !== String(ignoreBookingId)) {
          busy.add(id);
          break;
        }
      }
    }
    return busy;
  }

  async isAvailable(roomId: number, checkIn: string, checkOut: string, ignoreBookingId?: number) {
    return !(await this.busyRoomIds([roomId], checkIn, checkOut, ignoreBookingId)).has(roomId);
  }

  /** Блокує номер на кожну ніч періоду. Якщо хоч одна ніч зайнята — відкочує і повертає false */
  async lock(roomId: number, checkIn: string, checkOut: string, bookingId: number): Promise<boolean> {
    const taken: string[] = [];
    for (const n of eachNight(checkIn, checkOut)) {
      const key = lockKey(roomId, n);
      if (await this.cache.setNX(key, String(bookingId), PAYMENT_LOCK_MINUTES * 60)) taken.push(key);
      else {
        await this.cache.del(...taken);
        return false;
      }
    }
    return true;
  }

  async unlock(roomId: number, checkIn: string, checkOut: string, bookingId: number) {
    const keys: string[] = [];
    for (const n of eachNight(checkIn, checkOut)) {
      const key = lockKey(roomId, n);
      if ((await this.cache.getRaw(key)) === String(bookingId)) keys.push(key);
    }
    await this.cache.del(...keys);
  }
}
