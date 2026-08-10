import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma, DiscountType } from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';

@Injectable()
export class PromotionRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  private readonly PROMO_CODE_SELECT = {
    id: true,
    sid: true,
    code: true,
    description: true,
    discountType: true,
    discountValue: true,
    minOrderAmount: true,
    maxDiscountAmount: true,
    usageLimit: true,
    usageLimitPerUser: true,
    usedCount: true,
    isActive: true,
    startsAt: true,
    endsAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  // ─── Reads — Single Lookups ────────────────────────────────────────────────

  async findById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.promoCode.findUnique({
      where: { id },
      select: this.PROMO_CODE_SELECT,
    });
  }

  //* code IS ALREADY UPPERCASE BY THE TIME IT GETS HERE (DTO-LEVEL @Transform
  //* ON EVERY WRITE/LOOKUP PATH) — A PLAIN EXACT MATCH ON THE @unique COLUMN,
  //* NO mode: 'insensitive' NEEDED.
  async findByCode(code: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.promoCode.findUnique({
      where: { code },
      select: this.PROMO_CODE_SELECT,
    });
  }

  // ─── Reads — Lists ─────────────────────────────────────────────────────────

  async findAllAdmin(
    params: PaginationQueryDto,
    filters: { discountType?: DiscountType; isActive?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const select = this.PROMO_CODE_SELECT;
    return await this.paginationService.paginate<
      Prisma.PromoCodeGetPayload<{ select: typeof select }>,
      typeof client.promoCode
    >(client.promoCode, params, {
      select,
      where: {
        ...(filters.discountType && { discountType: filters.discountType }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      searchableFields: ['code', 'description'],
      defaultSortField: 'createdAt',
    });
  }

  // ─── Mutations — PromoCode ─────────────────────────────────────────────────

  async create(
    data: Prisma.PromoCodeUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.promoCode.create({
      data,
      select: this.PROMO_CODE_SELECT,
    });
  }

  async update(
    id: number,
    data: Prisma.PromoCodeUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.promoCode.update({
      where: { id },
      data,
      select: this.PROMO_CODE_SELECT,
    });
  }

  /**
   * Guarded usage-counter bump — same `UPDATE ... WHERE <bound>` shape as
   * InventoryRepository.decrementProductQuantityGuarded. `usageLimit` is the
   * value already read by the caller in this same transaction; comparing
   * against it (rather than a live subquery) is safe because usageLimit
   * itself is admin-set and essentially never changes mid-checkout, while
   * usedCount is re-checked at the instant of this UPDATE, so a race that's
   * already claimed the last redemption updates zero rows instead of
   * overselling the code. `usageLimit === null` means unlimited — no guard.
   */
  async incrementUsageGuarded(
    id: number,
    usageLimit: number | null,
    tx: Prisma.TransactionClient,
  ) {
    return tx.promoCode.updateMany({
      where:
        usageLimit === null ? { id } : { id, usedCount: { lt: usageLimit } },
      data: { usedCount: { increment: 1 } },
    });
  }

  // ─── Reads/Mutations — Redemption ledger ───────────────────────────────────

  /**
   * Per-customer redemption count for usageLimitPerUser enforcement.
   * Logged-in customers are counted by userId; guests (userId is always null
   * on their own redemption rows) are counted by the checkout email on the
   * order they redeemed against — same "by email" contract documented on
   * PromoCodeRedemption in promotion.prisma. With neither identifier, there
   * is nothing to count against, so this returns 0 (permissive default).
   */
  async countRedemptionsForCustomer(
    promoCodeId: number,
    userId: number | undefined,
    email: string | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx || this.prisma;
    if (userId) {
      return await client.promoCodeRedemption.count({
        where: { promoCodeId, userId },
      });
    }
    if (email) {
      return await client.promoCodeRedemption.count({
        where: { promoCodeId, userId: null, order: { customerEmail: email } },
      });
    }
    return 0;
  }

  async createRedemption(
    data: {
      promoCodeId: number;
      userId: number | null;
      orderId: number;
      discountApplied: number;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.promoCodeRedemption.create({ data });
  }
}
