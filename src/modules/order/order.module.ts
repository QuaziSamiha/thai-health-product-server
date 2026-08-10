import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';
import { AddressModule } from '../address/address.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PromotionModule } from '../promotion/promotion.module';

@Module({
  imports: [
    PrismaModule,
    PaginationModule,
    AddressModule,
    InventoryModule,
    PromotionModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
