import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { PartnerRepository } from './partner.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';

@Module({
  imports: [PrismaModule, PaginationModule],
  controllers: [PartnerController],
  providers: [PartnerService, PartnerRepository],
  exports: [PartnerService],
})
export class PartnerModule {}
