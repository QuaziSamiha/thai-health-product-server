import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsOverviewResponseDto } from './dto/analytics-overview-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Google Analytics overview',
    description:
      'Storefront traffic from the GA4 property: headline metrics compared with the previous period, a zero-filled daily trend, sessions by channel, top cities and top pages.\n\nThe window ends **yesterday** in the property time zone. Responses are cached server-side for `GA_CACHE_TTL_SECONDS` (default 1 hour) — `generatedAt` says when Google was actually asked.\n\nAdmin, Super Admin or Manager only.',
  })
  @ApiOkResponse({
    description: 'Analytics overview retrieved successfully.',
    type: AnalyticsOverviewResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({
    description: 'Admin, Super Admin or Manager role required.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'GA credentials are not set on the server (errorCode ANALYTICS_NOT_CONFIGURED).',
  })
  @ApiBadGatewayResponse({
    description:
      'Google rejected or failed the report request (errorCode ANALYTICS_UPSTREAM_ERROR). The message names the setting to fix.',
  })
  @ResponseMessage('Analytics overview retrieved successfully')
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(query.range);
  }
}
