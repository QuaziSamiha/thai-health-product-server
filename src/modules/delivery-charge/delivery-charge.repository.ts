import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import {
  DeliveryChargeStatus,
  FreeDeliveryTrigger,
  OrderStatus,
} from '../../generated/prisma/enums';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import {
  DELIVERY_CHARGE_ZONE_PRICING_SELECT,
  DELIVERY_CHARGE_ZONE_SELECT,
  FREE_DELIVERY_RULE_SELECT,
} from './delivery-charge.select';

@Injectable()
export class DeliveryChargeRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Zones (admin) ─────────────────────────────────────────────────

  async findZoneById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.findUnique({
      where: { id },
      select: DELIVERY_CHARGE_ZONE_SELECT,
    });
  }

  async findZoneByCode(code: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.findUnique({
      where: { code },
      select: { id: true, code: true },
    });
  }

  /** Same lookup, but with the areas and rates the zone editor needs. */
  async findZoneByCodeFull(code: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.findUnique({
      where: { code },
      select: DELIVERY_CHARGE_ZONE_SELECT,
    });
  }

  async findAllZones(params: PaginationQueryDto) {
    const select = DELIVERY_CHARGE_ZONE_SELECT;
    return await this.paginationService.paginate<
      Prisma.DeliveryChargeZoneGetPayload<{ select: typeof select }>,
      typeof this.prisma.deliveryChargeZone
    >(this.prisma.deliveryChargeZone, params, {
      select,
      searchableFields: ['code', 'name', 'nameTh'],
      defaultSortField: 'priority',
    });
  }

  // ─── Reads — Zones (pricing hot path) ──────────────────────────────────────

  /**
   * Every active zone that could possibly serve this destination, with its
   * area rules and active rate bands attached.
   *
   * The `OR` narrows on the two axes an area rule can be indexed by — province
   * and postal code — and deliberately keeps the wildcard rows (`province IS
   * NULL`) in the result, because those are exactly the country-wide rules
   * that must still be considered. What it filters out is the bulk: every rule
   * naming a *different* province. The remaining candidates are then scored in
   * memory by `scoreArea`, which is where the specificity ladder lives.
   *
   * Scoring in the application rather than in SQL is deliberate. The ladder is
   * the business rule most likely to need a new rung, and a CASE expression
   * spread across a WHERE and an ORDER BY is the worst place to change one.
   * The candidate set is bounded by the number of *rules*, not orders — a
   * Thailand-wide card is tens of rows.
   *
   * Postal prefixes are the exception: they cannot be narrowed with an
   * indexable predicate (`'10110' LIKE prefix || '%'` reverses the usual
   * direction), so all of them are fetched and matched in memory. There is one
   * per zone-tier at most.
   */
  async findCandidateZonesForDestination(
    destination: { province: string; postalCode: string; country: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.findMany({
      where: {
        status: DeliveryChargeStatus.ACTIVE,
        areas: {
          some: {
            country: { equals: destination.country, mode: 'insensitive' },
            OR: [
              { province: null },
              {
                province: { equals: destination.province, mode: 'insensitive' },
              },
              { postalCode: destination.postalCode },
              { postalPrefix: { not: null } },
            ],
          },
        },
      },
      select: {
        ...DELIVERY_CHARGE_ZONE_PRICING_SELECT,
        areas: {
          select: {
            country: true,
            province: true,
            district: true,
            subdistrict: true,
            postalCode: true,
            postalPrefix: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * The catch-all zone. Read separately from the candidate query rather than
   * OR-ed into it, because it is only consulted when that query produced no
   * match at all — folding it in would make every successful lookup pay for a
   * fallback it never uses, and would risk the fallback out-scoring a real
   * match through some future ladder change.
   */
  /**
   * Active zones holding a country-wide coverage rule — every named level and
   * both postal fields NULL — for one country.
   *
   * Such a rule matches every address in that country at the lowest rung of
   * the ladder (100), so two of them tie on every single order and the winner
   * falls to `priority`, then `id`. That is not a pricing decision anyone
   * made. Used to refuse the second one rather than let the pair sit there
   * quietly disagreeing.
   */
  async findActiveZonesCoveringWholeCountry(
    country: string,
    excludeZoneId?: number,
  ) {
    return await this.prisma.deliveryChargeZone.findMany({
      where: {
        status: DeliveryChargeStatus.ACTIVE,
        ...(excludeZoneId !== undefined ? { id: { not: excludeZoneId } } : {}),
        areas: {
          some: {
            country: { equals: country, mode: 'insensitive' },
            province: null,
            district: null,
            subdistrict: null,
            postalCode: null,
            postalPrefix: null,
          },
        },
      },
      select: { id: true, name: true },
    });
  }

  async findDefaultZone(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.findFirst({
      where: { status: DeliveryChargeStatus.ACTIVE, isDefault: true },
      select: DELIVERY_CHARGE_ZONE_PRICING_SELECT,
    });
  }

  /**
   * Whether the rate card has anything at all to say about a country.
   *
   * This is the gate on the catch-all zone, and it exists because the fallback
   * is otherwise too eager: a Thailand card would happily price a Malaysian
   * address off its upcountry bands and quote a 2–4 day domestic lead time for
   * a parcel that has to clear customs. `scoreArea` already refuses to match a
   * foreign address against any *rule*; without this, the fallback let it back
   * in through the side door.
   *
   * Derived from the data rather than from a configured home country, so a
   * merchant who adds Laos coverage gets Laos quotes with no code change. The
   * empty-table case (a card that is nothing but a catch-all, which is a
   * legitimate way to run a single flat rate) is treated as "serves
   * everywhere" — with no area rules there is no statement of coverage to
   * contradict, and refusing every address would be a worse default than
   * pricing them all the same.
   */
  async isCountryServed(
    country: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    const [match, any] = await Promise.all([
      client.deliveryChargeArea.findFirst({
        where: { country: { equals: country, mode: 'insensitive' } },
        select: { id: true },
      }),
      client.deliveryChargeArea.findFirst({ select: { id: true } }),
    ]);
    return match !== null || any === null;
  }

  // ─── Reads — Catalog weights ───────────────────────────────────────────────

  /**
   * Per-unit weight for a set of products/variants, in one round trip.
   *
   * A variant's own weight wins when it has one — a 30 ml bottle and a 100 ml
   * bottle of the same product do not weigh the same — and falls back to the
   * parent product's. Both are nullable in the catalog, so the caller applies
   * DEFAULT_ITEM_WEIGHT_KG for whatever is still missing.
   */
  async findProductWeights(
    productIds: number[],
    variantIds: number[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const [products, variants] = await Promise.all([
      productIds.length
        ? client.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, weight: true },
          })
        : Promise.resolve([]),
      variantIds.length
        ? client.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, weight: true, productId: true },
          })
        : Promise.resolve([]),
    ]);
    return { products, variants };
  }

  /**
   * Component lines of a set of combos, so a bundle's weight can be summed
   * from what is actually in the box. A combo holds no weight of its own —
   * same reason it holds no stock of its own (see combo-product.prisma).
   */
  async findComboComponents(comboIds: number[], tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    if (!comboIds.length) return [];
    return await client.comboItem.findMany({
      where: { comboId: { in: comboIds } },
      select: {
        comboId: true,
        quantity: true,
        product: { select: { weight: true } },
        variant: { select: { weight: true } },
      },
    });
  }

  // ─── Reads — Free-delivery rules ───────────────────────────────────────────

  /**
   * Every rule that is live right now and in scope for this zone, in
   * evaluation order.
   *
   * Window, activity, zone scope and exhaustion are all filtered in SQL so the
   * calculator never has to reason about a rule it cannot use. Exhaustion is a
   * column-to-column comparison expressed with a Prisma field reference —
   * the same technique PromotionRepository.findPublished uses, and for the same
   * reason: it stays in the database instead of being filtered in memory after
   * the fact. A NULL usageLimit means unlimited and would make that comparison
   * NULL, hence the explicit OR branch.
   */
  async findApplicableRules(zoneId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const now = new Date();
    return await client.deliveryFreeDeliveryRule.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          { OR: [{ zoneId: null }, { zoneId }] },
          {
            OR: [
              { usageLimit: null },
              {
                usedCount: {
                  lt: this.prisma.deliveryFreeDeliveryRule.fields.usageLimit,
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        trigger: true,
        minOrderAmount: true,
        promoCodeId: true,
        promoCode: { select: { code: true } },
        zoneId: true,
        maxSubsidyAmount: true,
        waivesCodFee: true,
        usageLimit: true,
      },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * The cheapest live site-wide basket threshold, for the storefront banner.
   * Zone-scoped rules are excluded on purpose — the homepage does not know
   * where the parcel is going, so advertising one would be a promise broken at
   * checkout.
   */
  async findLowestPublicThreshold(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    const now = new Date();
    return await client.deliveryFreeDeliveryRule.findFirst({
      where: {
        isActive: true,
        trigger: FreeDeliveryTrigger.MIN_ORDER_AMOUNT,
        zoneId: null,
        minOrderAmount: { not: null },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          {
            OR: [
              { usageLimit: null },
              {
                usedCount: {
                  lt: this.prisma.deliveryFreeDeliveryRule.fields.usageLimit,
                },
              },
            ],
          },
        ],
      },
      select: { name: true, minOrderAmount: true },
      orderBy: [{ minOrderAmount: 'asc' }],
    });
  }

  /**
   * Resolves a typed coupon to its row id, for PROMO_CODE rules.
   *
   * Returns null rather than throwing on a miss: the promotion module owns
   * telling a customer their code is invalid, and a delivery quote is the
   * wrong place to relay it. Codes are stored and looked up uppercase by
   * app-layer convention (see promotion.prisma), and every DTO on this path
   * uppercases on the way in.
   */
  async findPromoCodeIdByCode(
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    const client = tx || this.prisma;
    const promo = await client.promoCode.findUnique({
      where: { code },
      select: { id: true },
    });
    return promo?.id ?? null;
  }

  async findRuleById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryFreeDeliveryRule.findUnique({
      where: { id },
      select: FREE_DELIVERY_RULE_SELECT,
    });
  }

  async findAllRules(params: PaginationQueryDto) {
    const select = FREE_DELIVERY_RULE_SELECT;
    return await this.paginationService.paginate<
      Prisma.DeliveryFreeDeliveryRuleGetPayload<{ select: typeof select }>,
      typeof this.prisma.deliveryFreeDeliveryRule
    >(this.prisma.deliveryFreeDeliveryRule, params, {
      select,
      searchableFields: ['name', 'description'],
      defaultSortField: 'priority',
    });
  }

  /**
   * Whether this customer has ever placed an order that stuck, for
   * FIRST_ORDER. Cancelled and failed orders do not count — a customer whose
   * first attempt fell over at the payment step has not had their first order,
   * and telling them otherwise is how a welcome offer becomes a complaint.
   */
  async hasPreviousOrders(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    const count = await client.order.count({
      where: {
        userId,
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.FAILED] },
      },
    });
    return count > 0;
  }

  // ─── Mutations — Zones ─────────────────────────────────────────────────────

  async createZone(
    data: Prisma.DeliveryChargeZoneUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.create({
      data,
      select: DELIVERY_CHARGE_ZONE_SELECT,
    });
  }

  /**
   * Create-or-update keyed on the zone's stable `code`.
   *
   * Exists for the nationwide flat rate, whose screen has one save button and
   * no idea whether the zone has been set up before. Doing the existence check
   * in the service instead would be a race against a second admin pressing the
   * same button — the unique index on `code` makes the upsert the honest way
   * to express it.
   */
  async upsertZoneByCode(
    code: string,
    create: Omit<Prisma.DeliveryChargeZoneUncheckedCreateInput, 'code'>,
    update: Prisma.DeliveryChargeZoneUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.upsert({
      where: { code },
      create: { ...create, code },
      update,
      select: { id: true },
    });
  }

  async updateZone(
    id: number,
    data: Prisma.DeliveryChargeZoneUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryChargeZone.update({
      where: { id },
      data,
      select: DELIVERY_CHARGE_ZONE_SELECT,
    });
  }

  /**
   * Stands down whichever active zone currently holds the catch-all flag,
   * excluding one id.
   *
   * The partial unique index in the migration would reject a second default
   * outright; this turns that 500-shaped conflict into the behaviour an admin
   * actually means by ticking the box — "make *this* the fallback". Runs
   * inside the caller's transaction so there is never a moment with no default
   * at all.
   */
  async clearDefaultZone(
    exceptId: number | null,
    tx: Prisma.TransactionClient,
  ) {
    return await tx.deliveryChargeZone.updateMany({
      where: {
        isDefault: true,
        ...(exceptId !== null ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  /**
   * Active zones that carry their own coverage rules, excluding one id.
   *
   * These are exactly the zones that take precedence over the catch-all — a
   * zone with no area rules claims no address of its own, so it is not an
   * override, it *is* the fallback. Read by the nationwide-rate screen so it
   * can tell an admin, by name, where their "everywhere" price does not
   * actually apply.
   */
  async findOverridingZoneNames(
    exceptId: number | null,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx || this.prisma;
    const zones = await client.deliveryChargeZone.findMany({
      where: {
        status: DeliveryChargeStatus.ACTIVE,
        areas: { some: {} },
        ...(exceptId !== null ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return zones.map((zone) => zone.name);
  }

  /**
   * Stands every other zone down to INACTIVE, so one rate really is the only
   * rate. Never deletes: the zones keep their coverage rules and rate cards
   * and can be switched back on, which is what makes "make this exclusive" a
   * reversible decision rather than a destructive one.
   */
  async deactivateOtherZones(exceptId: number, tx: Prisma.TransactionClient) {
    return await tx.deliveryChargeZone.updateMany({
      where: { id: { not: exceptId }, status: DeliveryChargeStatus.ACTIVE },
      data: { status: DeliveryChargeStatus.INACTIVE },
    });
  }

  async deleteZone(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    //* AREAS AND RATES CASCADE (SEE THE FKs IN THE MIGRATION), AS DO ANY
    //* ZONE-SCOPED FREE-DELIVERY RULES — A RULE SCOPED TO A DELETED ZONE COULD
    //* NEVER FIRE AGAIN, SO LEAVING IT BEHIND WOULD ONLY CLUTTER THE ADMIN LIST.
    return await client.deliveryChargeZone.delete({
      where: { id },
      select: { id: true },
    });
  }

  // ─── Mutations — Areas & rates (declarative replacement) ───────────────────

  async replaceZoneAreas(
    zoneId: number,
    areas: Omit<Prisma.DeliveryChargeAreaUncheckedCreateInput, 'zoneId'>[],
    tx: Prisma.TransactionClient,
  ) {
    await tx.deliveryChargeArea.deleteMany({ where: { zoneId } });
    if (!areas.length) return;
    await tx.deliveryChargeArea.createMany({
      data: areas.map((area) => ({ ...area, zoneId })),
    });
  }

  async replaceZoneRates(
    zoneId: number,
    rates: Omit<Prisma.DeliveryChargeRateUncheckedCreateInput, 'zoneId'>[],
    tx: Prisma.TransactionClient,
  ) {
    await tx.deliveryChargeRate.deleteMany({ where: { zoneId } });
    if (!rates.length) return;
    //* createMany, NOT A NESTED create — THE GiST EXCLUSION CONSTRAINT IS
    //* CHECKED PER ROW AS EACH IS INSERTED, SO THE DELETE ABOVE HAS TO HAVE
    //* ALREADY CLEARED THE OLD BANDS OR A REPLACEMENT CARD WOULD COLLIDE WITH
    //* THE CARD IT REPLACES. BOTH RUN IN THE CALLER'S TRANSACTION.
    await tx.deliveryChargeRate.createMany({
      data: rates.map((rate) => ({ ...rate, zoneId })),
    });
  }

  // ─── Mutations — Free-delivery rules ───────────────────────────────────────

  async createRule(
    data: Prisma.DeliveryFreeDeliveryRuleUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryFreeDeliveryRule.create({
      data,
      select: FREE_DELIVERY_RULE_SELECT,
    });
  }

  async updateRule(
    id: number,
    data: Prisma.DeliveryFreeDeliveryRuleUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryFreeDeliveryRule.update({
      where: { id },
      data,
      select: FREE_DELIVERY_RULE_SELECT,
    });
  }

  async deleteRule(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryFreeDeliveryRule.delete({
      where: { id },
      select: { id: true },
    });
  }

  /**
   * Claims one use of a capped rule, atomically.
   *
   * Identical shape to PromotionRepository's guarded promo-code bump: the
   * `usedCount < usageLimit` predicate is part of the UPDATE, so two orders
   * racing for the last free delivery cannot both win — the loser matches zero
   * rows and the caller re-prices without the waiver. An uncapped rule needs
   * no guard, only the counter.
   *
   * Returns the number of rows updated: 1 = claimed, 0 = lost the race.
   */
  async claimRuleUsage(
    id: number,
    usageLimit: number | null,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await tx.deliveryFreeDeliveryRule.updateMany({
      where:
        usageLimit === null ? { id } : { id, usedCount: { lt: usageLimit } },
      data: { usedCount: { increment: 1 } },
    });
    return result.count;
  }
}
