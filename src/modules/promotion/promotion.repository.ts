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
    isPublic: true,
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

  /**
   * The storefront's browsable coupon list. Every condition the customer would
   * otherwise hit as a rejection at "Apply" is applied here instead, so a
   * listed code is one that actually works right now:
   *
   *   published + active + inside the validity window + not exhausted
   *
   * Exhaustion is a column-to-column comparison (`usedCount < usageLimit`),
   * expressed with a Prisma field reference so it stays in SQL rather than
   * being filtered in memory after the fact. A NULL usageLimit means unlimited
   * and would make that comparison NULL — hence the explicit OR branch, which
   * is the same "null = unlimited" convention assertUsable applies.
   *
   * Deliberately unpaginated: this is a short curated list, not a catalogue.
   * If it ever grows past a screenful, that is a merchandising problem to
   * solve with a cap, not a pager.
   */
  async findPublished(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const now = new Date();
    return await client.promoCode.findMany({
      where: {
        isPublic: true,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          {
            OR: [
              { usageLimit: null },
              { usedCount: { lt: this.prisma.promoCode.fields.usageLimit } },
            ],
          },
        ],
      },
      select: this.PROMO_CODE_SELECT,
      //* SOONEST-TO-EXPIRE FIRST SO A DEADLINE IS THE FIRST THING SEEN; NULLS
      //* (OPEN-ENDED OFFERS) SORT LAST, WHICH IS WHERE THEY BELONG.
      orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
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
