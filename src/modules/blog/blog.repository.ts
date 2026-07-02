import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import {
  BLOG_SELECT_ADMIN,
  BLOG_SELECT_PUBLIC,
  BLOG_SELECT_SLUG_CONFLICT,
} from './blog.select';

@Injectable()
export class BlogRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups (role-based) ────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.blog.findUnique({
      where: { id },
      select: BLOG_SELECT_ADMIN,
    });
  }

  async findBySlugPublic(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.blog.findUnique({
      where: { slug },
      select: BLOG_SELECT_PUBLIC,
    });
  }

  /** Cheap existence/uniqueness check used by the create/update slug guard. */
  async findSlugConflict(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.blog.findUnique({
      where: { slug },
      select: BLOG_SELECT_SLUG_CONFLICT,
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllBlogsAdmin(
    params: PaginationQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.BlogGetPayload<{ select: typeof BLOG_SELECT_ADMIN }>,
      typeof client.blog
    >(client.blog, params, {
      select: BLOG_SELECT_ADMIN,
      searchableFields: ['title', 'slug'],
      defaultSortField: 'createdAt',
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createBlog(
    data: Prisma.BlogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.blog.create({
      data,
      select: BLOG_SELECT_ADMIN,
    });
  }

  async updateBlog(
    id: number,
    data: Prisma.BlogUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.blog.update({
      where: { id },
      data,
      select: BLOG_SELECT_ADMIN,
    });
  }

  async deleteBlog(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.blog.delete({ where: { id }, select: { id: true } });
  }
}
