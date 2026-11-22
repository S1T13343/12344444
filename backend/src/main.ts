import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // CSP вимкнено: сайт вантажить тайли OpenStreetMap, Stripe.js і Google Maps із зовнішніх доменів
  // Referrer-Policy: OpenStreetMap блокує тайли (403) для запитів без заголовка Referer,
  // а helmet за замовчуванням ставить no-referrer — тому явно дозволяємо origin.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Журнал запитів (моніторинг і логування)
  const log = new Logger('HTTP');
  app.use((req: any, res: any, next: () => void) => {
    const t = Date.now();
    res.on('finish', () => log.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`));
    next();
  });

  // Якщо поруч є зібраний фронтенд (frontend/dist) — віддаємо його з цього ж сервера.
  // Один процес замість двох: зручно для слабких машин і продакшену без nginx.
  const web = process.env.WEB_DIST || join(__dirname, '..', '..', 'frontend', 'dist');
  const serveWeb = existsSync(join(web, 'index.html'));
  if (serveWeb) {
    const server = app.getHttpAdapter().getInstance();
    server.use(express.static(web));
    server.get(/^(?!\/api(\/|$)).*/, (_req: express.Request, res: express.Response) =>
      res.sendFile(join(web, 'index.html')),
    );
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  Logger.log(`StayBook API: http://localhost:${port}/api`, 'Bootstrap');
  if (serveWeb) Logger.log(`StayBook сайт: http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
