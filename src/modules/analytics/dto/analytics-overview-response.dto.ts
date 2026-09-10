import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ANALYTICS_RANGES } from '../constants/analytics.constants';
import type { AnalyticsRange } from '../constants/analytics.constants';

/** One headline metric for the selected window and the window before it. */
export class AnalyticsMetricDto {
  @Expose()
  @ApiProperty({ description: 'Value for the selected window', example: 1_284 })
  value!: number;

  @Expose()
  @ApiProperty({
    description: 'Value for the equally long window immediately before it',
    example: 1_102,
  })
  previous!: number;

  @Expose()
  @ApiProperty({
    description:
      'Percent change from `previous` to `value`, 1dp. Null when `previous` is 0 — a change from nothing has no meaningful percentage.',
    example: 16.5,
    nullable: true,
    type: Number,
  })
  changePercent!: number | null;
}

export class AnalyticsSummaryDto {
  @Expose()
  @ApiProperty({ type: AnalyticsMetricDto })
  @Type(() => AnalyticsMetricDto)
  activeUsers!: AnalyticsMetricDto;

  @Expose()
  @ApiProperty({ type: AnalyticsMetricDto })
  @Type(() => AnalyticsMetricDto)
  newUsers!: AnalyticsMetricDto;

  @Expose()
  @ApiProperty({ type: AnalyticsMetricDto })
  @Type(() => AnalyticsMetricDto)
  sessions!: AnalyticsMetricDto;

  @Expose()
  @ApiProperty({ type: AnalyticsMetricDto })
  @Type(() => AnalyticsMetricDto)
  pageViews!: AnalyticsMetricDto;

  @Expose()
  @ApiProperty({
    type: AnalyticsMetricDto,
    description:
      'Share of sessions that were not engaged, as a percentage (0–100, 1dp)',
  })
  @Type(() => AnalyticsMetricDto)
  bounceRate!: AnalyticsMetricDto;

  @Expose()
  @ApiProperty({
    type: AnalyticsMetricDto,
    description: 'Average session duration in whole seconds',
  })
  @Type(() => AnalyticsMetricDto)
  avgSessionDuration!: AnalyticsMetricDto;
}

export class AnalyticsTrendPointDto {
  @Expose()
  @ApiProperty({
    description: 'Calendar day (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  date!: string;

  @Expose()
  @ApiProperty({ example: 48 })
  activeUsers!: number;

  @Expose()
  @ApiProperty({ example: 61 })
  sessions!: number;

  @Expose()
  @ApiProperty({ example: 212 })
  pageViews!: number;
}

export class AnalyticsChannelDto {
  @Expose()
  @ApiProperty({
    description: 'GA4 default channel group',
    example: 'Organic Search',
  })
  channel!: string;

  @Expose()
  @ApiProperty({ example: 530 })
  sessions!: number;
}

export class AnalyticsCityDto {
  @Expose()
  @ApiProperty({ example: 'Bangkok' })
  city!: string;

  @Expose()
  @ApiProperty({ example: 'Thailand' })
  country!: string;

  @Expose()
  @ApiProperty({ example: 412 })
  activeUsers!: number;
}

export class AnalyticsPageDto {
  @Expose()
  @ApiProperty({ example: '/en/product' })
  path!: string;

  @Expose()
  @ApiProperty({ example: 1_930 })
  pageViews!: number;

  @Expose()
  @ApiProperty({ example: 640 })
  activeUsers!: number;
}

/**
 * The admin analytics page, in one call — built from a single GA4
 * `batchRunReports` request, so every section shares one window and one
 * round trip to Google.
 */
export class AnalyticsOverviewResponseDto {
  @Expose()
  @ApiProperty({ enum: Object.keys(ANALYTICS_RANGES), example: '28d' })
  range!: AnalyticsRange;

  @Expose()
  @ApiProperty({ example: '2026-08-13' })
  startDate!: string;

  @Expose()
  @ApiProperty({ example: '2026-09-09' })
  endDate!: string;

  @Expose()
  @ApiProperty({ example: '2026-07-16' })
  previousStartDate!: string;

  @Expose()
  @ApiProperty({ example: '2026-08-12' })
  previousEndDate!: string;

  @Expose()
  @ApiProperty({ type: AnalyticsSummaryDto })
  @Type(() => AnalyticsSummaryDto)
  summary!: AnalyticsSummaryDto;

  @Expose()
  @ApiProperty({
    type: [AnalyticsTrendPointDto],
    description: 'One point per day of the window, zero-filled',
  })
  @Type(() => AnalyticsTrendPointDto)
  trend!: AnalyticsTrendPointDto[];

  @Expose()
  @ApiProperty({ type: [AnalyticsChannelDto] })
  @Type(() => AnalyticsChannelDto)
  channels!: AnalyticsChannelDto[];

  @Expose()
  @ApiProperty({ type: [AnalyticsCityDto] })
  @Type(() => AnalyticsCityDto)
  cities!: AnalyticsCityDto[];

  @Expose()
  @ApiProperty({ type: [AnalyticsPageDto] })
  @Type(() => AnalyticsPageDto)
  topPages!: AnalyticsPageDto[];

  @Expose()
  @ApiProperty({
    description:
      'When Google was actually asked. Responses are cached server-side, so this can be up to GA_CACHE_TTL_SECONDS older than the request.',
    example: '2026-09-10T03:14:22.108Z',
  })
  generatedAt!: string;
}
