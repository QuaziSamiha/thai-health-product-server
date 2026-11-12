/**
 * Seeds the "Become a Partner" form's partner type dropdown options as ACTIVE,
 * in the order the design shows them. (Countries are static ISO data in
 * src/common/geography/countries.ts — nothing to seed.)
 *
 * Idempotent: rows are matched by name (case-insensitive). A name that already
 * exists is left untouched, so an admin's later edits (rename, deactivate,
 * archive) survive a re-run. Only missing names are created.
 *
 * Rows are attributed to the super admin from prisma/seed.ts, or — if that
 * account does not exist — to the earliest active admin.
 *
 * Run with:  npm run db:seed-partner        (or :local / :prod)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PartnerOptionStatus } from '../src/generated/prisma/enums';
const { Pool } = pkg;

const SUPER_ADMIN_EMAIL = 'mahfuzislam1695@gmail.com';

//* ORDER MATTERS — THE PUBLIC DROPDOWN LISTS OPTIONS BY id, I.E. INSERT ORDER
const PARTNER_TYPES = [
  'Pharmacy',
  'Dealer',
  'Distributor',
  'International Partner',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const prisma = new PrismaClient({ adapter });

  try {
    const admin =
      (await prisma.user.findFirst({
        where: { email: SUPER_ADMIN_EMAIL, deletedAt: null },
        select: { id: true },
      })) ??
      (await prisma.user.findFirst({
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      }));
    const userId = admin?.id ?? null;

    let created = 0;
    let skipped = 0;

    for (const name of PARTNER_TYPES) {
      const existing = await prisma.partnerType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.partnerType.create({
        data: {
          name,
          status: PartnerOptionStatus.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      created++;
    }
    console.log(
      `Partner types: ${created} created, ${skipped} already existed`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
