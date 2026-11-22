import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Repository } from 'typeorm';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import { CacheService } from '../cache/cache.service';
import { addDays, isIsoDate, nightsBetween, today } from '../common/dates';
import { BookingStatus, Role, RoomType } from '../common/enums';
import { Booking, Hotel, Room, User } from '../entities';
import { AvailabilityService } from './availability.service';

export class SearchQuery {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() checkIn?: string;
  @IsOptional() @IsString() checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @IsOptional() @Type(() => Number) @IsInt() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() stars?: number;
  @IsOptional() @IsIn(Object.values(RoomType)) type?: RoomType;
  @IsOptional() @IsIn(['price', '-price', 'rating', 'stars']) sort?: string;
}

class HotelDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() city!: string;
  @IsString() address!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) stars!: number;
  @Type(() => Number) @IsNumber() lat!: number;
  @Type(() => Number) @IsNumber() lng!: number;
  @IsOptional() @IsArray() amenities?: string[];
  @IsOptional() @IsArray() @IsUrl({ protocols: ['https'] }, { each: true }) photos?: string[];
}

class RoomDto {
  @IsString() roomNumber!: string;
  @IsIn(Object.values(RoomType)) type!: RoomType;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) capacity!: number;
  @Type(() => Number) @IsInt() @Min(1) pricePerNight!: number;
  @IsOptional() @IsArray() amenities?: string[];
}

export function normalizeDates(checkIn?: string, checkOut?: string) {
  const ci = isIsoDate(checkIn) ? checkIn : addDays(today(), 1);
  const co = isIsoDate(checkOut) ? checkOut : addDays(ci, 1);
  if (nightsBetween(ci, co) < 1) throw new BadRequestException('Дата виїзду має бути пізніше дати заїзду');
  if (nightsBetween(ci, co) > 60) throw new BadRequestException('Максимум 60 ночей');
  return { checkIn: ci, checkOut: co };
}

@Injectable()
export class HotelsService {
  constructor(
    @InjectRepository(Hotel) private readonly hotels: Repository<Hotel>,
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly availability: AvailabilityService,
    private readonly cache: CacheService,
  ) {}

  /** Гість.шукатиНомери(фільтр) — з кешуванням результату в Redis на 60 с */
  async search(q: SearchQuery) {
    const { checkIn, checkOut } = normalizeDates(q.checkIn, q.checkOut);
    const guests = q.guests ?? 1;
    const cacheKey = 'search:' + JSON.stringify({ ...q, checkIn, checkOut, guests });
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const qb = this.hotels
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.rooms', 'r')
      .where('h.isActive = :active', { active: true });
    if (q.stars) qb.andWhere('h.stars >= :stars', { stars: q.stars });
    // Місто фільтруємо в JS: LOWER() у SQLite не працює з кирилицею
    const city = q.city?.trim().toLowerCase();
    const hotels = (await qb.getMany()).filter((h) => !city || h.city.toLowerCase().includes(city));

    const allRoomIds = hotels.flatMap((h) => h.rooms.map((r) => r.id));
    const busy = await this.availability.busyRoomIds(allRoomIds, checkIn, checkOut);
    const nights = nightsBetween(checkIn, checkOut);

    let results = hotels
      .map((h) => {
        const free = h.rooms.filter(
          (r) =>
            !busy.has(r.id) &&
            r.capacity >= guests &&
            (!q.type || r.type === q.type) &&
            (q.minPrice == null || r.pricePerNight >= q.minPrice) &&
            (q.maxPrice == null || r.pricePerNight <= q.maxPrice),
        );
        if (!free.length) return null;
        const minPrice = Math.min(...free.map((r) => r.pricePerNight));
        const { rooms: _r, ...hotel } = h;
        return { ...hotel, minPrice, totalFrom: minPrice * nights, freeRooms: free.length };
      })
      .filter(<T>(x: T | null): x is T => x !== null);

    const sorters: Record<string, (a: (typeof results)[0], b: (typeof results)[0]) => number> = {
      price: (a, b) => a.minPrice - b.minPrice,
      '-price': (a, b) => b.minPrice - a.minPrice,
      rating: (a, b) => b.rating - a.rating,
      stars: (a, b) => b.stars - a.stars,
    };
    results = results.sort(sorters[q.sort ?? 'rating']);

    const out = { checkIn, checkOut, nights, guests, count: results.length, hotels: results };
    await this.cache.set(cacheKey, out, 60);
    return out;
  }

  async cities() {
    const rows = await this.hotels
      .createQueryBuilder('h')
      .select('h.city', 'city')
      .addSelect('COUNT(h.id)', 'count')
      .where('h.isActive = :a', { a: true })
      .groupBy('h.city')
      .orderBy('count', 'DESC')
      .getRawMany<{ city: string; count: string }>();
    return rows.map((r) => ({ city: r.city, count: Number(r.count) }));
  }

  /** Сторінка готелю + номери з доступністю на дати */
  async details(id: number, checkIn?: string, checkOut?: string, guests?: number) {
    const hotel = await this.hotels.findOne({ where: { id }, relations: { rooms: true, owner: true } });
    if (!hotel || !hotel.isActive) throw new NotFoundException('Готель не знайдено');
    const dates = normalizeDates(checkIn, checkOut);
    const busy = await this.availability.busyRoomIds(
      hotel.rooms.map((r) => r.id),
      dates.checkIn,
      dates.checkOut,
    );
    const nights = nightsBetween(dates.checkIn, dates.checkOut);
    const rooms = hotel.rooms
      .sort((a, b) => a.pricePerNight - b.pricePerNight)
      .map((r) => ({
        ...r,
        available: !busy.has(r.id),
        fitsGuests: r.capacity >= (guests ?? 1),
        total: r.pricePerNight * nights,
      }));
    const { owner, ...rest } = hotel;
    return {
      ...rest,
      rooms,
      ownerName: owner.companyName || owner.name,
      ...dates,
      nights,
    };
  }

  invalidateSearch() {
    return this.cache.delByPrefix('search:');
  }

  // ---------- Партнер.керуватиГотелями() ----------

  private async ownHotel(user: User, id: number) {
    const hotel = await this.hotels.findOne({ where: { id }, relations: { rooms: true } });
    if (!hotel) throw new NotFoundException('Готель не знайдено');
    if (hotel.ownerId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException('Це не ваш готель');
    return hotel;
  }

  myHotels(user: User) {
    return this.hotels.find({ where: { ownerId: user.id }, relations: { rooms: true }, order: { id: 'ASC' } });
  }

  async createHotel(user: User, dto: HotelDto) {
    const hotel = await this.hotels.save(
      this.hotels.create({
        ...dto,
        description: dto.description ?? '',
        amenities: dto.amenities ?? [],
        photos: dto.photos ?? [],
        ownerId: user.id,
        hue: Math.floor(Math.random() * 360),
      }),
    );
    await this.invalidateSearch();
    return hotel;
  }

  async updateHotel(user: User, id: number, dto: Partial<HotelDto>) {
    const hotel = await this.ownHotel(user, id);
    const { rooms: _r, ...base } = hotel;
    const saved = await this.hotels.save({ ...base, ...dto });
    await this.invalidateSearch();
    return saved;
  }

  async addRoom(user: User, hotelId: number, dto: RoomDto) {
    await this.ownHotel(user, hotelId);
    const room = await this.rooms.save(this.rooms.create({ ...dto, amenities: dto.amenities ?? [], hotelId }));
    await this.invalidateSearch();
    return room;
  }

  private async ownRoom(user: User, roomId: number) {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Номер не знайдено');
    await this.ownHotel(user, room.hotelId);
    return room;
  }

  async updateRoom(user: User, roomId: number, dto: Partial<RoomDto>) {
    const room = await this.ownRoom(user, roomId);
    const saved = await this.rooms.save({ ...room, ...dto });
    await this.invalidateSearch();
    return saved;
  }

  async deleteRoom(user: User, roomId: number) {
    const room = await this.ownRoom(user, roomId);
    const active = await this.bookings.count({
      where: { roomId, status: BookingStatus.CONFIRMED },
    });
    if (active) throw new BadRequestException('На номер є підтверджені бронювання');
    await this.rooms.delete(room.id);
    await this.invalidateSearch();
    return { ok: true };
  }
}

@Controller('hotels')
export class HotelsController {
  constructor(private readonly svc: HotelsService) {}

  @Get() search(@Query() q: SearchQuery) {
    return this.svc.search(q);
  }

  @Get('cities') cities() {
    return this.svc.cities();
  }

  @Get(':id') details(
    @Param('id', ParseIntPipe) id: number,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('guests') guests?: string,
  ) {
    return this.svc.details(id, checkIn, checkOut, guests ? Number(guests) : undefined);
  }
}

@Controller('partner')
@UseGuards(AuthGuard)
@Roles(Role.PARTNER, Role.ADMIN)
export class PartnerHotelsController {
  constructor(private readonly svc: HotelsService) {}

  @Get('hotels') list(@CurrentUser() u: User) {
    return this.svc.myHotels(u);
  }
  @Post('hotels') create(@CurrentUser() u: User, @Body() dto: HotelDto) {
    return this.svc.createHotel(u, dto);
  }
  @Patch('hotels/:id') update(@CurrentUser() u: User, @Param('id', ParseIntPipe) id: number, @Body() dto: HotelDto) {
    return this.svc.updateHotel(u, id, dto);
  }
  @Post('hotels/:id/rooms') addRoom(
    @CurrentUser() u: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoomDto,
  ) {
    return this.svc.addRoom(u, id, dto);
  }
  @Patch('rooms/:id') updateRoom(@CurrentUser() u: User, @Param('id', ParseIntPipe) id: number, @Body() dto: RoomDto) {
    return this.svc.updateRoom(u, id, dto);
  }
  @Delete('rooms/:id') deleteRoom(@CurrentUser() u: User, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRoom(u, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Hotel, Room, Booking])],
  controllers: [HotelsController, PartnerHotelsController],
  providers: [HotelsService, AvailabilityService],
  exports: [HotelsService, AvailabilityService],
})
export class HotelsModule {}
