import { Body, Controller, Get, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsString, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { SupportTicket, User } from '../entities';

class TicketDto {
  @IsString() @MinLength(3) subject!: string;
  @IsString() @MinLength(5) text!: string;
}

@Injectable()
export class SupportService {
  constructor(@InjectRepository(SupportTicket) private readonly repo: Repository<SupportTicket>) {}

  /** Клієнт.звернутисяВПідтримку(тема) */
  create(user: User, dto: TicketDto) {
    return this.repo.save(this.repo.create({ ...dto, clientId: user.id }));
  }

  mine(user: User) {
    return this.repo.find({ where: { clientId: user.id }, order: { createdAt: 'DESC' } });
  }
}

@Controller('support')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Post() create(@CurrentUser() u: User, @Body() dto: TicketDto) {
    return this.svc.create(u, dto);
  }

  @Get('my') mine(@CurrentUser() u: User) {
    return this.svc.mine(u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
