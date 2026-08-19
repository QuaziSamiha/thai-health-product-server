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
import { AppThrottlerModule } from './common/throttler/throttler.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { OtpModule } from './modules/otp/otp.module';
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
import { AuditLogModule } from './modules/audit-log/audit-log.module';
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

    //* RATE LIMITING — OWNS THE 'throttler' CONFIG NAMESPACE, THE NAMED short/long TIERS,
    //* AND THE APP_GUARD THAT ENFORCES THEM. IMPORTED FIRST SO THE THROTTLER IS THE FIRST
    //* GUARD IN THE PIPELINE AND PROTECTS THE AUTH PATH ITSELF.
    //*
    //* REPLACED `ThrottlerModule.forRoot([{ ttl: 60, limit: 100 }])`, WHICH HAD TWO BUGS:
    //* IT REGISTERED NO GUARD (SO IT ENFORCED NOTHING AT ALL), AND ITS ttl WAS READ AS
    //* 60 **MILLISECONDS** — @nestjs/throttler CHANGED THE UNIT IN v5 AND THIS APP IS ON
    //* v6.5.0, SO THE "RESET COUNTER AFTER 60 SECONDS" COMMENT WAS WRONG BY 1000x.
    AppThrottlerModule,

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      exclude: ['/uploads/{*any}'],
    }),

    //* CRON HOST. REGISTERED ONCE AT THE ROOT SO EVERY @Cron/@Interval HANDLER
    //* IN THE APP IS DISCOVERED BY THE SAME SCHEDULER. TODAY THAT IS ONLY
    //* ComboExpiryService, WHICH RETIRES COMBOS PAST THEIR END DATE.
    //*
    //* NOTE FOR MULTI-INSTANCE DEPLOYMENTS: THIS SCHEDULER IS PER-PROCESS, SO
    //* N REPLICAS RUN N COPIES OF EVERY JOB. THAT IS HARMLESS FOR THE EXPIRY
    //* SWEEP — IT IS AN IDEMPOTENT `UPDATE ... WHERE status = 'ACTIVE'`, SO A
    //* SECOND RUNNER SIMPLY MATCHES NOTHING — BUT ANY FUTURE JOB WITH SIDE
    //* EFFECTS (SENDING MAIL, CHARGING A CARD) NEEDS A LOCK BEFORE IT IS ADDED
    //* HERE.
    ScheduleModule.forRoot(),

    LoggerModule,
    PrismaModule,
    HealthModule,
    UserModule,
    DeliveryManModule,
    AuthModule,
    OtpModule,
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
    AuditLogModule,
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
