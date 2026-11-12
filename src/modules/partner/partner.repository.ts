import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import {
  PartnerOptionStatus,
  PartnerRequestStatus,
} from '../../generated/prisma/enums';
import { PaginationService } from '../../shared/pagination';
import { PartnerOptionQueryDto } from './dto/partner-option.dto';
import { PartnerRequestQueryDto } from './dto/partner-request.dto';

const USER_MINIFIED_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

const OPTION_SELECT = {
  id: true,
  sid: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdByUser: { select: USER_MINIFIED_SELECT },
  updatedByUser: { select: USER_MINIFIED_SELECT },
  _count: { select: { partnerRequests: true } },
} as const;

const OPTION_MINIFIED_SELECT = { id: true, name: true } as const;

const REQUEST_SELECT = {
  id: true,
  sid: true,
  name: true,
  companyName: true,
  message: true,
  countryCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  partnerType: { select: OPTION_MINIFIED_SELECT },
} as const;

type OptionWrite = { name?: string; status?: PartnerOptionStatus };

@Injectable()
export class PartnerRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  //* NO status FILTER → EVERY ROW, ARCHIVED INCLUDED (THE ADMIN TABLE SHOWS
  //* ARCHIVED ROWS AS READ-ONLY)
  private optionWhere(params: PartnerOptionQueryDto) {
    return params.status ? { status: params.status } : {};
  }

  // ─── Partner Type ──────────────────────────────────────────────────────────

  async findTypeById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.partnerType.findUnique({
      where: { id },
      select: OPTION_SELECT,
    });
  }

  //* CASE-INSENSITIVE SO "Distributor" AND "distributor" CAN'T BOTH EXIST
  async findTypeByName(name: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.partnerType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, status: true },
    });
  }

  async findAllTypes(
    params: PartnerOptionQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      Prisma.PartnerTypeGetPayload<{ select: typeof OPTION_SELECT }>,
      typeof client.partnerType
    >(client.partnerType, params, {
      select: OPTION_SELECT,
      where: this.optionWhere(params),
      searchableFields: ['name'],
      defaultSortField: 'createdAt',
    });
  }

  async findActiveTypes(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.partnerType.findMany({
      where: { status: PartnerOptionStatus.ACTIVE },
      select: OPTION_MINIFIED_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  async createType(
    data: OptionWrite & { name: string; userId: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { userId, ...rest } = data;
    return await client.partnerType.create({
      data: { ...rest, createdBy: userId, updatedBy: userId },
      select: OPTION_SELECT,
    });
  }

  async updateType(
    id: number,
    data: OptionWrite & { userId: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { userId, ...rest } = data;
    return await client.partnerType.update({
      where: { id },
      data: { ...rest, updatedBy: userId },
      select: OPTION_SELECT,
    });
  }

  // ─── Partner Request ───────────────────────────────────────────────────────

  async findRequestById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.partnerRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
  }

  async findAllRequests(
    params: PartnerRequestQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { status, partnerTypeId, countryCode } = params;
    return await this.paginationService.paginate<
      Prisma.PartnerRequestGetPayload<{ select: typeof REQUEST_SELECT }>,
      typeof client.partnerRequest
    >(client.partnerRequest, params, {
      select: REQUEST_SELECT,
      where: {
        ...(status && { status }),
        ...(partnerTypeId && { partnerTypeId }),
        ...(countryCode && { countryCode }),
      },
      searchableFields: ['name', 'companyName'],
      defaultSortField: 'createdAt',
    });
  }

  async createRequest(
    data: {
      name: string;
      companyName: string;
      message?: string;
      partnerTypeId: number;
      countryCode: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.partnerRequest.create({
      data,
      select: REQUEST_SELECT,
    });
  }

  //* HARD DELETE — NOTHING REFERENCES partner_requests, SO THE ROW CAN GO
  async deleteRequest(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.partnerRequest.delete({
      where: { id },
      select: REQUEST_SELECT,
    });
  }

  async updateRequestStatus(
    id: number,
    status: PartnerRequestStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.partnerRequest.update({
      where: { id },
      data: { status },
      select: REQUEST_SELECT,
    });
  }
}
