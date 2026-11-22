import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { publicUser } from '../auth/auth.module';
import { addDays, isIsoDate, today } from '../common/dates';
import { BookingStatus, PaymentStatus, Role, TicketStatus } from '../common/enums';
import { Booking, Hotel, Notification, Payment, Promotion, SupportTicket, User } from '../entities';
import { HotelsModule, HotelsService } from '../hotels/hotels.module';
import { NotificationService } from '../notifications/notifications.module';

class PromotionDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(3) promoCode!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(90) discountPercent!: number;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class TicketAnswerDto {
  @IsIn(Object.values(TicketStatus)) status!: TicketStatus;
  @IsOptional() @IsString() answer?: string;
}

class UserPatchDto {
  @IsOptional() @IsBoolean() isBlocked?: boolean;
  @IsOptional() @IsIn(Object.values(Role)) role?: Role;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Hotel) private readonly hotels: Repository<Hotel>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Promotion) private readonly promos: Repository<Promotion>,
    @InjectRepository(SupportTicket) private readonly tickets: Repository<SupportTicket>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly hotelsSvc: HotelsService,
    private readonly notify: NotificationService,
  ) {}

  async stats() {
    const [users, partners, hotels, bookings, openTickets] = await Promise.all([
      this.users.count({ where: { role: Role.CLIENT } }),
      this.users.count({ where: { role: Role.PARTNER } }),
      this.hotels.count(),
      this.bookings.count({ where: [{ status: BookingStatus.CONFIRMED }, { status: BookingStatus.COMPLETED }] }),
      this.tickets.count({ where: { status: TicketStatus.OPEN } }),
    ]);
    const report = await this.report(addDays(today(), -30), today());
    return { users, partners, hotels, bookings, openTickets, last30: report };
  }

  /** Адміністратор.переглянутиЗвіт(період) → ФінансовийЗвіт */
  async report(from?: string, to?: string) {
    const start = isIsoDate(from) ? from : addDays(today(), -30);
    const end = isIsoDate(to) ? to : today();
    const list = await this.payments.find({ relations: { booking: true } });
    const inRange = list.filter((p) => {
      const d = new Date(p.createdAt).toISOString().slice(0, 10);
      return d >= start && d <= end;
    });
    const success = inRange.filter((p) => p.status === PaymentStatus.SUCCESS);
    const refunded = inRange.filter((p) => p.status === PaymentStatus.REFUNDED);
    const totalRevenue = success.reduce((s, p) => s + p.amount, 0);
    const pct = Number(process.env.COMMISSION_PERCENT || 10);
    return {
      periodStart: start,
      periodEnd: end,
      payments: success.length,
      refunds: refunded.length,
      refundedAmount: refunded.reduce((s, p) => s + p.amount, 0),
      totalRevenue,
      commissionPercent: pct,
      commission: Math.round((totalRevenue * pct) / 100),
    };
  }

  async listUsers() {
    const list = await this.users.find({ order: { id: 'ASC' } });
    return list.map(publicUser);
  }

  async patchUser(id: number, dto: UserPatchDto) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException();
    if (u.role === Role.ADMIN && dto.isBlocked) throw new BadRequestException('Не можна заблокувати адміністратора');
    Object.assign(u, dto);
    return publicUser(await this.users.save(u));
  }

  listHotels() {
    return this.hotels.find({ relations: { owner: true, rooms: true }, order: { id: 'ASC' } }).then((hs) =>
      hs.map(({ owner, rooms, ...h }) => ({
        ...h,
        ownerName: owner.companyName || owner.name,
        rooms: rooms.length,
      })),
    );
  }

  async toggleHotel(id: number, isActive: boolean) {
    await this.hotels.update(id, { isActive });
    await this.hotelsSvc.invalidateSearch();
    return { ok: true };
  }

  listBookings() {
    return this.bookings.find({
      relations: { room: { hotel: true }, client: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  listPromotions() {
    return this.promos.find({ order: { id: 'DESC' } });
  }

  async savePromotion(dto: PromotionDto, id?: number) {
    if (!isIsoDate(dto.startDate) || !isIsoDate(dto.endDate) || dto.endDate < dto.startDate) {
      throw new BadRequestException('Невірний період акції');
    }
    const data = { ...dto, promoCode: dto.promoCode.trim().toUpperCase(), isActive: dto.isActive ?? true };
    if (id) {
      await this.promos.update(id, data);
      return this.promos.findOneBy({ id });
    }
    if (await this.promos.findOneBy({ promoCode: data.promoCode })) {
      throw new BadRequestException('Такий промокод уже існує');
    }
    return this.promos.save(this.promos.create(data));
  }

  listTickets() {
    return this.tickets.find({ relations: { client: true }, order: { createdAt: 'DESC' } });
  }

  /** Адміністратор.обробитиЗвернення(id) */
  async answerTicket(id: number, dto: TicketAnswerDto) {
    const t = await this.tickets.findOne({ where: { id }, relations: { client: true } });
    if (!t) throw new NotFoundException();
    t.status = dto.status;
    if (dto.answer !== undefined) t.answer = dto.answer;
    await this.tickets.save(t);
    if (dto.answer) {
      await this.notify.send({
        type: 'SUPPORT_ANSWER',
        to: t.client.email,
        userId: t.clientId,
        subject: `Відповідь на звернення «${t.subject}»`,
        html: `<p>${dto.answer.replace(/</g, '&lt;')}</p>`,
      });
    }
    return t;
  }

  listNotifications() {
    return this.notifications.find({ order: { sentAt: 'DESC' }, take: 100 });
  }
}

@Controller('admin')
@UseGuards(AuthGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('stats') stats() {
    return this.svc.stats();
  }
  @Get('report') report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.report(from, to);
  }
  @Get('users') users() {
    return this.svc.listUsers();
  }
  @Patch('users/:id') patchUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UserPatchDto) {
    return this.svc.patchUser(id, dto);
  }
  @Get('hotels') hotels() {
    return this.svc.listHotels();
  }
  @Patch('hotels/:id') toggleHotel(@Param('id', ParseIntPipe) id: number, @Body('isActive') isActive: boolean) {
    return this.svc.toggleHotel(id, !!isActive);
  }
  @Get('bookings') bookings() {
    return this.svc.listBookings();
  }
  @Get('promotions') promotions() {
    return this.svc.listPromotions();
  }
  @Post('promotions') createPromo(@Body() dto: PromotionDto) {
    return this.svc.savePromotion(dto);
  }
  @Patch('promotions/:id') updatePromo(@Param('id', ParseIntPipe) id: number, @Body() dto: PromotionDto) {
    return this.svc.savePromotion(dto, id);
  }
  @Get('support') tickets() {
    return this.svc.listTickets();
  }
  @Patch('support/:id') answer(@Param('id', ParseIntPipe) id: number, @Body() dto: TicketAnswerDto) {
    return this.svc.answerTicket(id, dto);
  }
  @Get('notifications') notifications() {
    return this.svc.listNotifications();
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Hotel, Booking, Payment, Promotion, SupportTicket, Notification]),
    HotelsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
