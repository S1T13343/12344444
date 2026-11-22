import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import { Notification } from '../entities';

export interface SendInput {
  type: string;
  to: string;
  subject: string;
  html: string;
  userId?: number | null;
  bookingId?: number | null;
}

/** СервісСповіщень: листи через Nodemailer (SMTP) + журнал у таблиці notifications */
@Injectable()
export class NotificationService {
  private readonly log = new Logger('Mail');
  private readonly transporter: nodemailer.Transporter;
  private readonly from = process.env.SMTP_FROM || 'StayBook <no-reply@staybook.local>';
  readonly mode: 'smtp' | 'console';

  constructor(@InjectRepository(Notification) private readonly repo: Repository<Notification>) {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      this.mode = 'smtp';
    } else {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.mode = 'console';
    }
    this.log.log(`Режим пошти: ${this.mode}`);
  }

  async send(input: SendInput): Promise<boolean> {
    let delivered = false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: wrap(input.subject, input.html),
      });
      delivered = true;
      if (this.mode === 'console') this.log.log(`[лист → ${input.to}] ${input.subject}`);
    } catch (e) {
      this.log.error(`Не вдалося надіслати лист ${input.to}: ${(e as Error).message}`);
    }
    await this.repo.save(
      this.repo.create({
        type: input.type,
        channel: 'email',
        recipient: input.to,
        subject: input.subject,
        text: input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        delivered,
        userId: input.userId ?? null,
        bookingId: input.bookingId ?? null,
      }),
    );
    return delivered;
  }
}

function wrap(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
  <div style="background:#0f4c5c;color:#fff;padding:16px 20px;font-size:20px;font-weight:bold">StayBook</div>
  <div style="padding:20px;border:1px solid #e3e8ea"><h2 style="margin-top:0">${title}</h2>${body}</div>
  <p style="color:#888;font-size:12px">Цей лист надіслано автоматично сервісом StayBook.</p></div>`;
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
