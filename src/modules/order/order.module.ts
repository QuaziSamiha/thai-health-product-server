import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';
import { AddressModule } from '../address/address.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PromotionModule } from '../promotion/promotion.module';
import { ComboProductModule } from '../combo-product/combo-product.module';

@Module({
  imports: [
    PrismaModule,
    PaginationModule,
    AddressModule,
    InventoryModule,
    PromotionModule,
    //* FOR ComboProductRepository.adjustSoldQuantity — PLACEMENT CLAIMS A
    //* BUNDLE AGAINST A CAPPED OFFER AND CANCELLATION GIVES IT BACK.
    ComboProductModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
