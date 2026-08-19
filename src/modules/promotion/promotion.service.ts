import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionRepository } from './promotion.repository';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { PromoCodeQueryDto } from './dto/promo-code-query.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';
import { PromoCodeResponseDto } from './dto/promo-code-response.dto';
import { PromoCodeValidationResponseDto } from './dto/promo-code-validation-response.dto';
import { PublicPromoCodeResponseDto } from './dto/public-promo-code-response.dto';
import { IPaginatedResult } from '../../shared/pagination';
import { DiscountType, Prisma } from '../../generated/prisma/client';

//* THE SHAPE PromotionRepository's PROMO_CODE_SELECT RETURNS — EVERY READ IN
//* THIS SERVICE OPERATES ON THIS, NEVER THE RAW PRISMA MODEL DIRECTLY.
type PromoCodeRecord = {
  id: number;
  sid: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: Prisma.Decimal | number;
  minOrderAmount: Prisma.Decimal | number | null;
  maxDiscountAmount: Prisma.Decimal | number | null;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  isActive: boolean;
  isPublic: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PromotionService {
  constructor(private readonly repository: PromotionRepository) {}

  // ─── Admin — CRUD ──────────────────────────────────────────────────────────

  async createPromoCode(
    dto: CreatePromoCodeDto,
  ): Promise<PromoCodeResponseDto> {
    if (
      dto.discountType === DiscountType.PERCENTAGE &&
      dto.discountValue > 100
    ) {
      throw new BadRequestException('A percentage discount cannot exceed 100');
    }

    if (dto.endsAt && new Date(dto.endsAt) < new Date()) {
      throw new BadRequestException('End date cannot be in the past');
    }

    const existing = await this.repository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException('A promo code with this code already exists');
    }

    const created = await this.repository.create({
      code: dto.code,
      description: dto.description,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      usageLimit: dto.usageLimit,
      usageLimitPerUser: dto.usageLimitPerUser,
      isActive: dto.isActive,
      isPublic: dto.isPublic,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    });

    return new PromoCodeResponseDto(created);
  }

  async listPromoCodes(
    params: PromoCodeQueryDto,
  ): Promise<IPaginatedResult<PromoCodeResponseDto>> {
    const { discountType, isActive, ...paginationParams } = params;
    const result = await this.repository.findAllAdmin(paginationParams, {
      discountType,
      isActive,
    });

    return {
      ...result,
      data: result.data.map((promoCode) => new PromoCodeResponseDto(promoCode)),
    };
  }

  async getPromoCodeById(id: number): Promise<PromoCodeResponseDto> {
    const promoCode = await this.repository.findById(id);
    if (!promoCode) {
      throw new NotFoundException(`Promo code with ID ${id} not found`);
    }
    return new PromoCodeResponseDto(promoCode);
  }

  async updatePromoCode(
    id: number,
    dto: UpdatePromoCodeDto,
  ): Promise<PromoCodeResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promo code with ID ${id} not found`);
    }

    //* AN INACTIVE CODE IS TREATED AS RETIRED — THE ONLY EDIT ALLOWED ON ONE
    //* IS REACTIVATING IT. WITHOUT THIS, AN ADMIN COULD SILENTLY RESHAPE A
    //* CODE (NEW LIMIT, NEW DATES) NO ONE INTENDED TO KEEP USING.
    if (!existing.isActive && dto.isActive !== true) {
      throw new BadRequestException(
        'This promo code is inactive — set isActive to true to reactivate it before making other changes',
      );
    }

    if (dto.usageLimit !== undefined && dto.usageLimit < existing.usedCount) {
      throw new BadRequestException(
        `Usage limit cannot be set below the current used count (${existing.usedCount})`,
      );
    }

    if (
      existing.discountType === DiscountType.FIXED &&
      dto.maxDiscountAmount !== undefined
    ) {
      throw new BadRequestException(
        'Maximum discount amount is not applicable to a FIXED discount code',
      );
    }

    if (dto.endsAt) {
      const newEndsAt = new Date(dto.endsAt);
      if (newEndsAt < new Date()) {
        throw new BadRequestException('End date cannot be in the past');
      }
      const effectiveStartsAt = dto.startsAt
        ? new Date(dto.startsAt)
        : existing.startsAt;
      if (effectiveStartsAt && newEndsAt < effectiveStartsAt) {
        throw new BadRequestException(
          'End date cannot be earlier than start date',
        );
      }
    } else if (dto.startsAt) {
      const newStartsAt = new Date(dto.startsAt);
      if (existing.endsAt && existing.endsAt < newStartsAt) {
        throw new BadRequestException(
          'Start date cannot be later than the existing end date',
        );
      }
    }

    const updated = await this.repository.update(id, {
      description: dto.description,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      usageLimit: dto.usageLimit,
      usageLimitPerUser: dto.usageLimitPerUser,
      isActive: dto.isActive,
      isPublic: dto.isPublic,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    });

    return new PromoCodeResponseDto(updated);
  }

  // ─── Storefront — published coupon list ────────────────────────────────────

  /**
   * The codes an admin has deliberately published (isPublic), narrowed to the
   * ones that would actually apply if typed right now. Public and unauthed —
   * publishing is the whole point, so there is nothing here to protect beyond
   * the back-office fields PublicPromoCodeResponseDto already drops.
   *
   * This is NOT "every active code": isPublic defaults to false precisely so
   * that a targeted code (email campaign, win-back, influencer) never leaks
   * into a browsable list. See promo_codes.is_public in promotion.prisma.
   */
  async listPublicPromoCodes(): Promise<PublicPromoCodeResponseDto[]> {
    const promoCodes = await this.repository.findPublished();
    return promoCodes.map(
      (promoCode) => new PublicPromoCodeResponseDto(promoCode),
    );
  }

  // ─── Storefront — validate/preview (no side effects) ───────────────────────

  /** "Apply coupon" preview at cart/checkout time — validates and computes the discount without reserving usage. */
  async previewDiscount(
    dto: ValidatePromoCodeDto,
    userId: number | undefined,
  ): Promise<PromoCodeValidationResponseDto> {
    const promoCode = await this.repository.findByCode(dto.code);
    if (!promoCode) {
      throw new BadRequestException('Invalid promo code');
    }

    this.assertUsable(promoCode, dto.subtotal);
    await this.assertNotOverPerUserLimit(promoCode, userId, dto.email);

    const discountAmount = this.computeDiscount(promoCode, dto.subtotal);

    return new PromoCodeValidationResponseDto({
      code: promoCode.code,
      discountType: promoCode.discountType,
      discountValue: Number(promoCode.discountValue),
      discountAmount,
    });
  }

  // ─── Order placement — validate + reserve + redeem (transactional) ────────

  /**
   * Called from inside OrderService.placeOrder's own transaction, right after
   * subtotal is known and before the order shell is created. Re-validates
   * everything previewDiscount already checked (a preview and the actual
   * placement can be minutes apart) and, on success, atomically reserves one
   * use via a guarded UPDATE — the same "claim it now, roll back on failure"
   * pattern InventoryRepository uses for stock, so a lost race throws instead
   * of oversubscribing the code, and any later failure in the same order
   * transaction unwinds this reservation automatically.
   */
  async validateAndReserveForOrder(
    code: string,
    subtotal: number,
    userId: number | undefined,
    email: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<{ promoCodeId: number; discountAmount: number }> {
    const promoCode = await this.repository.findByCode(code, tx);
    if (!promoCode) {
      throw new BadRequestException('Invalid promo code');
    }

    this.assertUsable(promoCode, subtotal);
    await this.assertNotOverPerUserLimit(promoCode, userId, email, tx);

    const discountAmount = this.computeDiscount(promoCode, subtotal);

    const reserved = await this.repository.incrementUsageGuarded(
      promoCode.id,
      promoCode.usageLimit,
      tx,
    );
    if (reserved.count === 0) {
      throw new BadRequestException(
        'This promo code just reached its usage limit — please try again without it',
      );
    }

    return { promoCodeId: promoCode.id, discountAmount };
  }

  /** Writes the redemption ledger row once the order's own id is known. Must run in the same transaction as validateAndReserveForOrder. */
  async recordRedemption(
    promoCodeId: number,
    userId: number | undefined,
    orderId: number,
    discountApplied: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.createRedemption(
      { promoCodeId, userId: userId ?? null, orderId, discountApplied },
      tx,
    );
  }

  // ─── Shared business rules ──────────────────────────────────────────────────

  private assertUsable(promoCode: PromoCodeRecord, subtotal: number): void {
    if (!promoCode.isActive) {
      throw new BadRequestException('This promo code is not active');
    }

    const now = new Date();
    if (promoCode.startsAt && promoCode.startsAt > now) {
      throw new BadRequestException('This promo code is not valid yet');
    }
    if (promoCode.endsAt && promoCode.endsAt < now) {
      throw new BadRequestException('This promo code has expired');
    }

    if (
      promoCode.minOrderAmount != null &&
      subtotal < Number(promoCode.minOrderAmount)
    ) {
      throw new BadRequestException(
        `This promo code requires a minimum order of ${Number(promoCode.minOrderAmount)}`,
      );
    }

    if (
      promoCode.usageLimit != null &&
      promoCode.usedCount >= promoCode.usageLimit
    ) {
      throw new BadRequestException(
        'This promo code has reached its usage limit',
      );
    }
  }

  private async assertNotOverPerUserLimit(
    promoCode: PromoCodeRecord,
    userId: number | undefined,
    email: string | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (promoCode.usageLimitPerUser == null) return;

    const used = await this.repository.countRedemptionsForCustomer(
      promoCode.id,
      userId,
      email,
      tx,
    );
    if (used >= promoCode.usageLimitPerUser) {
      throw new BadRequestException(
        'You have already used this promo code the maximum number of times',
      );
    }
  }

  /** FIXED is capped at the subtotal (a discount can never exceed the cart); PERCENTAGE is capped at maxDiscountAmount, then also at the subtotal. */
  private computeDiscount(
    promoCode: PromoCodeRecord,
    subtotal: number,
  ): number {
    const discountValue = Number(promoCode.discountValue);

    if (promoCode.discountType === DiscountType.FIXED) {
      return round2(Math.min(discountValue, subtotal));
    }

    const rawDiscount = (subtotal * discountValue) / 100;
    const cappedDiscount =
      promoCode.maxDiscountAmount != null
        ? Math.min(rawDiscount, Number(promoCode.maxDiscountAmount))
        : rawDiscount;
    return round2(Math.min(cappedDiscount, subtotal));
  }
}
