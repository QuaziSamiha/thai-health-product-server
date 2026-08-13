import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { DeliveryManModule } from './modules/delivery-man/delivery-man.module';
import { AuthModule } from './modules/auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { OtpModule } from './modules/otp/otp.module';
import { SessionModule } from './modules/session/session.module';
import { MailModule } from './modules/mail/mail.module';
import { CategoryModule } from './modules/category/category.module';
import { ProductModule } from './modules/product/product.module';
import { BlogModule } from './modules/blog/blog.module';
import { HomeModule } from './modules/home/home.module';
import { SupportModule } from './modules/support/support.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ComboProductModule } from './modules/combo-product/combo-product.module';
import { AddressModule } from './modules/address/address.module';
import { OrderModule } from './modules/order/order.module';
import { PromotionModule } from './modules/promotion/promotion.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { validate } from './config/env.validation';
import appConfig from './config/app.config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  LoggerModule,
  RequestContextMiddleware,
  LoggingInterceptor,
} from './shared/logger';

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
      exclude: ['/uploads/{*any}'],
    }),

    LoggerModule,
    PrismaModule,
    HealthModule,
    UserModule,
    DeliveryManModule,
    AuthModule,
    OtpModule,
    SessionModule,
    MailModule,
    CategoryModule,
    ProductModule,
    BlogModule,
    HomeModule,
    SupportModule,
    ComboProductModule,
    InventoryModule,
    AddressModule,
    PromotionModule,
    OrderModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
