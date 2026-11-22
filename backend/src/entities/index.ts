import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BookingStatus, PaymentStatus, Role, RoomType, TicketStatus } from '../common/enums';

/**
 * Користувач (базовий клас). Нащадки Клієнт / Партнер / Адміністратор
 * зберігаються в одній таблиці і розрізняються полем role.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', unique: true }) email!: string;
  @Column({ type: 'varchar', nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', select: false }) passwordHash!: string;
  @Column({ type: 'varchar', default: Role.CLIENT }) role!: Role;
  @CreateDateColumn() registeredAt!: Date;
  @Column({ type: 'boolean', default: false }) isBlocked!: boolean;

  // Клієнт
  @Column({ type: 'int', default: 0 }) bonusPoints!: number;
  // Партнер
  @Column({ type: 'varchar', nullable: true }) companyName!: string | null;
  @Column({ type: 'varchar', nullable: true }) partnerType!: string | null;
  // Адміністратор
  @Column({ type: 'int', default: 0 }) accessLevel!: number;

  @OneToMany(() => Hotel, (h) => h.owner) hotels!: Hotel[];
  @OneToMany(() => Booking, (b) => b.client) bookings!: Booking[];
}

@Entity('hotels')
export class Hotel {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) address!: string;
  @Column({ type: 'varchar' }) city!: string;
  @Column({ type: 'int', default: 3 }) stars!: number;
  @Column({ type: 'float', default: 0 }) rating!: number;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ type: 'float' }) lat!: number;
  @Column({ type: 'float' }) lng!: number;
  @Column({ type: 'simple-json', nullable: true }) amenities!: string[] | null;
  @Column({ type: 'int', default: 200 }) hue!: number; // колір обкладинки-заглушки
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;

  @Column({ type: 'int' }) ownerId!: number;
  @ManyToOne(() => User, (u) => u.hotels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner!: User;

  @OneToMany(() => Room, (r) => r.hotel, { cascade: true }) rooms!: Room[];
}

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) roomNumber!: string;
  @Column({ type: 'varchar', default: RoomType.STANDARD }) type!: RoomType;
  @Column({ type: 'int', default: 2 }) capacity!: number;
  @Column({ type: 'int' }) pricePerNight!: number; // грн
  @Column({ type: 'simple-json', nullable: true }) amenities!: string[] | null;

  @Column({ type: 'int' }) hotelId!: number;
  @ManyToOne(() => Hotel, (h) => h.rooms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hotelId' })
  hotel!: Hotel;
}

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'int' }) discountPercent!: number;
  @Column({ type: 'date' }) startDate!: string;
  @Column({ type: 'date' }) endDate!: string;
  @Column({ type: 'varchar', unique: true }) promoCode!: string;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'date' }) checkIn!: string;
  @Column({ type: 'date' }) checkOut!: string;
  @Column({ type: 'int' }) guests!: number;
  @Column({ type: 'int' }) nights!: number;
  @Column({ type: 'varchar', default: BookingStatus.PENDING_PAYMENT }) status!: BookingStatus;
  @Column({ type: 'int' }) basePrice!: number;
  @Column({ type: 'int', default: 0 }) discount!: number;
  @Column({ type: 'int' }) totalPrice!: number;
  @Column({ type: 'varchar', nullable: true }) promoCode!: string | null;
  @Column({ type: 'varchar' }) guestName!: string;
  @Column({ type: 'varchar' }) guestEmail!: string;
  @Column({ type: 'varchar', nullable: true }) guestPhone!: string | null;
  @Column({ type: 'text', nullable: true }) comment!: string | null;
  @CreateDateColumn() createdAt!: Date;

  @Column({ type: 'int' }) clientId!: number;
  @ManyToOne(() => User, (u) => u.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client!: User;

  @Column({ type: 'int' }) roomId!: number;
  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room!: Room;

  @OneToMany(() => Payment, (p) => p.booking) payments!: Payment[];
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) amount!: number;
  @Column({ type: 'varchar', default: 'UAH' }) currency!: string;
  @Column({ type: 'varchar' }) method!: string; // stripe | mock
  @Column({ type: 'varchar', default: PaymentStatus.CREATED }) status!: PaymentStatus;
  @Column({ type: 'varchar', nullable: true }) transactionId!: string | null;
  @Column({ type: 'varchar', nullable: true }) error!: string | null;
  @CreateDateColumn() createdAt!: Date;

  @Column({ type: 'int' }) bookingId!: number;
  @ManyToOne(() => Booking, (b) => b.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookingId' })
  booking!: Booking;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) type!: string;
  @Column({ type: 'varchar', default: 'email' }) channel!: string;
  @Column({ type: 'varchar' }) recipient!: string;
  @Column({ type: 'varchar' }) subject!: string;
  @Column({ type: 'text' }) text!: string;
  @Column({ type: 'boolean', default: false }) delivered!: boolean;
  @CreateDateColumn() sentAt!: Date;
  @Column({ type: 'int', nullable: true }) userId!: number | null;
  @Column({ type: 'int', nullable: true }) bookingId!: number | null;
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) subject!: string;
  @Column({ type: 'text' }) text!: string;
  @Column({ type: 'varchar', default: TicketStatus.OPEN }) status!: TicketStatus;
  @Column({ type: 'text', nullable: true }) answer!: string | null;
  @CreateDateColumn() createdAt!: Date;

  @Column({ type: 'int' }) clientId!: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client!: User;
}

export const ENTITIES = [User, Hotel, Room, Promotion, Booking, Payment, Notification, SupportTicket];
