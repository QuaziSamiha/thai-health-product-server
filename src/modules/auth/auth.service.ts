import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HashService } from '../../shared/hash/hash.service';
import { UserStatus } from '../../generated/prisma/enums';
import { UserResponseDto } from '../user/dto/user-response.dto';
// import type { SignOptions } from 'jsonwebtoken';
import { IJwtPayload, ITokens } from './interfaces/jwt-payload.interface';
import { LoginDto } from './dto/login.dto';
import { TokensResponseDto } from './dto/token-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private hashService: HashService,
  ) {}

  async validateUser(
    email: string,
    password: string,
    ip?: string,
  ): Promise<UserResponseDto> {
    const user = await this.userService.findForAuth(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.SUSPENDED
    ) {
      throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException(
        'Account is not active. Please verify your email before logging in',
      );
    }

    // * Check for password (OAuth users won't have one)
    if (!user.password) {
      throw new UnauthorizedException(
        'Password not set. Please use third-party (Google, Facebook) login.',
      );
    }

    const isMatch = await this.hashService.compare(password, user.password);
    if (!isMatch) {
      await this.userService.updateLoginAttempts(user.id); // * Increment failed attempts
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.userService.updateLoginSuccess(user.id, ip);
    await this.userService.updateLastLoginTime(user.id);

    // const loginPayload = {
    //   id: user.id,
    //   email: user.email,
    //   role: user.role,
    // };
    // return loginPayload;
    return new UserResponseDto({
      id: user.id,
      sid: user.sid,
      email: user.email,
      phone: user.phone ?? undefined,
      role: user.role,
      status: user.status,
      authProvider: user.authProvider,
      providerId: user.providerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async login(loginDto: LoginDto, ip?: string): Promise<TokensResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password, ip);

    const payload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const tokens = await this.generateTokens(payload);
    return new TokensResponseDto(tokens);
  }

  async refreshToken(refreshToken: string): Promise<TokensResponseDto> {
    const authConfig = this.configService.get('auth');
    try {
      const payload = await this.jwtService.verifyAsync<IJwtPayload>(
        refreshToken,
        {
          secret: authConfig?.refreshSecret,
        },
      );

      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      const user = await this.userService.getUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      // 5. Generate new pair
      const tokens = await this.generateTokens({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return new TokensResponseDto(tokens);
    } catch (error: unknown) {
      this.logger.warn('Refresh token validation failed', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async generateTokens(payload: IJwtPayload): Promise<ITokens> {
    const authConfig = this.configService.get('auth');
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: authConfig?.accessSecret,
        expiresIn: authConfig?.accessExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: payload.sub },
        {
          secret: authConfig?.refreshSecret,
          expiresIn: authConfig?.refreshExpiresIn,
        },
      ),
    ]);

    return { access_token: at, refresh_token: rt };
  }
}
