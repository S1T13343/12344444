import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Кеш пошуку і блокування номерів на час оплати.
 * Redis, якщо задано REDIS_URL, інакше — пам'ять процесу (для локальної розробки).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly log = new Logger('Cache');
  private redis: Redis | null = null;
  private mem = new Map<string, { v: string; exp: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 2 });
      this.redis.on('error', (e) => this.log.warn(`Redis: ${e.message}`));
      this.log.log(`Redis: ${url}`);
    } else {
      this.log.log("REDIS_URL не задано — кеш у пам'яті");
    }
  }

  get mode() {
    return this.redis ? 'redis' : 'memory';
  }

  private memGet(key: string): string | null {
    const e = this.mem.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return e.v;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.redis ? await this.redis.get(key) : this.memGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redis) await this.redis.set(key, raw, 'EX', ttlSec);
    else this.mem.set(key, { v: raw, exp: Date.now() + ttlSec * 1000 });
  }

  /** Атомарно встановлює ключ, лише якщо його ще немає (SET NX) */
  async setNX(key: string, value: string, ttlSec: number): Promise<boolean> {
    if (this.redis) return (await this.redis.set(key, value, 'EX', ttlSec, 'NX')) === 'OK';
    if (this.memGet(key) !== null) return false;
    this.mem.set(key, { v: JSON.stringify(value), exp: Date.now() + ttlSec * 1000 });
    return true;
  }

  async getRaw(key: string): Promise<string | null> {
    if (this.redis) return this.redis.get(key);
    const v = this.memGet(key);
    return v === null ? null : (JSON.parse(v) as string);
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    if (this.redis) await this.redis.del(...keys);
    else keys.forEach((k) => this.mem.delete(k));
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (this.redis) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.redis.del(...keys);
      } while (cursor !== '0');
    } else {
      for (const k of this.mem.keys()) if (k.startsWith(prefix)) this.mem.delete(k);
    }
  }

  async ping(): Promise<boolean> {
    if (!this.redis) return true;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
