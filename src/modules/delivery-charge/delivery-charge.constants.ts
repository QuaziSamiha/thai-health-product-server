//* ═══════════════════════════════════════════════════════════════════════
//* DELIVERY-CHARGE TUNABLES THAT ARE NOT ROWS.
//*
//* EVERY *PRICE* LIVES IN THE DATABASE (delivery-charge.prisma) SO AN ADMIN
//* CAN CHANGE IT WITHOUT A DEPLOY. WHAT IS HERE IS THE OPPOSITE KIND OF
//* NUMBER: DEFAULTS AND LIMITS THAT DEFINE HOW THE CALCULATOR *BEHAVES*, AND
//* WHICH CHANGING WOULD BE A CODE REVIEW, NOT A MERCHANDISING DECISION.
//* ═══════════════════════════════════════════════════════════════════════

/**
 * Weight assumed for a line whose catalog row has no `weight` on file.
 *
 * `Product.weight` / `ProductVariant.weight` are nullable (product.prisma) and
 * a lot of the catalog predates anyone filling them in. Treating a missing
 * weight as 0 would be the dangerous default — a whole basket of unweighed
 * items would price into the cheapest band and ship at a loss — so an
 * unweighed unit is assumed to be a small retail box instead. Health products
 * here are supplements and topicals, which is what 0.5 kg reflects.
 *
 * This is a floor on revenue, not an estimate of reality: fill in the real
 * weights and this constant stops being reachable.
 */
export const DEFAULT_ITEM_WEIGHT_KG = 0.5;

/**
 * Thailand is UTC+7 year-round and has never observed DST, so a fixed offset
 * is exact here rather than an approximation — no tz database needed to turn
 * "now" into a Bangkok calendar day for the dispatch cut-off.
 */
export const THAILAND_UTC_OFFSET_MINUTES = 7 * 60;

/** ISO-4217 code every amount this module returns is denominated in. */
export const DELIVERY_CURRENCY = 'THB';

/**
 * Per-IP ceiling on the public quote endpoint.
 *
 * The quote route is unauthenticated by necessity — guests check out — and it
 * takes a destination plus a basket, which makes it two things at once: a
 * price oracle worth scraping, and the most database-expensive public read in
 * the app (zone match, tier lookup, catalog weights, rule evaluation). 30 per
 * minute is far above a human editing an address form and far below a useful
 * scrape rate. No blockDuration: unlike the auth routes this is not a
 * credential-guessing surface, so a customer who trips it should recover on
 * the next window rather than serve a penalty.
 */
export const DELIVERY_QUOTE_THROTTLE = { limit: 30, ttl: 60_000 };

/**
 * Hard cap on how many distinct lines one quote request may carry.
 *
 * Independent of the per-line quantity cap: the cost of a quote scales with
 * the number of *rows* it has to look up, not with the units on them. The
 * order path itself is bounded by what a real cart can hold; this bounds the
 * unauthenticated path, which is bounded by nothing else.
 */
export const MAX_QUOTE_ITEMS = 100;

/**
 * Reserved zone code for the "one charge, everywhere" rate.
 *
 * Reserving a code is what lets `PUT /delivery-charge/nationwide-flat-rate` be
 * a genuine upsert — the screen has one save button and no idea whether the
 * zone exists yet, and making it find out first would be a race against a
 * second admin pressing the same button.
 *
 * The zone it names is otherwise completely ordinary: FLAT basis, no area
 * rules, `isDefault`, one open-ended band. Nothing in the calculator branches
 * on this string, which is what lets a shop start with a flat rate and later
 * add a REMOTE zone beside it without migrating anything.
 */
export const NATIONWIDE_ZONE_CODE = 'NATIONWIDE';
