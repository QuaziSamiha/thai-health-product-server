import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { PaginationService } from '../../shared/pagination';
import {
  ContactMessageQueryDto,
  CreateContactMessageDto,
  UpdateContactInfoDto,
} from './dto/contact.dto';

//* contact_info IS A SINGLETON — ALWAYS THE ROW WITH THIS ID
export const CONTACT_INFO_ID = 1;

const USER_MINIFIED_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

//* GET /contact/info IS PUBLIC — NEVER EXPOSE ADMIN USER DETAILS THERE
const INFO_PUBLIC_SELECT = {
  id: true,
  hotline: true,
  lineId: true,
  email: true,
  heading: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

//* ADMIN-ONLY RESPONSES ALSO SHOW WHO CREATED / LAST UPDATED IT
const INFO_SELECT = {
  ...INFO_PUBLIC_SELECT,
  createdByUser: { select: USER_MINIFIED_SELECT },
  updatedByUser: { select: USER_MINIFIED_SELECT },
} as const;

const MESSAGE_SELECT = {
  id: true,
  sid: true,
  name: true,
  email: true,
  phone: true,
  message: true,
  isRead: true,
  createdAt: true,
} as const;

export type ContactInfoRow = Prisma.ContactInfoGetPayload<{
  select: typeof INFO_SELECT;
}>;
export type ContactMessageRow = Prisma.ContactMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

@Injectable()
export class ContactRepository extends BaseRepository {
  constructor(
    prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {
    super(prisma);
  }

  // ─── Contact Info ──────────────────────────────────────────────────────────

  async findInfo(tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.contactInfo.findUnique({
      where: { id: CONTACT_INFO_ID },
      select: INFO_PUBLIC_SELECT,
    });
  }

  async upsertInfo(
    userId: number,
    data: UpdateContactInfoDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const values = { ...data, lineId: data.lineId || null, updatedBy: userId };
    return await client.contactInfo.upsert({
      where: { id: CONTACT_INFO_ID },
      create: { id: CONTACT_INFO_ID, ...values, createdBy: userId },
      update: values,
      select: INFO_SELECT,
    });
  }

  // ─── Contact Message ───────────────────────────────────────────────────────

  async findMessageById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.contactMessage.findUnique({
      where: { id },
      select: MESSAGE_SELECT,
    });
  }

  async findAllMessages(
    params: ContactMessageQueryDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await this.paginationService.paginate<
      ContactMessageRow,
      typeof client.contactMessage
    >(client.contactMessage, params, {
      select: MESSAGE_SELECT,
      where: params.isRead === undefined ? {} : { isRead: params.isRead },
      searchableFields: ['name', 'email', 'phone', 'message'],
      defaultSortField: 'createdAt',
    });
  }

  async createMessage(
    data: CreateContactMessageDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.contactMessage.create({
      data,
      select: MESSAGE_SELECT,
    });
  }

  async markMessageRead(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.contactMessage.update({
      where: { id },
      data: { isRead: true },
      select: MESSAGE_SELECT,
    });
  }

  async deleteMessage(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.contactMessage.delete({
      where: { id },
      select: MESSAGE_SELECT,
    });
  }
}
