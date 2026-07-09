import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import {
  Prisma,
  HomeContentStatus,
  HomeContentType,
} from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import { HOME_SELECT_ADMIN, HOME_SELECT_PUBLIC } from './home.select';

@Injectable()
export class HomeRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Single Lookups ──────────────────────────────────────────────────

  async findByIdAdmin(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.home.findUnique({
      where: { id },
      select: HOME_SELECT_ADMIN,
    });
  }

  // ─── Reads — Lists ───────────────────────────────────────────────────────────

  async findAllAdmin(
    params: PaginationQueryDto,
    type?: HomeContentType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.HomeGetPayload<{ select: typeof HOME_SELECT_ADMIN }>,
      typeof client.home
    >(client.home, params, {
      select: HOME_SELECT_ADMIN,
      where: type ? { type } : undefined,
      searchableFields: ['heading', 'headingTh'],
      defaultSortField: 'displayOrder',
    });
  }

  async findActiveByType(type: HomeContentType, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.home.findMany({
      where: { type, status: HomeContentStatus.ACTIVE },
      select: HOME_SELECT_PUBLIC,
      orderBy: { displayOrder: 'asc' },
    });
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async createHome(
    data: Prisma.HomeUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.home.create({
      data,
      select: HOME_SELECT_ADMIN,
    });
  }

  async updateHome(
    id: number,
    data: Prisma.HomeUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.home.update({
      where: { id },
      data,
      select: HOME_SELECT_ADMIN,
    });
  }

  async deleteHome(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.home.delete({ where: { id }, select: { id: true } });
  }
}
