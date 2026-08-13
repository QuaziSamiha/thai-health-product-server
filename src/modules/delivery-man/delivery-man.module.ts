import { Module } from '@nestjs/common';
import { DeliveryManController } from './delivery-man.controller';
import { DeliveryManService } from './delivery-man.service';
import { DeliveryManRepository } from './repositories/delivery-man.repository';
import { UserModule } from '../user/user.module';
import { PaginationModule } from '../../shared/pagination';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  //* REUSES UserRepository/ProfileRepository/UserSecurityRepository FROM
  //* UserModule (NOW EXPORTED THERE) RATHER THAN RE-IMPLEMENTING USER/PROFILE
  //* CREATION — SEE docs/delivery-man.md "Reuse, Don't Duplicate".
  imports: [UserModule, PaginationModule, StorageModule],
  controllers: [DeliveryManController],
  providers: [DeliveryManService, DeliveryManRepository],
})
export class DeliveryManModule {}
