import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import { nightsBetween, today } from '../common/dates';
import { BookingStatus, PaymentStatus, Role } from '../common/enums';
import { Booking, Hotel, Payment, Promotion, Room, User } from '../entities';
import { AvailabilityService } from '../hotels/availability.service';
import { HotelsModule, HotelsService, normalizeDates } from '../hotels/hotels.module';
import { NotificationService } from '../notifications/notifications.module';
import { PAYMENT_SYSTEM, PaymentSystem, paymentSystemFactory } from '../payments/payment-system';

class CreateBookingDto {
  @Type(() => Number) @IsInt() roomId!: number;
  @IsString() checkIn!: string;
  @IsString() checkOut!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) guests!: number;
  @IsString() @MinLength(2) guestName!: string;
  @IsEmail() guestEmail!: string;
  @IsOptional() @IsString() guestPhone?: string;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsString() comment?: string;
}

class PayDto {
  @IsOptional() @IsString() paymentIntentId?: string;
  @IsOptional() @IsString() cardNumber?: string;
}

const fmt = (n: number) => n.toLocaleString('uk-UA') + ' грн';

@Injectable()
export class PromotionsService {
  constructor(@InjectRepository(Promotion) private readonly repo: Repository<Promotion>) {}

  /** Акція.перевіритиДійсність() */
  async findValid(code: string | undefined | null): Promise<Promotion | null> {
    if (!code?.trim()) return null;
    const p = await this.repo.findOne({ where: { promoCode: code.trim().toUpperCase() } });
    const d = today();
    if (!p || !p.isActive || d < p.startDate || d > p.endDate) return null;
    return p;
  }

  /** Акція.застосувати(бронювання) */
  discountFor(p: Promotion | null, base: number) {
    return p ? Math.round((base * p.discountPercent) / 100) : 0;
  }
}

@Injectable()
export class BookingsService {
  private readonly log = new Logger('Booking');

  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(PAYMENT_SYSTEM) private readonly paymentSystem: PaymentSystem,
    private readonly availability: AvailabilityService,
    private readonly promos: PromotionsService,
    private readonly hotels: HotelsService,
    private readonly notify: NotificationService,
    private readonly ds: DataSource,
  ) {}

  /** Попередній розрахунок вартості (без створення бронювання) */
  async quote(roomId: number, checkIn: string, checkOut: string, promoCode?: string) {
    const room = await this.rooms.findOne({ where: { id: roomId }, relations: { hotel: true } });
    if (!room || !room.hotel.isActive) throw new NotFoundException('Номер не знайдено');
    const dates = normalizeDates(checkIn, checkOut);
    const nights = nightsBetween(dates.checkIn, dates.checkOut);
    const basePrice = room.pricePerNight * nights;
    const promo = await this.promos.findValid(promoCode);
    const discount = this.promos.discountFor(promo, basePrice);
    const available = await this.availability.isAvailable(room.id, dates.checkIn, dates.checkOut);
    return {
      room,
      ...dates,
      nights,
      basePrice,
      discount,
      totalPrice: basePrice - discount,
      promo: promo ? { code: promo.promoCode, name: promo.name, discountPercent: promo.discountPercent } : null,
      promoInvalid: !!promoCode?.trim() && !promo,
      available,
    };
  }

  /** Клієнт.забронювати(номер): 1 bookRoom → 1.1 checkAvailability → 1.2 apply promo */
  async create(user: User, dto: CreateBookingDto) {
    if (dto.checkIn < today()) throw new BadRequestException('Дата заїзду вже минула');
    const q = await this.quote(dto.roomId, dto.checkIn, dto.checkOut, dto.promoCode);
    if (q.room.capacity < dto.guests) throw new BadRequestException(`Номер розрахований на ${q.room.capacity} гостей`);
    if (q.promoInvalid) throw new BadRequestException('Промокод недійсний');
    if (!q.available) throw new ConflictException('Номер уже зайнятий на ці дати');

    const booking = await this.bookings.save(
      this.bookings.create({
        roomId: q.room.id,
        clientId: user.id,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        guests: dto.guests,
        nights: q.nights,
        basePrice: q.basePrice,
        discount: q.discount,
        totalPrice: q.totalPrice,
        promoCode: q.promo?.code ?? null,
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone ?? null,
        comment: dto.comment ?? null,
        status: BookingStatus.PENDING_PAYMENT,
      }),
    );

    // Блокування номера в Redis на час оплати
    if (!(await this.availability.lock(q.room.id, q.checkIn, q.checkOut, booking.id))) {
      await this.bookings.update(booking.id, { status: BookingStatus.CANCELLED });
      throw new ConflictException('Номер щойно забронював інший гість');
    }
    await this.hotels.invalidateSearch();
    return this.getOne(user, booking.id);
  }

  async getOne(user: User, id: number) {
    const b = await this.bookings.findOne({
      where: { id },
      relations: { room: { hotel: true }, payments: true },
    });
    if (!b) throw new NotFoundException('Бронювання не знайдено');
    const isOwner = b.room.hotel.ownerId === user.id;
    if (b.clientId !== user.id && user.role !== Role.ADMIN && !isOwner) throw new ForbiddenException();
    return b;
  }

  /** Створює Stripe PaymentIntent (лише в режимі stripe) */
  async createIntent(user: User, id: number) {
    const b = await this.payable(user, id);
    const intent = await this.paymentSystem.createIntent(b.totalPrice, 'UAH', b.id);
    if (!intent) throw new BadRequestException('Stripe не налаштовано — використовується тестова оплата');
    return intent;
  }

  private async payable(user: User, id: number) {
    const b = await this.getOne(user, id);
    if (b.clientId !== user.id) throw new ForbiddenException();
    if (b.status !== BookingStatus.PENDING_PAYMENT) throw new BadRequestException('Бронювання вже не очікує оплати');
    if (!(await this.availability.isAvailable(b.roomId, b.checkIn, b.checkOut, b.id))) {
      await this.bookings.update(b.id, { status: BookingStatus.CANCELLED });
      throw new ConflictException('Час на оплату минув, номер уже зайнятий. Створіть нове бронювання.');
    }
    return b;
  }

  /** 2 confirm → 2.1 processPayment → 2.1.2 saveTransaction → 2.1.3 notify */
  async pay(user: User, id: number, dto: PayDto) {
    const b = await this.payable(user, id);
    const res = await this.paymentSystem.processPayment({
      amount: b.totalPrice,
      currency: 'UAH',
      bookingId: b.id,
      paymentIntentId: dto.paymentIntentId,
      cardNumber: dto.cardNumber,
    });

    await this.ds.transaction(async (m) => {
      await m.save(
        m.create(Payment, {
          bookingId: b.id,
          amount: b.totalPrice,
          currency: 'UAH',
          method: this.paymentSystem.mode,
          status: res.ok ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
          transactionId: res.transactionId,
          error: res.error ?? null,
        }),
      );
      if (res.ok) {
        await m.update(Booking, b.id, { status: BookingStatus.CONFIRMED });
        // Бонусні бали клієнта: 5% від суми
        await m.increment(User, { id: b.clientId }, 'bonusPoints', Math.floor(b.totalPrice * 0.05));
      }
    });

    if (!res.ok) throw new BadRequestException(res.error || 'Оплата не пройшла');

    await this.availability.unlock(b.roomId, b.checkIn, b.checkOut, b.id);
    await this.hotels.invalidateSearch();
    const confirmed = await this.getOne(user, b.id);
    await this.notify.send({
      type: 'BOOKING_CONFIRMED',
      to: b.guestEmail,
      userId: b.clientId,
      bookingId: b.id,
      subject: `Бронювання #${b.id} підтверджено`,
      html: `<p>Вітаємо, ${b.guestName}!</p>
        <p>Ваше бронювання в <b>${confirmed.room.hotel.name}</b> (${confirmed.room.hotel.address}, ${confirmed.room.hotel.city}) підтверджено.</p>
        <ul><li>Номер: ${confirmed.room.roomNumber}</li><li>Заїзд: ${b.checkIn}</li><li>Виїзд: ${b.checkOut}</li>
        <li>Гостей: ${b.guests}</li><li>Сплачено: <b>${fmt(b.totalPrice)}</b></li></ul>`,
    });
    this.log.log(`Бронювання #${b.id} підтверджено`);
    return confirmed;
  }

  /** Клієнт.скасуватиБронювання(id) + «extend» Повернути кошти */
  async cancel(user: User, id: number) {
    const b = await this.getOne(user, id);
    if (b.clientId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    if (![BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED].includes(b.status)) {
      throw new BadRequestException('Це бронювання не можна скасувати');
    }
    if (b.status === BookingStatus.CONFIRMED && b.checkIn <= today()) {
      throw new BadRequestException('Скасування можливе лише до дати заїзду');
    }

    let refunded = 0;
    const paid = b.payments.find((p) => p.status === PaymentStatus.SUCCESS);
    if (paid?.transactionId) {
      const ok = await this.paymentSystem.refund(paid.transactionId, paid.amount);
      if (!ok) throw new BadRequestException('Платіжна система не підтвердила повернення');
      await this.payments.update(paid.id, { status: PaymentStatus.REFUNDED });
      await this.users.decrement({ id: b.clientId }, 'bonusPoints', Math.floor(paid.amount * 0.05));
      refunded = paid.amount;
    }
    await this.bookings.update(b.id, { status: BookingStatus.CANCELLED });
    await this.availability.unlock(b.roomId, b.checkIn, b.checkOut, b.id);
    await this.hotels.invalidateSearch();

    if (b.status === BookingStatus.CONFIRMED) {
      await this.notify.send({
        type: 'BOOKING_CANCELLED',
        to: b.guestEmail,
        userId: b.clientId,
        bookingId: b.id,
        subject: `Бронювання #${b.id} скасовано`,
        html: `<p>Бронювання в <b>${b.room.hotel.name}</b> на ${b.checkIn} — ${b.checkOut} скасовано.</p>
          ${refunded ? `<p>Повернення коштів: <b>${fmt(refunded)}</b>. Гроші надійдуть на картку протягом 5–10 днів.</p>` : ''}`,
      });
    }
    return this.getOne(user, b.id);
  }

  /** Позначає минулі підтверджені бронювання як ЗАВЕРШЕНО */
  async completePast() {
    await this.bookings.update(
      { status: BookingStatus.CONFIRMED, checkOut: LessThan(today()) },
      { status: BookingStatus.COMPLETED },
    );
  }

  async mine(user: User) {
    await this.completePast();
    return this.bookings.find({
      where: { clientId: user.id, status: In([BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.PENDING_PAYMENT]) },
      relations: { room: { hotel: true }, payments: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Партнер.переглянутиБронюванняГостей() */
  async forPartner(user: User) {
    await this.completePast();
    return this.bookings
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.room', 'r')
      .innerJoinAndSelect('r.hotel', 'h')
      .where('h.ownerId = :uid', { uid: user.id })
      .andWhere('b.status != :p', { p: BookingStatus.PENDING_PAYMENT })
      .orderBy('b.checkIn', 'DESC')
      .getMany();
  }

  async partnerStats(user: User) {
    const list = await this.forPartner(user);
    const paid = list.filter((b) => b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED);
    const commission = Number(process.env.COMMISSION_PERCENT || 10);
    const revenue = paid.reduce((s, b) => s + b.totalPrice, 0);
    const byMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - i);
      byMonth[d.toISOString().slice(0, 7)] = 0;
    }
    for (const b of paid) {
      const k = b.checkIn.slice(0, 7);
      if (k in byMonth) byMonth[k] += b.totalPrice;
    }
    const t = today();
    return {
      bookings: paid.length,
      cancelled: list.filter((b) => b.status === BookingStatus.CANCELLED).length,
      revenue,
      commission: Math.round((revenue * commission) / 100),
      payout: revenue - Math.round((revenue * commission) / 100),
      commissionPercent: commission,
      currentGuests: paid.filter((b) => b.checkIn <= t && b.checkOut > t).length,
      upcoming: paid.filter((b) => b.checkIn > t).length,
      byMonth: Object.entries(byMonth).map(([month, amount]) => ({ month, amount })),
    };
  }
}

@Controller()
export class BookingsController {
  constructor(
    private readonly svc: BookingsService,
    private readonly promos: PromotionsService,
  ) {}

  @Get('promotions/check') async checkPromo(@Query('code') code: string) {
    const p = await this.promos.findValid(code);
    if (!p) throw new NotFoundException('Промокод недійсний або прострочений');
    return { code: p.promoCode, name: p.name, discountPercent: p.discountPercent };
  }

  @Get('bookings/quote') quote(
    @Query('roomId', ParseIntPipe) roomId: number,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('promoCode') promoCode?: string,
  ) {
    return this.svc.quote(roomId, checkIn, checkOut, promoCode);
  }

  @Get('bookings/my') @UseGuards(AuthGuard) mine(@CurrentUser() u: User) {
    return this.svc.mine(u);
  }

  @Post('bookings') @UseGuards(AuthGuard) create(@CurrentUser() u: User, @Body() dto: CreateBookingDto) {
    return this.svc.create(u, dto);
  }

  @Get('bookings/:id') @UseGuards(AuthGuard) one(@CurrentUser() u: User, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getOne(u, id);
  }

  @Post('bookings/:id/payment-intent') @UseGuards(AuthGuard) intent(
    @CurrentUser() u: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.createIntent(u, id);
  }

  @Post('bookings/:id/pay') @UseGuards(AuthGuard) pay(
    @CurrentUser() u: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayDto,
  ) {
    return this.svc.pay(u, id, dto);
  }

  @Post('bookings/:id/cancel') @UseGuards(AuthGuard) cancel(
    @CurrentUser() u: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(u, id);
  }

  @Get('partner/bookings') @UseGuards(AuthGuard) @Roles(Role.PARTNER, Role.ADMIN) partner(@CurrentUser() u: User) {
    return this.svc.forPartner(u);
  }

  @Get('partner/stats') @UseGuards(AuthGuard) @Roles(Role.PARTNER, Role.ADMIN) stats(@CurrentUser() u: User) {
    return this.svc.partnerStats(u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Room, Hotel, Payment, Promotion, User]), HotelsModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    PromotionsService,
    { provide: PAYMENT_SYSTEM, useFactory: paymentSystemFactory },
  ],
  exports: [BookingsService, PAYMENT_SYSTEM],
})
export class BookingsModule {}
