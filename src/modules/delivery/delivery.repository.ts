import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { PaginationService, PaginationQueryDto } from '../../shared/pagination';
import { DELIVERY_ZONE_ROW_SELECT } from './delivery.select';

@Injectable()
export class DeliveryRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Reads — Providers ───────────────────────────────────────────────────────

  //* CASE-INSENSITIVE ON PURPOSE — THIS IS THE find-or-attach LOOKUP THAT LETS
  //* "KEX Express" SUBMITTED TWICE PRODUCE TWO ZONES UNDER ONE PROVIDER
  //* INSTEAD OF A DUPLICATE-NAME 409. THE UNDERLYING DB CONSTRAINT
  //* (DeliveryProvider.name @unique) STAYS CASE-SENSITIVE.
  async findProviderByName(name: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryProvider.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  async findProviderBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryProvider.findUnique({ where: { slug } });
  }

  async findProviderById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryProvider.findUnique({ where: { id } });
  }

  // ─── Reads — Zones (the flattened admin-table row) ──────────────────────────

  async findZoneById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryZone.findUnique({
      where: { id },
      select: DELIVERY_ZONE_ROW_SELECT,
    });
  }

  async findAllRows(params: PaginationQueryDto) {
    const select = DELIVERY_ZONE_ROW_SELECT;
    return await this.paginationService.paginate<
      Prisma.DeliveryZoneGetPayload<{ select: typeof select }>,
      typeof this.prisma.deliveryZone
    >(this.prisma.deliveryZone, params, {
      select,
      //* company name lives on the related provider, not on the zone itself —
      //* PaginationService's dot-path search supports this (see pagination.service.ts)
      searchableFields: ['areaName', 'provider.name'],
      defaultSortField: 'createdAt',
    });
  }

  // ─── Mutations — Providers ───────────────────────────────────────────────────

  async createProviderWithZone(
    providerData: Prisma.DeliveryProviderUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const provider = await client.deliveryProvider.create({
      data: providerData,
      select: { zones: { select: DELIVERY_ZONE_ROW_SELECT } },
    });
    return provider.zones[0];
  }

  async updateProviderContactInfo(
    id: number,
    data: Pick<
      Prisma.DeliveryProviderUncheckedUpdateInput,
      'phone' | 'officeLocation' | 'updatedBy'
    >,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryProvider.update({ where: { id }, data });
  }

  async renameProvider(
    id: number,
    data: Pick<
      Prisma.DeliveryProviderUncheckedUpdateInput,
      'name' | 'slug' | 'phone' | 'officeLocation' | 'updatedBy'
    >,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryProvider.update({ where: { id }, data });
  }

  // ─── Mutations — Zones ────────────────────────────────────────────────────────

  async createZoneForProvider(
    providerId: number,
    data: Omit<Prisma.DeliveryZoneUncheckedCreateInput, 'providerId'>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryZone.create({
      data: { ...data, providerId },
      select: DELIVERY_ZONE_ROW_SELECT,
    });
  }

  async updateZone(
    id: number,
    data: Prisma.DeliveryZoneUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.deliveryZone.update({
      where: { id },
      data,
      select: DELIVERY_ZONE_ROW_SELECT,
    });
  }

  async deleteZone(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.deliveryZone.delete({
      where: { id },
      select: { id: true },
    });
  }
}
