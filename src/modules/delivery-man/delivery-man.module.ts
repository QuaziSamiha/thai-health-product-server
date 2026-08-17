import { Module } from '@nestjs/common';
import { DeliveryManController } from './delivery-man.controller';
import { DeliveryManService } from './delivery-man.service';
import { DeliveryManRepository } from './repositories/delivery-man.repository';
import { UserModule } from '../user/user.module';
import { PaginationModule } from '../../shared/pagination';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [UserModule, PaginationModule, StorageModule],
  controllers: [DeliveryManController],
  providers: [DeliveryManService, DeliveryManRepository],
})
export class DeliveryManModule {}
