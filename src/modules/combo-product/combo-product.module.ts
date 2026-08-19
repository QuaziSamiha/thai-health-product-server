import { Module } from '@nestjs/common';
import { ComboProductController } from './combo-product.controller';
import { ComboProductService } from './combo-product.service';
import { ComboExpiryService } from './combo-expiry.service';
import { ComboProductRepository } from './combo-product.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { PaginationModule } from '../../shared/pagination';

@Module({
  imports: [PrismaModule, StorageModule, PaginationModule],
  controllers: [ComboProductController],
  //* ComboExpiryService IS A PROVIDER WITH NO CONSUMER ON PURPOSE — IT EXISTS
  //* TO BE INSTANTIATED SO @nestjs/schedule CAN DISCOVER ITS @Cron HANDLER.
  //* NOT EXPORTED: NOTHING SHOULD BE CALLING THE SWEEP DIRECTLY.
  providers: [ComboProductService, ComboExpiryService, ComboProductRepository],
  exports: [ComboProductService, ComboProductRepository],
})
export class ComboProductModule {}
