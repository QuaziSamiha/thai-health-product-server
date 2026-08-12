import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
const { Pool } = pkg;

const DATA_FILE = path.join(__dirname, 'seed-data', 'products.json');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const prisma = new PrismaClient({ adapter });

  try {
    const categories = await prisma.category.findMany();
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      include: { images: true, variants: true },
    });

    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ categories, products }, null, 2),
    );

    console.log(
      `Exported ${categories.length} categories and ${products.length} products to ${DATA_FILE}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});
