import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { HomeRepository } from './home.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [PrismaModule, PaginationModule, StorageModule],
  controllers: [HomeController],
  providers: [HomeService, HomeRepository],
  exports: [HomeService],
})
export class HomeModule {}
