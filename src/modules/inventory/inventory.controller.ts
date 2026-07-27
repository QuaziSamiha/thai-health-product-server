import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
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
  ApiOkResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InventoryService } from './inventory.service';
import { AddStockDto } from './dto/add-stock.dto';
import { RemoveStockDto } from './dto/remove-stock.dto';
import { GetBatchesQueryDto } from './dto/get-batches-query.dto';
import { BatchResponseDto } from './dto/batch-response.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { ApiPaginatedResponse, PaginationQueryDto } from '../../shared/pagination';
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
    summary: 'Add stock as one or more batches (Admin Only).',
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

  @Post('remove-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Remove stock from one specific batch (Admin Only).',
    description:
      "Draws down one batch's `remaining` count and the owning product's/variant's own stock, and appends an immutable Inventory log entry. The counterpart to add-stock. Admin only.",
  })
  @ApiBody({ type: RemoveStockDto })
  @ApiCreatedResponse({
    description: 'Stock removed successfully — the updated batch.',
    type: BatchResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input, a product/variant/batch mismatch, or the requested quantity exceeds the batch\'s remaining count.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'The referenced batch does not exist.' })
  @ResponseMessage('Stock removed successfully')
  async removeStock(
    @Body() dto: RemoveStockDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.inventoryService.removeStock(req.user.id, dto);
  }

  //* MUST BE DECLARED BEFORE THE BARE `:id` GET ROUTE BELOW — NEST MATCHES GET
  //* ROUTES IN DECLARATION ORDER, SO A SINGLE-SEGMENT `:id` DECLARED FIRST
  //* WOULD SWALLOW "all-inventory" AS AN id VALUE INSTEAD OF REACHING THIS.
  @Get('all-inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get every inventory movement (paginated, Admin Only).',
    description:
      'Paginated ledger of every stock movement across all products/variants, newest first by default. Admin only.',
  })
  @ApiPaginatedResponse(
    InventoryResponseDto,
    'Inventory movements retrieved successfully.',
  )
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Inventory movements retrieved successfully')
  async getAllMovements(@Query() query: PaginationQueryDto) {
    return this.inventoryService.getAllMovements(query);
  }

  @Get('product/:productId/batches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get one product's batches (Admin Only).",
    description:
      'Every batch for the given product, oldest first, optionally narrowed to one variant via `?variantId=`. Feeds the remove-stock batch picker. Admin only.',
  })
  @ApiOkResponse({
    description: 'Batches retrieved successfully.',
    type: [BatchResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Batches retrieved successfully')
  async getBatchesForProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: GetBatchesQueryDto,
  ) {
    return this.inventoryService.getBatchesForProduct(
      productId,
      query.variantId,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get one inventory movement, with its batches (Admin Only).',
    description:
      "Single movement detail, plus every batch for that movement's own product/variant (the list endpoint omits batches to avoid an N+1). Admin only.",
  })
  @ApiOkResponse({
    description: 'Inventory movement retrieved successfully.',
    type: InventoryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Inventory movement not found.' })
  @ResponseMessage('Inventory movement retrieved successfully')
  async getMovementById(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.getMovementById(id);
  }
}
