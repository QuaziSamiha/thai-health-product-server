import { Injectable, Logger } from '@nestjs/common';
import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';
import { ComboProductService } from '../combo-product/combo-product.service';
import { UserService } from '../user/user.service';
import { OrderService } from '../order/order.service';
import { PromotionService } from '../promotion/promotion.service';
import { BlogService } from '../blog/blog.service';
import { SupportService } from '../support/support.service';
import { DashboardOverviewResponseDto } from './dto/dashboard-overview-response.dto';

/**
 * The admin dashboard's composition layer.
 *
 * **This module owns no table and therefore has no repository.** That is
 * deliberate, not an omission: every figure the dashboard shows already
 * belongs to some other domain, and the rule that turns rows into that
 * figure — which products count as "in the catalog", which orders count as
 * revenue, who counts as an admin — belongs with the domain that defines it.
 * So each source module grew a `get<Thing>Stats()` on its own service,
 * backed by an aggregate in its own repository, and this service does
 * nothing but call them and staple the results together. A second set of
 * `prisma.product.count()` calls here would be a second definition of every
 * one of those rules, free to drift from the first.
 *
 * Same pattern as `HomeService.getFeaturedHomeContents`, which composes the
 * storefront homepage out of Category/Product/ComboProduct services rather
 * than querying their tables.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
    private readonly comboProductService: ComboProductService,
    private readonly userService: UserService,
    private readonly orderService: OrderService,
    private readonly promotionService: PromotionService,
    private readonly blogService: BlogService,
    private readonly supportService: SupportService,
  ) {}

  /**
   * Every headline the admin dashboard renders, in one call.
   *
   * The eight sections are fetched in parallel because none depends on
   * another — the page is as slow as its slowest section, not as slow as
   * their sum. Nothing is cached: these are live counts, and an admin who
   * has just published a product expects to see it in the tally on the next
   * refresh.
   */
  async getAdminOverview(): Promise<DashboardOverviewResponseDto> {
    const [
      categories,
      products,
      combos,
      users,
      orders,
      promoCodes,
      blogs,
      supportPages,
    ] = await Promise.all([
      this.categoryService.getCategoryStats(),
      this.productService.getProductStats(),
      this.comboProductService.getComboStats(),
      this.userService.getUserStats(),
      this.orderService.getOrderStats(),
      this.promotionService.getPromoCodeStats(),
      this.blogService.getBlogStats(),
      this.supportService.getSupportStats(),
    ]);

    return new DashboardOverviewResponseDto({
      categories,
      products,
      combos,
      users,
      orders,
      promoCodes,
      blogs,
      supportPages,
    });
  }
}
