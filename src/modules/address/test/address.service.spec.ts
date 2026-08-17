import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AddressService } from '../address.service';
import { AddressRepository } from '../address.repository';
import { CreateAddressDto } from '../dto/create-address.dto';
import { AddressType } from '../../../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAddress = (overrides: Record<string, unknown> = {}) => ({
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
  userId: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAddressRepository = () => ({
  findById: jest.fn(),
  findAllByUserId: jest.fn(),
  findDefaultByUserId: jest.fn(),
  countByUserId: jest.fn(),
  findUserContactInfo: jest.fn(),
  createAddress: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
  clearDefaultForUser: jest.fn(),
  setDefault: jest.fn(),
  withTransaction: jest.fn((fn: (tx: unknown) => unknown) => fn(undefined)),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AddressService', () => {
  let service: AddressService;
  let repo: ReturnType<typeof mockAddressRepository>;

  beforeEach(async () => {
    repo = mockAddressRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressService,
        { provide: AddressRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<AddressService>(AddressService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // createAddress
  // =========================================================================

  describe('createAddress', () => {
    const userId = 1;
    const dto: CreateAddressDto = {
      recipientName: 'Somchai Jaidee',
      phone: '0812345678',
      addressLine: '123/45 Sukhumvit Road',
      state: 'Bangkok',
      region: 'Watthana',
      postalCode: '10110',
    };

    it('makes the first address the default even when isDefault is not set', async () => {
      repo.countByUserId.mockResolvedValue(0);
      repo.createAddress.mockResolvedValue(makeAddress({ isDefault: true }));

      const result = await service.createAddress(userId, dto);

      expect(repo.clearDefaultForUser).toHaveBeenCalledWith(userId, undefined);
      expect(repo.createAddress).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ isDefault: true }),
        undefined,
      );
      expect(result.isDefault).toBe(true);
    });

    it('does not force a default when the user already has addresses and isDefault is not requested', async () => {
      repo.countByUserId.mockResolvedValue(2);
      repo.createAddress.mockResolvedValue(makeAddress({ isDefault: false }));

      await service.createAddress(userId, dto);

      expect(repo.clearDefaultForUser).not.toHaveBeenCalled();
      expect(repo.createAddress).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ isDefault: false }),
        undefined,
      );
    });

    it('clears existing defaults when isDefault is explicitly requested', async () => {
      repo.countByUserId.mockResolvedValue(2);
      repo.createAddress.mockResolvedValue(makeAddress({ isDefault: true }));

      await service.createAddress(userId, { ...dto, isDefault: true });

      expect(repo.clearDefaultForUser).toHaveBeenCalledWith(userId, undefined);
    });

    // -----------------------------------------------------------------------
    // recipientName/phone fallback to the user's own profile/account
    // -----------------------------------------------------------------------

    it('does not look up the user profile when recipientName and phone are both provided', async () => {
      repo.countByUserId.mockResolvedValue(1);
      repo.createAddress.mockResolvedValue(makeAddress());

      await service.createAddress(userId, dto);

      expect(repo.findUserContactInfo).not.toHaveBeenCalled();
      expect(repo.createAddress).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          recipientName: 'Somchai Jaidee',
          phone: '0812345678',
        }),
        undefined,
      );
    });

    const addressFieldsOnly: CreateAddressDto = {
      addressLine: dto.addressLine,
      state: dto.state,
      region: dto.region,
      postalCode: dto.postalCode,
    };

    it('defaults recipientName to firstName + lastName and phone to the account phone when omitted', async () => {
      repo.countByUserId.mockResolvedValue(1);
      repo.findUserContactInfo.mockResolvedValue({
        phone: '+66899999999',
        profile: { firstName: 'First', lastName: 'Last' },
      });
      repo.createAddress.mockResolvedValue(makeAddress());

      await service.createAddress(userId, addressFieldsOnly);

      expect(repo.createAddress).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          recipientName: 'First Last',
          phone: '+66899999999',
        }),
        undefined,
      );
    });

    it('throws BadRequestException when recipientName is omitted and the user has no profile', async () => {
      repo.countByUserId.mockResolvedValue(1);
      repo.findUserContactInfo.mockResolvedValue({
        phone: '+66899999999',
        profile: null,
      });

      await expect(
        service.createAddress(userId, addressFieldsOnly),
      ).rejects.toThrow(BadRequestException);
      expect(repo.createAddress).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when phone is omitted and the account has no phone on file', async () => {
      repo.countByUserId.mockResolvedValue(1);
      repo.findUserContactInfo.mockResolvedValue({
        phone: null,
        profile: { firstName: 'First', lastName: null },
      });

      await expect(
        service.createAddress(userId, addressFieldsOnly),
      ).rejects.toThrow(BadRequestException);
      expect(repo.createAddress).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // findAddressesByUserId
  // =========================================================================

  describe('findAddressesByUserId', () => {
    it('returns all addresses for a user as DTOs', async () => {
      repo.findAllByUserId.mockResolvedValue([
        makeAddress({ isDefault: true }),
        makeAddress({ id: 2, isDefault: false }),
      ]);

      const result = await service.findAddressesByUserId(1);

      expect(result).toHaveLength(2);
      expect(result[0].isDefault).toBe(true);
    });

    it('returns an empty array when the user has no addresses', async () => {
      repo.findAllByUserId.mockResolvedValue([]);

      const result = await service.findAddressesByUserId(1);

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getDefaultAddress
  // =========================================================================

  describe('getDefaultAddress', () => {
    it('returns the default address', async () => {
      repo.findDefaultByUserId.mockResolvedValue(
        makeAddress({ isDefault: true }),
      );

      const result = await service.getDefaultAddress(1);

      expect(result.isDefault).toBe(true);
    });

    it('throws NotFoundException when no default address exists', async () => {
      repo.findDefaultByUserId.mockResolvedValue(null);

      await expect(service.getDefaultAddress(1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getAddressById
  // =========================================================================

  describe('getAddressById', () => {
    it('returns the address when it belongs to the caller', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 1 }));

      const result = await service.getAddressById(1, 1);

      expect(result.id).toBe(1);
    });

    it('throws NotFoundException when the address does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.getAddressById(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the address belongs to another user', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 2 }));

      await expect(service.getAddressById(1, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // updateAddress
  // =========================================================================

  describe('updateAddress', () => {
    it('throws NotFoundException when the address does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateAddress(1, 99, { recipientName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the address belongs to another user', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 2 }));

      await expect(
        service.updateAddress(1, 1, { recipientName: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('clears other defaults when isDefault is set to true', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 1 }));
      repo.updateAddress.mockResolvedValue(makeAddress({ isDefault: true }));

      await service.updateAddress(1, 1, { isDefault: true });

      expect(repo.clearDefaultForUser).toHaveBeenCalledWith(1, undefined);
    });

    it('does not touch other defaults when isDefault is not part of the update', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 1 }));
      repo.updateAddress.mockResolvedValue(makeAddress());

      await service.updateAddress(1, 1, { recipientName: 'New Name' });

      expect(repo.clearDefaultForUser).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // deleteAddress
  // =========================================================================

  describe('deleteAddress', () => {
    it('deletes the address when it belongs to the caller', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 1 }));

      await service.deleteAddress(1, 1);

      expect(repo.deleteAddress).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when the address does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.deleteAddress(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the address belongs to another user', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 2 }));

      await expect(service.deleteAddress(1, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // setDefaultAddress
  // =========================================================================

  describe('setDefaultAddress', () => {
    it('clears other defaults then sets the requested one', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 1 }));
      repo.setDefault.mockResolvedValue(makeAddress({ isDefault: true }));

      const result = await service.setDefaultAddress(1, 1);

      expect(repo.clearDefaultForUser).toHaveBeenCalledWith(1, undefined);
      expect(repo.setDefault).toHaveBeenCalledWith(1, undefined);
      expect(result.isDefault).toBe(true);
    });

    it('throws NotFoundException when the address does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.setDefaultAddress(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the address belongs to another user', async () => {
      repo.findById.mockResolvedValue(makeAddress({ userId: 2 }));

      await expect(service.setDefaultAddress(1, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
