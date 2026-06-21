import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { OtpModule } from './modules/otp/otp.module';
import { SessionModule } from './modules/session/session.module';
import { MailModule } from './modules/mail/mail.module';
import { CategoryModule } from './modules/category/category.module';
import { validate } from './config/env.validation';
import appConfig from './config/app.config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [
    //* GLOBAL ROOT — ONLY HANDLES ENV FILE LOADING + SHAPE VALIDATION
    //* NAMESPACED CONFIG (APP, AUTH, DATABASE, ...) IS OWNED AND REGISTERED BY EACH FEATURE MODULE
    ConfigModule.forRoot({
      isGlobal: true, // Make ConfigModule available globally
      expandVariables: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
      cache: true,
      validate,
    }),

    //* APP-WIDE NAMESPACED CONFIG (PORT, API_PREFIX, BASE_URL, NODE_ENV) — OWNED BY THE ROOT MODULE ITSELF
    ConfigModule.forFeature(appConfig),

    ThrottlerModule.forRoot([
      {
        ttl: 60, // * Reset counter after 60 seconds
        limit: 100, // * Allow 100 requests per IP in 60s
      },
    ]),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    PrismaModule,
    UserModule,
    AuthModule,
    OtpModule,
    SessionModule,
    MailModule,
    CategoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
