import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from '../../prisma/base.repository';
import { Prisma } from '../../generated/prisma/client';
import { AddressType } from '../../generated/prisma/enums';
import { UpdateAddressDto } from './dto/update-address.dto';

//* recipientName IS REQUIRED HERE EVEN THOUGH CreateAddressDto MAKES IT
//* OPTIONAL — AddressService RESOLVES THE FALLBACK (USER'S OWN PROFILE NAME)
//* BEFORE CALLING createAddress. phone STAYS OPTIONAL ALL THE WAY DOWN —
//* NOT EVERY ACCOUNT HAS ONE ON FILE TO FALL BACK TO, AND IT'S ONLY
//* MANDATORY AT ORDER PLACEMENT, NOT ADDRESS-BOOK SAVE TIME.
interface CreateAddressData {
  label?: string;
  recipientName: string;
  phone?: string;
  addressLine: string;
  state: string;
  region: string;
  postalCode: string;
  country?: string;
  isDefault: boolean;
}

@Injectable()
export class AddressRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.findUnique({ where: { id } });
  }

  //* DEFAULT FIRST, THEN NEWEST — MATCHES THE PROFILE ADDRESS-BOOK LISTING ORDER
  async findAllByUserId(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findDefaultByUserId(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.findFirst({
      where: { userId, isDefault: true },
    });
  }

  async countByUserId(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.count({ where: { userId } });
  }

  //* FALLBACK SOURCE FOR CreateAddressDto.recipientName/phone WHEN OMITTED —
  //* SEE AddressService.resolveContactDefaults
  async findUserContactInfo(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async createAddress(
    userId: number,
    data: CreateAddressData,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.address.create({
      data: {
        ...data,
        type: AddressType.SHIPPING,
        user: { connect: { id: userId } },
      },
    });
  }

  async updateAddress(
    id: number,
    data: UpdateAddressDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.address.update({ where: { id }, data });
  }

  async deleteAddress(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.delete({ where: { id } });
  }

  //* UNSET ANY EXISTING DEFAULT(S) FOR THIS USER — CALLED BEFORE SETTING A NEW
  //* DEFAULT SO A USER NEVER ENDS UP WITH MORE THAN ONE
  async clearDefaultForUser(userId: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  async setDefault(id: number, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.address.update({
      where: { id },
      data: { isDefault: true },
    });
  }
}
