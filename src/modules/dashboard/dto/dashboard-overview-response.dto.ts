import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CategoryStatsDto } from '../../category/dto/category-stats.dto';
import { ProductStatsDto } from '../../product/dto/product-stats.dto';
import { ComboProductStatsDto } from '../../combo-product/dto/combo-product-stats.dto';
import { UserStatsDto } from '../../user/dto/user-stats.dto';
import { OrderStatsDto } from '../../order/dto/order-stats.dto';
import { PromoCodeStatsDto } from '../../promotion/dto/promo-code-stats.dto';
import { BlogStatsDto } from '../../blog/dto/blog-stats.dto';
import { SupportStatsDto } from '../../support/dto/support-stats.dto';

/**
 * The handful of numbers the dashboard puts at the very top, lifted out of
 * the per-module sections below so the client renders its hero row without
 * reaching into eight different objects (and without re-deriving anything —
 * every value here is a copy of a field that also appears in its owning
 * section).
 */
export class DashboardHighlightsDto {
  @Expose()
  @ApiProperty({ description: 'Live categories', example: 31 })
  activeCategories!: number;

  @Expose()
  @ApiProperty({ description: 'Live products', example: 271 })
  activeProducts!: number;

  @Expose()
  @ApiProperty({
    description: 'Variants across every non-deleted product',
    example: 214,
  })
  totalVariants!: number;

  @Expose()
  @ApiProperty({ description: 'Combos the storefront is serving', example: 11 })
  activeCombos!: number;

  @Expose()
  @ApiProperty({
    description: 'Products at or below their low-stock threshold',
    example: 47,
  })
  lowStockProducts!: number;

  @Expose()
  @ApiProperty({ description: 'Products with nothing on hand', example: 29 })
  outOfStockProducts!: number;

  @Expose()
  @ApiProperty({ description: 'ADMIN + SUPER_ADMIN accounts', example: 5 })
  admins!: number;

  @Expose()
  @ApiProperty({ description: 'CUSTOMER + GUEST accounts', example: 1_814 })
  customers!: number;

  @Expose()
  @ApiProperty({ description: 'Orders ever placed', example: 4_218 })
  totalOrders!: number;

  @Expose()
  @ApiProperty({
    description: 'Orders the warehouse still owes work on',
    example: 48,
  })
  openOrders!: number;

  @Expose()
  @ApiProperty({
    description: 'Lifetime revenue, excluding cancelled and failed orders',
    example: 1_284_500.75,
  })
  lifetimeRevenue!: number;

  constructor(init: {
    category: CategoryStatsDto;
    product: ProductStatsDto;
    combo: ComboProductStatsDto;
    user: UserStatsDto;
    order: OrderStatsDto;
  }) {
    this.activeCategories = init.category.active;
    this.activeProducts = init.product.active;
    this.totalVariants = init.product.variants.total;
    this.activeCombos = init.combo.sellingNow;
    this.lowStockProducts = init.product.lowStock;
    this.outOfStockProducts = init.product.outOfStock;
    this.admins = init.user.admins;
    this.customers = init.user.customers;
    this.totalOrders = init.order.total;
    this.openOrders = init.order.open;
    this.lifetimeRevenue = init.order.revenue.lifetime;
  }
}

/**
 * Everything the admin dashboard renders, in one call.
 *
 * One section per source module, each shaped by the module that owns it —
 * `DashboardService` composes these, it never builds one. The section DTOs
 * live in their own modules for the same reason
 * `FeaturedHomeContentsResponseDto` imports `CategoryHomeResponseDto` rather
 * than redefining it: the shape belongs next to the rules that produce it.
 */
export class DashboardOverviewResponseDto {
  @Expose()
  @ApiProperty({
    type: DashboardHighlightsDto,
    description: 'Hero-row figures, copied from the sections below',
  })
  @Type(() => DashboardHighlightsDto)
  highlights!: DashboardHighlightsDto;

  @Expose()
  @ApiProperty({ type: CategoryStatsDto, description: 'Taxonomy' })
  @Type(() => CategoryStatsDto)
  categories!: CategoryStatsDto;

  @Expose()
  @ApiProperty({ type: ProductStatsDto, description: 'Catalog and stock' })
  @Type(() => ProductStatsDto)
  products!: ProductStatsDto;

  @Expose()
  @ApiProperty({ type: ComboProductStatsDto, description: 'Bundles' })
  @Type(() => ComboProductStatsDto)
  combos!: ComboProductStatsDto;

  @Expose()
  @ApiProperty({ type: UserStatsDto, description: 'Accounts' })
  @Type(() => UserStatsDto)
  users!: UserStatsDto;

  @Expose()
  @ApiProperty({ type: OrderStatsDto, description: 'Orders and revenue' })
  @Type(() => OrderStatsDto)
  orders!: OrderStatsDto;

  @Expose()
  @ApiProperty({ type: PromoCodeStatsDto, description: 'Promo codes' })
  @Type(() => PromoCodeStatsDto)
  promoCodes!: PromoCodeStatsDto;

  @Expose()
  @ApiProperty({ type: BlogStatsDto, description: 'Blog' })
  @Type(() => BlogStatsDto)
  blogs!: BlogStatsDto;

  @Expose()
  @ApiProperty({ type: SupportStatsDto, description: 'Support/policy pages' })
  @Type(() => SupportStatsDto)
  supportPages!: SupportStatsDto;

  @Expose()
  @ApiProperty({
    description:
      'When these figures were computed. Every number in this payload is read live at request time — nothing here is cached — so this is simply the moment the request was served.',
    example: '2026-08-25T09:14:22.108Z',
  })
  generatedAt!: string;

  constructor(init: {
    categories: CategoryStatsDto;
    products: ProductStatsDto;
    combos: ComboProductStatsDto;
    users: UserStatsDto;
    orders: OrderStatsDto;
    promoCodes: PromoCodeStatsDto;
    blogs: BlogStatsDto;
    supportPages: SupportStatsDto;
  }) {
    this.categories = init.categories;
    this.products = init.products;
    this.combos = init.combos;
    this.users = init.users;
    this.orders = init.orders;
    this.promoCodes = init.promoCodes;
    this.blogs = init.blogs;
    this.supportPages = init.supportPages;
    this.highlights = new DashboardHighlightsDto({
      category: init.categories,
      product: init.products,
      combo: init.combos,
      user: init.users,
      order: init.orders,
    });
    this.generatedAt = new Date().toISOString();
  }
}
