import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE,
} from '../constants/analytics.constants';
import type { AnalyticsRange } from '../constants/analytics.constants';

const RANGE_KEYS = Object.keys(ANALYTICS_RANGES) as AnalyticsRange[];

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description:
      'Reporting window, ending yesterday in the property time zone. Compared against the equally long window immediately before it.',
    enum: RANGE_KEYS,
    default: DEFAULT_ANALYTICS_RANGE,
  })
  @IsOptional()
  @IsIn(RANGE_KEYS, {
    message: `Range must be one of: ${RANGE_KEYS.join(', ')}`,
  })
  range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE;
}
