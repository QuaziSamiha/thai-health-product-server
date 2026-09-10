import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import analyticsConfig from './config/analytics.config';

//* OWNS NO TABLE — ITS ONLY DATA SOURCE IS THE GA4 DATA API
@Module({
  //* PARTIAL REGISTRATION — ANALYTICSMODULE OWNS THE 'analytics' CONFIG NAMESPACE
  imports: [ConfigModule.forFeature(analyticsConfig)],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
