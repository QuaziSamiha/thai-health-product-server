import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaginationModule } from '../../shared/pagination';
import { StorageModule } from '../../shared/storage/storage.module';
import { NewsEventController } from './news-event.controller';
import { NewsEventService } from './news-event.service';
import { NewsEventRepository } from './news-event.repository';
import { NewsEventTypeController } from './news-event-type.controller';
import { NewsEventTypeService } from './news-event-type.service';
import { NewsEventTypeRepository } from './news-event-type.repository';

@Module({
  imports: [PrismaModule, PaginationModule, StorageModule],
  controllers: [NewsEventTypeController, NewsEventController],
  providers: [
    NewsEventTypeService,
    NewsEventTypeRepository,
    NewsEventService,
    NewsEventRepository,
  ],
  exports: [NewsEventService, NewsEventTypeService],
})
export class NewsEventModule {}
