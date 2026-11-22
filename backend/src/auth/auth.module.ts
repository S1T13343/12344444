import {
  Body,
  ConflictException,
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Role } from '../common/enums';
import { User } from '../entities';
import { AuthGuard, CurrentUser } from './auth.guard';

class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn([Role.CLIENT, Role.PARTNER]) role?: Role;
  @IsOptional() @IsString() companyName?: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class ProfileDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() @MinLength(6) newPassword?: string;
}

export function publicUser(u: User) {
  const { passwordHash: _ph, ...rest } = u as User & { passwordHash?: string };
  return rest;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  private issue(user: User) {
    return { token: this.jwt.sign({ sub: user.id, role: user.role }), user: publicUser(user) };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException('Користувач з таким email вже існує');
    }
    const user = await this.users.save(
      this.users.create({
        name: dto.name.trim(),
        email,
        phone: dto.phone ?? null,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role ?? Role.CLIENT,
        companyName: dto.role === Role.PARTNER ? dto.companyName ?? dto.name : null,
        partnerType: dto.role === Role.PARTNER ? 'HOTEL' : null,
      }),
    );
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email.toLowerCase().trim() })
      .getOne();
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Невірний email або пароль');
    }
    if (user.isBlocked) throw new UnauthorizedException('Акаунт заблоковано');
    return this.issue(user);
  }

  async updateProfile(user: User, dto: ProfileDto) {
    if (dto.name) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.newPassword) user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    return publicUser(await this.users.save(user));
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me') @UseGuards(AuthGuard) me(@CurrentUser() user: User) {
    return publicUser(user);
  }

  @Patch('me') @UseGuards(AuthGuard) update(@CurrentUser() user: User, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(user, dto);
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'staybook-dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, JwtModule, TypeOrmModule],
})
export class AuthModule {}
