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
import { ERROR_MESSAGES } from './constants/error-messages.constants';

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
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        ERROR_MESSAGES.ACCOUNT_STATUS(user.status.toLowerCase()),
      );
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.ACCOUNT_PENDING_VERIFICATION,
      );
    }

    // * Check for password (OAuth users won't have one)
    if (!user.password) {
      throw new UnauthorizedException(ERROR_MESSAGES.PASSWORD_NOT_SET);
    }

    const isMatch = await this.hashService.compare(password, user.password);
    if (!isMatch) {
      await this.userService.updateLoginAttempts(user.id); // * Increment failed attempts
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
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
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN_PAYLOAD);
      }

      const user = await this.userService.getUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException(ERROR_MESSAGES.ACCOUNT_NOT_ACTIVE);
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
      throw new UnauthorizedException(
        ERROR_MESSAGES.INVALID_OR_EXPIRED_REFRESH_TOKEN,
      );
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
