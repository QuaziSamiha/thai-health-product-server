import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AddressRepository } from './address.repository';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { formatDisplayName } from '../../common/utils/display-name.util';

@Injectable()
export class AddressService {
  constructor(private readonly addressRepository: AddressRepository) {}

  private assertOwnership(address: { userId: number }, userId: number): void {
    if (address.userId !== userId) {
      throw new ForbiddenException('You can only access your own addresses');
    }
  }

  //* recipientName/phone ARE OPTIONAL ON CreateAddressDto — WHEN OMITTED,
  //* DEFAULT TO THE LOGGED-IN USER'S OWN PROFILE NAME / ACCOUNT PHONE.
  //* recipientName FAILS CLEARLY IF NEITHER THE CLIENT NOR THE PROFILE CAN
  //* SUPPLY ONE. phone HAS NO SUCH GUARD — SOCIAL-LOGIN ACCOUNTS OFTEN HAVE
  //* NO PHONE ON FILE (SEE User.phone IS NULLABLE), AND phone IS ONLY
  //* MANDATORY AT ORDER PLACEMENT (CreateOrderDto.phone), NOT AT
  //* ADDRESS-BOOK SAVE TIME — SO IT'S LEFT undefined RATHER THAN REJECTED.
  private async resolveContactDefaults(
    userId: number,
    dto: CreateAddressDto,
    tx?: Parameters<AddressRepository['findUserContactInfo']>[1],
  ): Promise<{ recipientName: string; phone?: string }> {
    if (dto.recipientName && dto.phone) {
      return { recipientName: dto.recipientName, phone: dto.phone };
    }

    const user = await this.addressRepository.findUserContactInfo(userId, tx);

    const recipientName =
      dto.recipientName ?? formatDisplayName(user?.profile);
    const phone = dto.phone ?? user?.phone ?? undefined;

    if (!recipientName) {
      throw new BadRequestException(
        'Recipient name is required — your profile has no name on file',
      );
    }

    return { recipientName, phone };
  }

  async createAddress(
    userId: number,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressRepository.withTransaction(async (tx) => {
      const { recipientName, phone } = await this.resolveContactDefaults(
        userId,
        dto,
        tx,
      );

      //* THE FIRST ADDRESS A USER SAVES ALWAYS BECOMES THE DEFAULT, EVEN IF
      //* NOT REQUESTED — A USER SHOULD NEVER END UP WITH ZERO DEFAULTS ONCE
      //* THEY HAVE AT LEAST ONE ADDRESS
      const existingCount = await this.addressRepository.countByUserId(
        userId,
        tx,
      );
      const isDefault = existingCount === 0 || !!dto.isDefault;

      if (isDefault) {
        await this.addressRepository.clearDefaultForUser(userId, tx);
      }

      const created = await this.addressRepository.createAddress(
        userId,
        {
          label: dto.label,
          addressLine: dto.addressLine,
          state: dto.state,
          region: dto.region,
          postalCode: dto.postalCode,
          country: dto.country,
          recipientName,
          phone,
          isDefault,
        },
        tx,
      );
      return new AddressResponseDto(created);
    });
  }

  async findAddressesByUserId(userId: number): Promise<AddressResponseDto[]> {
    const addresses = await this.addressRepository.findAllByUserId(userId);
    return addresses.map((address) => new AddressResponseDto(address));
  }

  async getDefaultAddress(userId: number): Promise<AddressResponseDto> {
    const address = await this.addressRepository.findDefaultByUserId(userId);
    if (!address) {
      throw new NotFoundException('No default address found');
    }
    return new AddressResponseDto(address);
  }

  async getAddressById(
    userId: number,
    addressId: number,
  ): Promise<AddressResponseDto> {
    const address = await this.addressRepository.findById(addressId);
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    this.assertOwnership(address, userId);
    return new AddressResponseDto(address);
  }

  async updateAddress(
    userId: number,
    addressId: number,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressRepository.withTransaction(async (tx) => {
      const existing = await this.addressRepository.findById(addressId, tx);
      if (!existing) {
        throw new NotFoundException('Address not found');
      }
      this.assertOwnership(existing, userId);

      if (dto.isDefault) {
        await this.addressRepository.clearDefaultForUser(userId, tx);
      }

      const updated = await this.addressRepository.updateAddress(
        addressId,
        dto,
        tx,
      );
      return new AddressResponseDto(updated);
    });
  }

  async deleteAddress(userId: number, addressId: number): Promise<void> {
    const existing = await this.addressRepository.findById(addressId);
    if (!existing) {
      throw new NotFoundException('Address not found');
    }
    this.assertOwnership(existing, userId);

    //* NO AUTOMATIC PROMOTION OF ANOTHER ADDRESS TO DEFAULT — SEE
    //* docs/address.md "Decisions". DELETING AN ADDRESS BOOK ROW NEVER
    //* TOUCHES PAST ORDERS (OrderAddress IS A FROZEN SNAPSHOT).
    await this.addressRepository.deleteAddress(addressId);
  }

  async setDefaultAddress(
    userId: number,
    addressId: number,
  ): Promise<AddressResponseDto> {
    return this.addressRepository.withTransaction(async (tx) => {
      const existing = await this.addressRepository.findById(addressId, tx);
      if (!existing) {
        throw new NotFoundException('Address not found');
      }
      this.assertOwnership(existing, userId);

      await this.addressRepository.clearDefaultForUser(userId, tx);
      const updated = await this.addressRepository.setDefault(addressId, tx);
      return new AddressResponseDto(updated);
    });
  }
}
