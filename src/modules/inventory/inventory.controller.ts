import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InventoryService } from './inventory.service';
import { AddStockDto } from './dto/add-stock.dto';
import { BatchResponseDto } from './dto/batch-response.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('add-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add stock as one or more batches',
    description:
      "Records one or more stock intakes in a single, atomic call. Each item creates a permanent Batch record (with a server-generated batch number), increments the target product's or variant's own stock count, and appends an immutable entry to the product's inventory log. Admin only.",
  })
  @ApiBody({ type: AddStockDto })
  @ApiCreatedResponse({
    description:
      'Stock added successfully — one batch per submitted item, in submission order.',
    type: [BatchResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Invalid input, or a product/variant mismatch.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({
    description: 'A referenced product or variant does not exist.',
  })
  @ResponseMessage('Stock added successfully')
  async addStock(
    @Body() dto: AddStockDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.inventoryService.addStock(req.user.id, dto);
  }
}
