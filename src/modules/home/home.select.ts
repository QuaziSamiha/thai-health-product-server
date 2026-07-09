//* ═══════════════════════════════════════════════════════════════════════
//* HOME SELECT SHAPES — PRISMA PROJECTIONS FOR EACH ROLE-BASED RESPONSE.
//* KEEP EACH ONE IN SYNC WITH THE DTO CONSTRUCTOR IT FEEDS
//* (see src/modules/home/dto/home-response.dto.ts).
//* ═══════════════════════════════════════════════════════════════════════

//* ADMIN — feeds HomeResponseDto. Full detail: status, raw audit FKs, plus
//* the resolved creator/updater for the back-office dashboard.
//* Never reuse this select for a public/unauthenticated route.
export const HOME_SELECT_ADMIN = {
  id: true,
  sid: true,
  type: true,
  status: true,
  heading: true,
  bodyText: true,
  headingTh: true,
  bodyTextTh: true,
  imageUrl: true,
  videoUrl: true,
  redirectUrl: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  //* MATCHES UserMinifiedResponseDto / MinifiedUser (user/dto/user-response.dto.ts)
  createdByUser: {
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: {
        select: { name: true },
      },
    },
  },
  updatedByUser: {
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      profile: {
        select: { name: true },
      },
    },
  },
} as const;

//* PUBLIC — feeds HomeResponsePublicDto. Storefront/landing-page view: no
//* `status` (internal workflow state) and no audit fields — a public reader
//* only needs the content itself.
export const HOME_SELECT_PUBLIC = {
  id: true,
  sid: true,
  type: true,
  heading: true,
  bodyText: true,
  headingTh: true,
  bodyTextTh: true,
  imageUrl: true,
  videoUrl: true,
  redirectUrl: true,
  displayOrder: true,
} as const;
