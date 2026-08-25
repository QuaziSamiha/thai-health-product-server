import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewResponseDto } from './dto/dashboard-overview-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin-overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin dashboard overview',
    description:
      'Every headline the admin dashboard renders, in one call: the taxonomy, the catalog (including the simple/variable split, the variant tallies and the stock breakdown), bundles, accounts by role and status, orders and revenue, promo codes, blog posts and support pages.\n\nEvery figure is a **live** count read at request time — nothing here is cached, and `generatedAt` records the moment the request was served. The eight sections are gathered in parallel from their owning modules, so the response is as slow as the slowest section rather than the sum of all eight.\n\nAdmin or Manager only.',
  })
  @ApiOkResponse({
    description: 'Dashboard overview retrieved successfully.',
    type: DashboardOverviewResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('Dashboard overview retrieved successfully')
  async getAdminOverview() {
    return this.dashboardService.getAdminOverview();
  }
}
