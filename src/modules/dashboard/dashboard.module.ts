import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CategoryModule } from '../category/category.module';
import { ProductModule } from '../product/product.module';
import { ComboProductModule } from '../combo-product/combo-product.module';
import { UserModule } from '../user/user.module';
import { OrderModule } from '../order/order.module';
import { PromotionModule } from '../promotion/promotion.module';
import { BlogModule } from '../blog/blog.module';
import { SupportModule } from '../support/support.module';

//* NO PrismaModule IMPORT AND NO REPOSITORY PROVIDER — BY DESIGN. THE
//* DASHBOARD OWNS NO TABLE: IT READS EVERY NUMBER THROUGH THE SERVICE OF THE
//* MODULE THAT OWNS IT, SO THE ONLY THING IT NEEDS INJECTED IS OTHER
//* MODULES. SEE THE CLASS DOC ON DashboardService FOR WHY.
@Module({
  imports: [
    CategoryModule,
    ProductModule,
    ComboProductModule,
    UserModule,
    OrderModule,
    PromotionModule,
    BlogModule,
    SupportModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
