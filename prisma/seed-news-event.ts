/**
 * Seeds News & Events types and posts so the admin panel and the storefront
 * have realistic content to show.
 *
 * Idempotent: types are upserted by `slug`, posts by `slug`, and each post's
 * images are replaced wholesale (they have no natural unique key — same
 * approach as seed-products.ts). Rows whose slug is not listed here are never
 * touched, so posts an admin created survive a re-run.
 *
 * The mix deliberately exercises every visibility rule:
 *   - ACTIVE + past publishedAt      → visible on the storefront
 *   - ACTIVE + future publishedAt    → scheduled (admin only until that date)
 *   - DRAFT / INACTIVE               → admin only
 *   - soft-deleted (ARCHIVED)        → admin list only, marked Archived
 *   - an inactive type               → hidden from the storefront type filter
 * Ten posts are publicly visible, one more than a storefront page (9), so
 * pagination shows too.
 *
 * Images: copies a few existing uploads into uploads/news-events/images under
 * stable names, so the stored URLs survive re-runs and never point at a file
 * another module might delete.
 *
 * Posts are attributed to the super admin from prisma/seed.ts, or — if that
 * account does not exist — to the earliest active admin.
 *
 * Run with:  npm run db:seed-news-event        (or :local / :office / :prod)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { copyFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { PrismaClient } from '../src/generated/prisma/client';
import { NewsEventStatus } from '../src/generated/prisma/enums';
const { Pool } = pkg;

const SUPER_ADMIN_EMAIL = 'mahfuzislam1695@gmail.com';
const UPLOAD_ROOT = join(process.cwd(), process.env.STORAGE_DESTINATION ?? 'uploads');
const IMAGE_FOLDER = 'news-events/images';

// ─── Images ──────────────────────────────────────────────────────────────────

//* KEY → SOURCE FILE (RELATIVE TO uploads/). COPIED TO news-events/images/seed-<key><ext>
const SOURCE_IMAGES = {
  wellness: 'home/images/hero-image-1783847975609-820295321.png',
  doctor: 'home/images/female-doctor-1783848028284-23774292.png',
  spokesperson: 'blogs/images/feedback1-1783585062657-386879407.jpg',
  supplementBlue: 'products/gallery/blog1-1784795174569-241557816.jpg',
  supplementNight: 'products/gallery/blog2-1784795943059-347273175.jpg',
  comboOffer:
    'combos/images/WhatsApp_Image_2026-05-23_at_3.34.45_PM-1779529813126-392044008.jpeg',
  collagen:
    'combos/gallery/WhatsApp_Image_2026-05-23_at_11.04.52_AM__2_-1779529332013-313268090-1787639029753-617021365.jpeg',
  comboProduct: 'combos/gallery/combo-product2-1786018845848-465881615.png',
} as const;
type ImageKey = keyof typeof SOURCE_IMAGES;

async function exists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

//* RETURNS KEY → PUBLIC URL PATH (E.G. /uploads/news-events/images/seed-wellness.png)
async function prepareImages(): Promise<Map<ImageKey, string>> {
  const targetDir = join(UPLOAD_ROOT, IMAGE_FOLDER);
  await mkdir(targetDir, { recursive: true });

  const urls = new Map<ImageKey, string>();
  for (const [key, source] of Object.entries(SOURCE_IMAGES) as [ImageKey, string][]) {
    const ext = source.slice(source.lastIndexOf('.'));
    const filename = `seed-${key}${ext}`;
    const sourcePath = join(UPLOAD_ROOT, source);
    const targetPath = join(targetDir, filename);

    if (!(await exists(targetPath))) {
      if (!(await exists(sourcePath))) {
        console.warn(`  ! source image missing, skipping: ${source}`);
        continue;
      }
      await copyFile(sourcePath, targetPath);
    }
    urls.set(key, `/uploads/${IMAGE_FOLDER}/${filename}`);
  }
  return urls;
}

// ─── Types ───────────────────────────────────────────────────────────────────

const SEED_TYPES = [
  { slug: 'news', name: 'News', nameTh: 'ข่าวสาร', displayOrder: 0, isActive: true },
  { slug: 'event', name: 'Event', nameTh: 'กิจกรรม', displayOrder: 1, isActive: true },
  { slug: 'press-release', name: 'Press Release', nameTh: 'ข่าวประชาสัมพันธ์', displayOrder: 2, isActive: true },
  { slug: 'promotion', name: 'Promotion', nameTh: 'โปรโมชั่น', displayOrder: 3, isActive: true },
  //* INACTIVE — HIDDEN FROM THE STOREFRONT FILTER, STILL LISTED IN ADMIN
  { slug: 'announcement', name: 'Announcement', nameTh: 'ประกาศ', displayOrder: 4, isActive: false },
] as const;
type TypeSlug = (typeof SEED_TYPES)[number]['slug'];

// ─── Posts ───────────────────────────────────────────────────────────────────

interface SeedPost {
  slug: string;
  type: TypeSlug;
  status: NewsEventStatus;
  isFeatured?: boolean;
  title: string;
  titleTh?: string;
  excerpt: string;
  excerptTh?: string;
  content: string;
  contentTh?: string;
  publishedAt: string | null; //* ISO; null = never published
  startsAt?: string;
  endsAt?: string;
  location?: string;
  locationTh?: string;
  images: ImageKey[]; //* FIRST = COVER
  deleted?: boolean; //* SOFT-DELETED (TRASH)
}

const p = (...paragraphs: string[]) => paragraphs.map((text) => `<p>${text}</p>`).join('');

const SEED_POSTS: SeedPost[] = [
  {
    slug: 'expanding-access-to-premium-wellness',
    type: 'news',
    status: NewsEventStatus.ACTIVE,
    isFeatured: true,
    title: 'Expanding Access to Premium Wellness: THP Introduces New Imported Supplements',
    titleTh: 'ขยายการเข้าถึงสุขภาพระดับพรีเมียม: THP เปิดตัวผลิตภัณฑ์เสริมอาหารนำเข้าใหม่',
    excerpt:
      'A new line of imported dietary supplements arrives on THP, backed by Thai FDA registration and temperature-controlled delivery.',
    excerptTh: 'ผลิตภัณฑ์เสริมอาหารนำเข้าไลน์ใหม่ ขึ้นทะเบียน อย. พร้อมการจัดส่งแบบควบคุมอุณหภูมิ',
    content:
      '<h2>A wider shelf, the same standards</h2>' +
      p(
        'Thai Health Product is expanding its catalogue with a curated range of imported dietary supplements. Every product in the new line is registered with the Thai FDA and passes the same quality review as our own brand.',
        'Recognising that high-potency supplements and vitamins are sensitive to heat, we have upgraded to temperature-controlled packaging and logistics for this new product line.',
        'From warehouse handling to final delivery, product integrity is strictly maintained. Customers can count on receiving their wellness items in optimal condition right at their doorstep.',
      ),
    contentTh: p(
      'Thai Health Product ขยายรายการสินค้าด้วยผลิตภัณฑ์เสริมอาหารนำเข้าที่คัดสรรมาอย่างดี ทุกรายการขึ้นทะเบียนกับ อย. และผ่านการตรวจสอบคุณภาพเช่นเดียวกับแบรนด์ของเรา',
      'ตั้งแต่คลังสินค้าจนถึงมือลูกค้า เราดูแลคุณภาพสินค้าอย่างเข้มงวดด้วยบรรจุภัณฑ์และการขนส่งแบบควบคุมอุณหภูมิ',
    ),
    publishedAt: '2026-11-03T09:00:00+07:00',
    images: ['supplementBlue', 'supplementNight', 'collagen'],
  },
  {
    slug: 'the-science-behind-our-products',
    type: 'news',
    status: NewsEventStatus.ACTIVE,
    title: 'The Science Behind Our Products',
    titleTh: 'วิทยาศาสตร์เบื้องหลังผลิตภัณฑ์ของเรา',
    excerpt:
      'How THP formulates, tests and certifies every capsule — from raw material sourcing to GMP-certified production.',
    excerptTh: 'THP คิดค้น ทดสอบ และรับรองทุกแคปซูลอย่างไร ตั้งแต่การคัดเลือกวัตถุดิบจนถึงการผลิตตามมาตรฐาน GMP',
    content:
      '<h2>Research first</h2>' +
      p(
        'Every THP formula starts with published clinical research on its key ingredients. Our product team works with pharmacists to set effective, safe dosages.',
        'Raw materials are sourced from certified suppliers and tested on arrival for purity and heavy metals before they reach production.',
      ) +
      '<h2>Made to GMP standards</h2>' +
      p(
        'Production takes place in GMP-certified facilities, and every batch is tracked by its manufacturer batch number so it can be traced back to its source.',
      ),
    publishedAt: '2026-10-27T10:00:00+07:00',
    images: ['doctor', 'supplementNight'],
  },
  {
    slug: 'thp-partners-with-certified-organic-farms',
    type: 'press-release',
    status: NewsEventStatus.ACTIVE,
    isFeatured: true,
    title: 'THP Partners with Certified Organic Farms',
    titleTh: 'THP จับมือฟาร์มออร์แกนิกที่ได้รับการรับรอง',
    excerpt:
      'A new sourcing partnership with certified organic growers in Northern Thailand secures traceable herbal ingredients.',
    excerptTh: 'ความร่วมมือใหม่กับเกษตรกรออร์แกนิกในภาคเหนือ เพื่อวัตถุดิบสมุนไพรที่ตรวจสอบย้อนกลับได้',
    content: p(
      'Thai Health Product has signed a multi-year sourcing agreement with certified organic farms in Chiang Mai and Chiang Rai.',
      'The partnership guarantees a traceable supply of herbal ingredients and supports local farming communities with fair, long-term contracts.',
      'The first products made with these ingredients are expected on the THP store in early 2027.',
    ),
    publishedAt: '2026-10-20T09:30:00+07:00',
    images: ['wellness'],
  },
  {
    slug: 'community-health-fair-bangkok-2026',
    type: 'event',
    status: NewsEventStatus.ACTIVE,
    isFeatured: true,
    title: 'Community Health Fair Bangkok 2026',
    titleTh: 'งานมหกรรมสุขภาพชุมชน กรุงเทพฯ 2026',
    excerpt:
      'Free health checks, pharmacist consultations and product samples. Join us for a weekend of wellness in Bangkok.',
    excerptTh: 'ตรวจสุขภาพฟรี ปรึกษาเภสัชกร และรับตัวอย่างสินค้า พบกันที่กรุงเทพฯ',
    content:
      '<h2>What to expect</h2>' +
      p(
        'Our pharmacists will offer free blood pressure and blood sugar checks, along with one-to-one consultations on choosing the right supplements.',
        'Visitors can try samples from the THP range and receive an exclusive event discount code for the online store.',
      ),
    contentTh: p(
      'เภสัชกรของเราจะให้บริการตรวจวัดความดันและน้ำตาลในเลือดฟรี พร้อมให้คำปรึกษาการเลือกผลิตภัณฑ์เสริมอาหาร',
      'ผู้เข้าร่วมงานสามารถทดลองผลิตภัณฑ์ THP และรับโค้ดส่วนลดพิเศษสำหรับร้านค้าออนไลน์',
    ),
    publishedAt: '2026-11-05T08:00:00+07:00',
    startsAt: '2026-12-12T09:00:00+07:00',
    endsAt: '2026-12-13T17:00:00+07:00',
    location: 'Queen Sirikit National Convention Center, Bangkok',
    locationTh: 'ศูนย์การประชุมแห่งชาติสิริกิติ์ กรุงเทพฯ',
    images: ['wellness', 'doctor', 'spokesperson'],
  },
  {
    slug: 'free-wellness-check-chiang-mai',
    type: 'event',
    status: NewsEventStatus.ACTIVE,
    title: 'Free Wellness Check Day in Chiang Mai',
    titleTh: 'วันตรวจสุขภาพฟรี ที่เชียงใหม่',
    excerpt: 'Our mobile health team visits Chiang Mai with free screenings and nutrition advice.',
    excerptTh: 'ทีมสุขภาพเคลื่อนที่ของเราเยือนเชียงใหม่ พร้อมตรวจคัดกรองและให้คำแนะนำด้านโภชนาการฟรี',
    content: p(
      'The THP mobile health team will spend a day at Central Festival Chiang Mai offering free basic screenings and nutrition advice.',
      'No registration is needed — walk in any time during opening hours.',
    ),
    publishedAt: '2026-10-15T09:00:00+07:00',
    startsAt: '2026-11-22T10:00:00+07:00',
    endsAt: '2026-11-22T18:00:00+07:00',
    location: 'Central Festival Chiang Mai',
    locationTh: 'เซ็นทรัล เฟสติวัล เชียงใหม่',
    images: ['doctor'],
  },
  {
    slug: 'thp-at-thailand-health-expo-2026',
    type: 'event',
    status: NewsEventStatus.ACTIVE,
    title: 'THP at Thailand Health Expo 2026',
    titleTh: 'THP ในงาน Thailand Health Expo 2026',
    excerpt: 'Thank you to everyone who visited our booth. Here are the highlights from three busy days.',
    excerptTh: 'ขอบคุณทุกท่านที่แวะมาที่บูธของเรา นี่คือไฮไลต์จากสามวันที่ผ่านมา',
    content: p(
      'Over three days, more than 2,000 visitors stopped by the THP booth to learn about our collagen and vitamin ranges.',
      'Our team held six live talks on daily nutrition, and the Collagen Tripeptide 600 Plus CoQ10 sold out on the second day.',
    ),
    publishedAt: '2026-09-30T18:00:00+07:00',
    startsAt: '2026-09-25T10:00:00+07:00',
    endsAt: '2026-09-27T20:00:00+07:00',
    location: 'IMPACT Muang Thong Thani, Nonthaburi',
    locationTh: 'อิมแพ็ค เมืองทองธานี นนทบุรี',
    images: ['collagen', 'comboProduct', 'supplementBlue'],
  },
  {
    slug: 'year-end-combo-offers',
    type: 'promotion',
    status: NewsEventStatus.ACTIVE,
    title: 'Year-End Combo Offers Are Here',
    titleTh: 'โปรโมชั่นชุดคอมโบส่งท้ายปี มาแล้ว',
    excerpt: 'Save on bundles of our best-selling supplements until the end of December.',
    excerptTh: 'ประหยัดยิ่งขึ้นกับชุดผลิตภัณฑ์ขายดี ถึงสิ้นเดือนธันวาคม',
    content: p(
      'Our year-end combos pair best sellers such as Acerola Cherry Plus and Collagen Tripeptide 600 Plus CoQ10 at a special bundle price.',
      'Offers are available on the THP online store while stocks last.',
    ),
    publishedAt: '2026-11-01T00:00:00+07:00',
    images: ['comboOffer', 'collagen'],
  },
  {
    slug: 'meet-our-head-pharmacist',
    type: 'news',
    status: NewsEventStatus.ACTIVE,
    title: 'Meet Our Head Pharmacist',
    titleTh: 'พบกับหัวหน้าเภสัชกรของเรา',
    excerpt: 'A conversation about safe supplement use, common myths and how our product team works.',
    excerptTh: 'พูดคุยเรื่องการใช้ผลิตภัณฑ์เสริมอาหารอย่างปลอดภัย ความเชื่อผิด ๆ และการทำงานของทีม',
    content: p(
      'We sat down with our head pharmacist to talk about how customers can use supplements safely alongside their regular medication.',
      '"The most common mistake is doubling up the same vitamin from different products," she explains. "Always check the label and ask a pharmacist if you are unsure."',
    ),
    publishedAt: '2026-09-18T10:00:00+07:00',
    images: ['spokesperson'],
  },
  {
    slug: 'gmp-certification-renewed',
    type: 'press-release',
    status: NewsEventStatus.ACTIVE,
    title: 'GMP Certification Renewed for 2026–2029',
    titleTh: 'ต่ออายุการรับรองมาตรฐาน GMP ปี 2026–2029',
    excerpt: 'Our manufacturing partner has renewed its GMP certification after a full audit.',
    excerptTh: 'ผู้ผลิตของเราได้รับการต่ออายุการรับรอง GMP หลังผ่านการตรวจประเมินเต็มรูปแบบ',
    content: p(
      'Following a full on-site audit, our manufacturing partner has renewed its Good Manufacturing Practice certification for another three years.',
      'The renewal covers every THP-branded product currently on sale.',
    ),
    publishedAt: '2026-08-28T09:00:00+07:00',
    images: ['supplementNight'],
  },
  {
    slug: 'healthy-living-workshop-phuket',
    type: 'event',
    status: NewsEventStatus.ACTIVE,
    title: 'Healthy Living Workshop in Phuket',
    titleTh: 'เวิร์กช็อปการใช้ชีวิตเพื่อสุขภาพ ที่ภูเก็ต',
    excerpt: 'A hands-on afternoon on nutrition, sleep and everyday movement with THP experts.',
    excerptTh: 'เวิร์กช็อปภาคปฏิบัติเรื่องโภชนาการ การนอนหลับ และการเคลื่อนไหวในชีวิตประจำวัน',
    content: p(
      'Join THP experts for a hands-on afternoon covering balanced nutrition, better sleep habits and simple daily movement.',
      'Seats are limited to 40 participants. Light healthy snacks will be served.',
    ),
    publishedAt: '2026-08-10T09:00:00+07:00',
    startsAt: '2026-08-23T13:00:00+07:00',
    endsAt: '2026-08-23T17:00:00+07:00',
    location: 'Phuket Old Town Community Hall',
    locationTh: 'หอประชุมชุมชนเมืองเก่าภูเก็ต',
    images: ['wellness', 'spokesperson'],
  },

  // ─── Not visible on the storefront ─────────────────────────────────────────

  {
    //* SCHEDULED — ACTIVE BUT publishedAt IS IN THE FUTURE
    slug: 'new-year-wellness-challenge-2027',
    type: 'event',
    status: NewsEventStatus.ACTIVE,
    title: 'New Year Wellness Challenge 2027',
    titleTh: 'ภารกิจสุขภาพดีรับปีใหม่ 2027',
    excerpt: 'A 30-day challenge to start 2027 with better habits. Prizes for every finisher.',
    content: p(
      'Start the new year with a 30-day wellness challenge: daily steps, water intake and sleep goals tracked together with the THP community.',
    ),
    publishedAt: '2026-12-20T09:00:00+07:00',
    startsAt: '2027-01-01T00:00:00+07:00',
    endsAt: '2027-01-30T23:59:00+07:00',
    location: 'Online',
    locationTh: 'ออนไลน์',
    images: ['wellness'],
  },
  {
    //* DRAFT — NEVER PUBLISHED
    slug: 'vitamin-d-guide-draft',
    type: 'news',
    status: NewsEventStatus.DRAFT,
    title: 'A Practical Guide to Vitamin D in a Sunny Country',
    excerpt: 'Why vitamin D deficiency is common in Thailand despite the sunshine.',
    content: p('Draft — content still being reviewed by the pharmacy team.'),
    publishedAt: null,
    images: ['supplementBlue'],
  },
  {
    //* INACTIVE — WAS PUBLISHED, THEN TAKEN DOWN
    slug: 'songkran-delivery-schedule',
    type: 'announcement',
    status: NewsEventStatus.INACTIVE,
    title: 'Songkran Holiday Delivery Schedule',
    titleTh: 'ตารางการจัดส่งช่วงวันหยุดสงกรานต์',
    excerpt: 'Orders placed during the Songkran holiday will ship from April 16.',
    content: p('Orders placed between April 12 and 15 will be shipped from April 16.'),
    publishedAt: '2026-04-05T09:00:00+07:00',
    images: ['comboProduct'],
  },
  {
    //* SOFT-DELETED — SHOWS ONLY IN THE ADMIN TRASH TAB
    slug: 'summer-flash-sale-2026',
    type: 'promotion',
    status: NewsEventStatus.ACTIVE,
    title: 'Summer Flash Sale 2026',
    excerpt: 'Up to 30% off selected vitamins for 48 hours.',
    content: p('Up to 30% off selected vitamins for 48 hours only.'),
    publishedAt: '2026-05-01T09:00:00+07:00',
    images: ['comboOffer'],
    deleted: true,
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const prisma = new PrismaClient({ adapter });

  try {
    //* PREFER THE SEEDED SUPER ADMIN; A DB THAT NEVER RAN seed.ts FALLS BACK
    //* TO ITS EARLIEST ACTIVE ADMIN SO THE SCRIPT STILL WORKS THERE
    const superAdmin =
      (await prisma.user.findFirst({
        where: { email: SUPER_ADMIN_EMAIL, deletedAt: null },
        select: { id: true },
      })) ??
      (await prisma.user.findFirstOrThrow({
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      }));

    const imageUrls = await prepareImages();
    console.log(`Prepared ${imageUrls.size} images in uploads/${IMAGE_FOLDER}`);

    const typeIds = new Map<string, number>();
    for (const type of SEED_TYPES) {
      const { slug, ...data } = type;
      const row = await prisma.newsEventType.upsert({
        where: { slug },
        create: { slug, ...data, createdBy: superAdmin.id, updatedBy: superAdmin.id },
        update: { ...data, updatedBy: superAdmin.id },
        select: { id: true },
      });
      typeIds.set(slug, row.id);
    }
    console.log(`Upserted ${typeIds.size} news & event types`);

    for (const post of SEED_POSTS) {
      const { slug, type, images, deleted, publishedAt, startsAt, endsAt, ...fields } = post;
      const data = {
        ...fields,
        typeId: typeIds.get(type)!,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        isFeatured: fields.isFeatured ?? false,
        deletedAt: deleted ? new Date() : null,
        //* SOFT DELETE = ARCHIVED + deletedAt, SAME AS THE DELETE ENDPOINT
        status: deleted ? NewsEventStatus.ARCHIVED : fields.status,
        seoMetadata: { metaTitle: fields.title, metaDescription: fields.excerpt },
        authorId: superAdmin.id,
      };

      await prisma.$transaction(async (tx) => {
        const row = await tx.newsEvent.upsert({
          where: { slug },
          create: { slug, ...data },
          update: data,
          select: { id: true },
        });

        //* FULL REPLACE KEEPS RE-RUNS IDEMPOTENT (IMAGES HAVE NO NATURAL KEY)
        await tx.newsEventImage.deleteMany({ where: { newsEventId: row.id } });
        const urls = images.map((key) => imageUrls.get(key)).filter((url): url is string => !!url);
        await tx.newsEventImage.createMany({
          data: urls.map((url, index) => ({
            newsEventId: row.id,
            url,
            altText: fields.title,
            displayOrder: index,
            isCover: index === 0,
          })),
        });
      });
      console.log(`  ✓ ${slug} [${data.status}]`);
    }

    console.log(`Upserted ${SEED_POSTS.length} news & event posts`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
