import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { CategoryRepository } from './category.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { PaginationModule } from '../../shared/pagination';

@Module({
  imports: [PrismaModule, StorageModule, PaginationModule],
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepository],
  exports: [CategoryService],
})
export class CategoryModule {}
