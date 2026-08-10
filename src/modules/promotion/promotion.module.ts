import { Module } from '@nestjs/common';
import { PromotionController } from './promotion.controller';
import { PromotionService } from './promotion.service';
import { PromotionRepository } from './promotion.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';

@Module({
  imports: [PrismaModule, PaginationModule],
  controllers: [PromotionController],
  providers: [PromotionService, PromotionRepository],
  exports: [PromotionService],
})
export class PromotionModule {}
