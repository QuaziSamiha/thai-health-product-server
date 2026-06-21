import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { TokensResponseDto } from './dto/token-response.dto';
import type { Request, Response } from 'express';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  // a post api for third party login (google, facebook, apple)
  //   a post api for logout

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}
  private readonly logger = new Logger(AuthController.name);

  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates user and returns JWT tokens',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TokensResponseDto,
    headers: {
      'Set-Cookie': {
        description: 'Refresh token in HTTP-only cookie',
        schema: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @HttpCode(200)
  @ResponseMessage('Login successful')
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authConfig = this.configService.get('auth');
    this.logger.debug(`Login attempt for ${loginDto.email}`);
    const tokens = await this.authService.login(loginDto, ip);
    this.logger.log(`Successful login for ${loginDto.email}`);
    const refreshTokenExpires = authConfig?.refreshExpiresInMs;

    // parseInt will stop at the first non-numeric character (like a space or #)
    const maxAge = parseInt(refreshTokenExpires, 10);
    res.cookie('refreshToken', tokens.refresh_token, {
      httpOnly: true,
      secure: authConfig?.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: isNaN(maxAge) ? Number(authConfig?.refreshExpiresInMs) : maxAge,
    });

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token, // Include refresh token in response
    };
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates new access token using refresh token (can be provided via cookie or request body)',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokensResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
    content: {
      'application/json': {
        example: {
          statusCode: 401,
          message: 'Invalid refresh token',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Access denied',
    content: {
      'application/json': {
        example: {
          statusCode: 403,
          message: 'Forbidden resource',
        },
      },
    },
  })
  @ApiCookieAuth('refreshToken')
  @ApiBody({
    type: RefreshTokenDto,
    description: 'Optional refresh token in body (if not using cookie)',
    required: false,
  })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed successfully')
  async refresh(
    @Req() req: Request,
    @Body() refreshTokenDto?: RefreshTokenDto,
  ) {
    const cookies = req.cookies as Record<string, string | undefined>;
    const refreshToken = cookies?.refreshToken || refreshTokenDto?.refreshToken;

    if (!refreshToken) {
      throw new BadRequestException('No refresh token provided');
    }

    return this.authService.refreshToken(refreshToken);
  }
}
