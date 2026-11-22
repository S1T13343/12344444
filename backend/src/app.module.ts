import { Controller, Get, Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { DataSource } from 'typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CacheModule, CacheService } from './cache/cache.service';
import { ENTITIES } from './entities';
import { HotelsModule } from './hotels/hotels.module';
import { NotificationService, NotificationsModule } from './notifications/notifications.module';
import { PAYMENT_SYSTEM, PaymentSystem } from './payments/payment-system';
import { seed } from './seed';
import { SupportModule } from './support/support.module';

function dbConfig(): TypeOrmModuleOptions {
  if (process.env.DATABASE_URL) {
    return { type: 'postgres', url: process.env.DATABASE_URL, entities: ENTITIES, synchronize: true };
  }
  mkdirSync('data', { recursive: true });
  return { type: 'sqljs', location: 'data/staybook.sqlite', autoSave: true, entities: ENTITIES, synchronize: true };
}

@Controller()
class SystemController {
  constructor(
    private readonly ds: DataSource,
    private readonly cache: CacheService,
    private readonly mail: NotificationService,
    @Inject(PAYMENT_SYSTEM) private readonly pay: PaymentSystem,
  ) {}

  /** Моніторинг: стан системи */
  @Get('health') async health() {
    let db = false;
    try {
      await this.ds.query('SELECT 1');
      db = true;
    } catch {
      /* noop */
    }
    return {
      status: db ? 'ok' : 'degraded',
      db: { ok: db, type: this.ds.options.type },
      cache: { ok: await this.cache.ping(), mode: this.cache.mode },
      payments: this.pay.mode,
      mail: this.mail.mode,
      uptimeSec: Math.round(process.uptime()),
    };
  }

  /** Публічна конфігурація для клієнта */
  @Get('config') config() {
    return {
      paymentMode: this.pay.mode,
      stripePublishableKey: this.pay.mode === 'stripe' ? process.env.STRIPE_PUBLISHABLE_KEY || null : null,
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || null,
    };
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot(dbConfig()),
    CacheModule,
    NotificationsModule,
    AuthModule,
    HotelsModule,
    BookingsModule,
    SupportModule,
    AdminModule,
  ],
  controllers: [SystemController],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ds: DataSource) {}
  async onApplicationBootstrap() {
    await seed(this.ds);
  }
}
