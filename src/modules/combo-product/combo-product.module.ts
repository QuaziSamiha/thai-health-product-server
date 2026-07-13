import { Module } from '@nestjs/common';
import { ComboProductController } from './combo-product.controller';
import { ComboProductService } from './combo-product.service';
import { ComboProductRepository } from './combo-product.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';

@Module({
  imports: [PrismaModule, PaginationModule],
  controllers: [ComboProductController],
  providers: [ComboProductService, ComboProductRepository],
  exports: [ComboProductService],
})
export class ComboProductModule {}
