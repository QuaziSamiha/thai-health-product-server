import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AddressController } from '../address.controller';
import { AddressService } from '../address.service';
import { AddressResponseDto } from '../dto/address-response.dto';
import { AddressType } from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAddressDto = (
  overrides: Partial<AddressResponseDto> = {},
): AddressResponseDto =>
  ({
    id: 1,
    sid: 'uuid-111',
    label: 'Home',
    type: AddressType.SHIPPING,
    isDefault: false,
    recipientName: 'Somchai Jaidee',
    phone: '+66812345678',
    addressLine: '123/45 Sukhumvit Road',
    state: 'Bangkok',
    region: 'Watthana',
    postalCode: '10110',
    country: 'Thailand',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }) as AddressResponseDto;

/** Creates a minimal authenticated request object. */
const makeAuthReq = (userId = 1) =>
  ({ user: { id: userId } }) as import('express').Request & {
    user: { id: number };
  };

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockAddressService = () => ({
  createAddress: jest.fn(),
  findAddressesByUserId: jest.fn(),
  getDefaultAddress: jest.fn(),
  getAddressById: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
  setDefaultAddress: jest.fn(),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
//
// The controller just returns data or throws — the global ResponseInterceptor
// / GlobalExceptionFilter take care of the envelope. So these tests assert on
// the resolved/rejected value of the controller method directly.

describe('AddressController', () => {
  let controller: AddressController;
  let service: ReturnType<typeof mockAddressService>;

  beforeEach(async () => {
    service = mockAddressService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressController],
      providers: [{ provide: AddressService, useValue: service }],
    }).compile();

    controller = module.get<AddressController>(AddressController);
  });

  afterEach(() => jest.clearAllMocks());

  const unauthedReq = {
    user: undefined,
  } as unknown as import('express').Request & {
    user?: { id: number };
  };

  // =========================================================================
  // createAddress
  // =========================================================================

  describe('createAddress', () => {
    it('returns the created address on success', async () => {
      const dto = makeAddressDto();
      service.createAddress.mockResolvedValue(dto);

      const result = await controller.createAddress(
        {
          recipientName: 'Somchai Jaidee',
          phone: '0812345678',
          addressLine: '123/45 Sukhumvit Road',
          state: 'Bangkok',
          region: 'Watthana',
          postalCode: '10110',
        },
        makeAuthReq(),
      );

      expect(result).toEqual(dto);
    });

    it('throws UnauthorizedException when user identity is missing', async () => {
      await expect(
        controller.createAddress({} as never, unauthedReq),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // getAddresses
  // =========================================================================

  describe('getAddresses', () => {
    it('returns the address list for the caller', async () => {
      const addresses = [makeAddressDto(), makeAddressDto({ id: 2 })];
      service.findAddressesByUserId.mockResolvedValue(addresses);

      const result = await controller.getAddresses(makeAuthReq());

      expect(result).toEqual(addresses);
      expect(service.findAddressesByUserId).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // getDefaultAddress
  // =========================================================================

  describe('getDefaultAddress', () => {
    it('returns the default address', async () => {
      const dto = makeAddressDto({ isDefault: true });
      service.getDefaultAddress.mockResolvedValue(dto);

      const result = await controller.getDefaultAddress(makeAuthReq());

      expect(result).toEqual(dto);
    });

    it('propagates NotFoundException when there is no default', async () => {
      service.getDefaultAddress.mockRejectedValue(
        new NotFoundException('No default address found'),
      );

      await expect(controller.getDefaultAddress(makeAuthReq())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getAddressById
  // =========================================================================

  describe('getAddressById', () => {
    it('returns the address on success', async () => {
      const dto = makeAddressDto();
      service.getAddressById.mockResolvedValue(dto);

      const result = await controller.getAddressById(1, makeAuthReq());

      expect(result).toEqual(dto);
    });

    it('propagates ForbiddenException from the service', async () => {
      service.getAddressById.mockRejectedValue(
        new ForbiddenException('You can only access your own addresses'),
      );

      await expect(controller.getAddressById(1, makeAuthReq())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // updateAddress
  // =========================================================================

  describe('updateAddress', () => {
    it('returns the updated address on success', async () => {
      const updated = makeAddressDto({ recipientName: 'New Name' });
      service.updateAddress.mockResolvedValue(updated);

      const result = await controller.updateAddress(
        1,
        { recipientName: 'New Name' },
        makeAuthReq(),
      );

      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from the service', async () => {
      service.updateAddress.mockRejectedValue(
        new NotFoundException('Address not found'),
      );

      await expect(
        controller.updateAddress(1, {}, makeAuthReq()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // setDefaultAddress
  // =========================================================================

  describe('setDefaultAddress', () => {
    it('returns the updated address on success', async () => {
      const updated = makeAddressDto({ isDefault: true });
      service.setDefaultAddress.mockResolvedValue(updated);

      const result = await controller.setDefaultAddress(1, makeAuthReq());

      expect(result).toEqual(updated);
    });

    it('propagates ForbiddenException from the service', async () => {
      service.setDefaultAddress.mockRejectedValue(
        new ForbiddenException('You can only access your own addresses'),
      );

      await expect(
        controller.setDefaultAddress(1, makeAuthReq()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // deleteAddress
  // =========================================================================

  describe('deleteAddress', () => {
    it('deletes the address on success', async () => {
      service.deleteAddress.mockResolvedValue(undefined);

      await controller.deleteAddress(1, makeAuthReq());

      expect(service.deleteAddress).toHaveBeenCalledWith(1, 1);
    });

    it('propagates NotFoundException from the service', async () => {
      service.deleteAddress.mockRejectedValue(
        new NotFoundException('Address not found'),
      );

      await expect(controller.deleteAddress(1, makeAuthReq())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
