import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
} from './dto/update-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { Public } from '../../common/decorators/auth/public.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import {
  ApiPaginatedResponse,
  PaginationQueryDto,
} from '../../shared/pagination';

type AuthedRequest = Request & { user?: { id: number; role: UserRole } };

@ApiTags('Order')
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private requireUser(req: AuthedRequest): { id: number; role: UserRole } {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return req.user;
  }

  @Post('place-order')
  @Public()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Place an order (guest or logged-in)',
    description:
      'Works with or without a Bearer token. Logged-in customers may reference a saved addressId or supply newAddress (also saved to their address book); guests must supply newAddress inline. Only Cash on Delivery is available right now.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiCreatedResponse({
    description: 'Order placed successfully.',
    type: OrderResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input, an unavailable item, or insufficient stock.',
  })
  @ApiForbiddenResponse({
    description: 'A staff account attempted to place a customer order.',
  })
  @ResponseMessage('Order placed successfully')
  async placeOrder(@Body() dto: CreateOrderDto, @Req() req: AuthedRequest) {
    //* CHECKOUT IS A CUSTOMER (OR GUEST) SURFACE — A LOGGED-IN STAFF ACCOUNT
    //* HITTING THIS ENDPOINT IS REJECTED RATHER THAN SILENTLY PLACING A
    //* "CUSTOMER" ORDER UNDER AN ADMIN/EMPLOYEE IDENTITY.
    if (req.user && req.user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Only customer accounts can place orders through checkout',
      );
    }
    return this.orderService.placeOrder(dto, req.user?.id);
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my orders' })
  @ApiPaginatedResponse(OrderResponseDto, 'Orders retrieved successfully.')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ResponseMessage('Orders retrieved successfully')
  async myOrders(
    @Query() query: PaginationQueryDto,
    @Req() req: AuthedRequest,
  ) {
    const user = this.requireUser(req);
    return this.orderService.listMyOrders(user.id, query);
  }

  @Get('all-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all orders (Admin only)' })
  @ApiPaginatedResponse(OrderResponseDto, 'Orders retrieved successfully.')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Orders retrieved successfully')
  async allOrders(@Query() query: PaginationQueryDto) {
    return this.orderService.listAllOrdersAdmin(query);
  }

  //* my-orders/all-order ABOVE ARE SAFE IN ANY ORDER RELATIVE TO THE BARE
  //* :id ROUTE BELOW — BOTH ARE NOW EXPLICIT MULTI-CHAR SEGMENTS, NOT A
  //* BARE GET() THAT COULD COLLIDE. :id/history HAS AN EXTRA SEGMENT SO IT
  //* NEVER COLLIDES WITH :id EITHER; IT'S DECLARED FIRST HERE PURELY FOR
  //* READABILITY (MOST-SPECIFIC ROUTE FIRST), NOT CORRECTNESS.
  @Get(':id/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get one order with its full status history (Admin only)',
  })
  @ApiOkResponse({
    description: 'Order retrieved successfully.',
    type: OrderResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ResponseMessage('Order retrieved successfully')
  async orderDetailAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderDetailAdmin(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one order by id (owner or Admin)' })
  @ApiOkResponse({
    description: 'Order retrieved successfully.',
    type: OrderResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({
    description: 'The order belongs to another customer.',
  })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ResponseMessage('Order retrieved successfully')
  async orderById(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    const user = this.requireUser(req);
    return this.orderService.getOrderById(
      id,
      user.id,
      user.role === UserRole.ADMIN,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status (Admin only)' })
  @ApiBody({ type: UpdateOrderStatusDto })
  @ApiOkResponse({
    description: 'Order status updated successfully.',
    type: OrderResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Illegal status transition.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ResponseMessage('Order status updated successfully')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: AuthedRequest,
  ) {
    const user = this.requireUser(req);
    return this.orderService.updateStatus(id, dto, user.id);
  }

  @Patch(':id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order payment status (Admin only)' })
  @ApiBody({ type: UpdatePaymentStatusDto })
  @ApiOkResponse({
    description: 'Payment status updated successfully.',
    type: OrderResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ResponseMessage('Payment status updated successfully')
  async updatePaymentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
    @Req() req: AuthedRequest,
  ) {
    const user = this.requireUser(req);
    return this.orderService.updatePaymentStatus(id, dto, user.id);
  }
}
