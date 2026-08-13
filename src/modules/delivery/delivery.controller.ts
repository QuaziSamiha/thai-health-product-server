import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryServiceDto } from './dto/create-delivery-service.dto';
import { UpdateDeliveryServiceDto } from './dto/update-delivery-service.dto';
import { DeliveryServiceQueryDto } from './dto/delivery-service-query.dto';
import { DeliveryServiceRowDto } from './dto/delivery-service-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ApiPaginatedResponse } from '../../shared/pagination';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

//* "External Delivery Service" TAB ON THE Set Up ADMIN PAGE — THIRD-PARTY
//* COURIER DIRECTORY. SEE docs/delivery.md FOR THE FULL DESIGN, INCLUDING
//* THE SPECULATIVE Phase 2 ROUTES (quote/book-shipment/tracking/webhook)
//* THAT ARE *NOT* IMPLEMENTED HERE — THIS CONTROLLER IS DELIBERATELY SCOPED
//* TO THE BASIC PROVIDER/ZONE CRUD THE Set Up TABLE NEEDS TODAY.
@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post('create-external-delivery-service')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create (or extend) an external delivery service row',
    description:
      'One flat submission = one Set Up table row. If a provider with this company name already exists, a new zone is attached to it instead of creating a duplicate provider — this is how one courier ends up with multiple delivery-time rows.',
  })
  @ApiCreatedResponse({
    description: 'External delivery service row created.',
    type: DeliveryServiceRowDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({
    description: 'This company name results in a duplicate provider identifier.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('External delivery service created successfully')
  async createExternalDeliveryService(
    @Body() dto: CreateDeliveryServiceDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryService.createExternalDeliveryService(req.user.id, dto);
  }

  @Get('all-external-delivery-services')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List external delivery service rows (paginated)',
    description:
      'Backs the Set Up > External Delivery Service table. search matches company name and delivery area.',
  })
  @ApiPaginatedResponse(
    DeliveryServiceRowDto,
    'External delivery service rows retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ResponseMessage('External delivery service rows retrieved successfully')
  async getAllExternalDeliveryServices(@Query() query: DeliveryServiceQueryDto) {
    return this.deliveryService.getAllExternalDeliveryServices(query);
  }

  @Patch('update-external-delivery-service/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update an external delivery service row',
    description:
      "Partially updates a zone and, if company fields are present, its owning provider. Renaming into a name already used by a different provider is rejected — delete and re-add instead.",
  })
  @ApiOkResponse({
    description: 'External delivery service row updated.',
    type: DeliveryServiceRowDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiConflictResponse({
    description: 'The new company name collides with a different existing provider.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'External delivery service row not found.' })
  @ResponseMessage('External delivery service updated successfully')
  async updateExternalDeliveryService(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryServiceDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.deliveryService.updateExternalDeliveryService(id, req.user.id, dto);
  }

  @Delete('delete-external-delivery-service/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an external delivery service row',
    description:
      'Deletes only the zone. The owning provider survives (it may own other zones) and simply stops appearing in this table once it has none left.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin or Manager role required.' })
  @ApiNotFoundResponse({ description: 'External delivery service row not found.' })
  @ResponseMessage('External delivery service deleted successfully')
  async deleteExternalDeliveryService(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryService.deleteExternalDeliveryService(id);
  }
}
