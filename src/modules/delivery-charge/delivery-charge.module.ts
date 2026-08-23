import { Module } from '@nestjs/common';
import { DeliveryChargeController } from './delivery-charge.controller';
import { DeliveryChargeService } from './delivery-charge.service';
import { DeliveryChargeRepository } from './delivery-charge.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';

//* DEPENDS ON NOTHING BUT PRISMA AND PAGINATION, ON PURPOSE. OrderModule
//* IMPORTS *THIS* — PLACEMENT ASKS FOR A FEE — AND NOT THE OTHER WAY ROUND, SO
//* THERE IS NO forwardRef ANYWHERE AND THE PRICING RULES CAN BE EXERCISED
//* WITHOUT STANDING UP THE ORDER DOMAIN.
//*
//* THE CHECKOUT QUOTE ROUTE LIVES ON OrderController FOR THE SAME REASON —
//* SEE THE NOTE ON DeliveryChargeController.
@Module({
  imports: [PrismaModule, PaginationModule],
  controllers: [DeliveryChargeController],
  providers: [DeliveryChargeService, DeliveryChargeRepository],
  exports: [DeliveryChargeService],
})
export class DeliveryChargeModule {}
