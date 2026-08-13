import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository';
import { CreateDeliveryServiceDto } from './dto/create-delivery-service.dto';
import { UpdateDeliveryServiceDto } from './dto/update-delivery-service.dto';
import { DeliveryServiceQueryDto } from './dto/delivery-service-query.dto';
import { DeliveryServiceRowDto } from './dto/delivery-service-response.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { IPaginatedResult } from '../../shared/pagination';

@Injectable()
export class DeliveryService {
  constructor(private readonly deliveryRepository: DeliveryRepository) {}

  //* find-or-attach: A COMPANY NAME THAT ALREADY EXISTS GETS A NEW ZONE
  //* ATTACHED TO IT INSTEAD OF A DUPLICATE-PROVIDER 409 — THIS IS WHY "KEX
  //* Express" CAN BE SUBMITTED TWICE WITH DIFFERENT AREA/TIME VALUES AND
  //* PRODUCE TWO ROWS UNDER ONE PROVIDER. SEE docs/delivery.md's
  //* "Conventions" SECTION.
  async createExternalDeliveryService(
    userId: number,
    dto: CreateDeliveryServiceDto,
  ): Promise<DeliveryServiceRowDto> {
    const zoneData = {
      areaName: dto.areaName,
      minDeliveryDays: dto.minDeliveryDays,
      maxDeliveryDays: dto.maxDeliveryDays,
      baseFee: dto.baseFee ?? 0,
      codAvailable: dto.codAvailable ?? false,
    };

    const created = await this.deliveryRepository.withTransaction(async (tx) => {
      const existingProvider = await this.deliveryRepository.findProviderByName(
        dto.companyName,
        tx,
      );

      if (existingProvider) {
        //* KEEP THE PROVIDER'S CONTACT INFO IN SYNC WITH WHATEVER WAS JUST
        //* RE-SUBMITTED — THE ADMIN RE-ENTERS THE COMPANY-INFO SECTION OF THE
        //* FORM EVERY TIME, SO SILENTLY IGNORING phone/officeLocation HERE
        //* WOULD BE SURPRISING.
        await this.deliveryRepository.updateProviderContactInfo(
          existingProvider.id,
          {
            phone: dto.phone,
            officeLocation: dto.officeLocation,
            updatedBy: userId,
          },
          tx,
        );
        return await this.deliveryRepository.createZoneForProvider(
          existingProvider.id,
          zoneData,
          tx,
        );
      }

      const slug = generateSlug(dto.companyName);
      const slugConflict = await this.deliveryRepository.findProviderBySlug(
        slug,
        tx,
      );
      if (slugConflict) {
        throw new ConflictException(
          'This company name results in a duplicate provider identifier',
        );
      }

      return await this.deliveryRepository.createProviderWithZone(
        {
          name: dto.companyName,
          slug,
          phone: dto.phone,
          officeLocation: dto.officeLocation,
          createdBy: userId,
          updatedBy: userId,
          zones: { create: [zoneData] },
        },
        tx,
      );
    });

    return new DeliveryServiceRowDto(created);
  }

  async getAllExternalDeliveryServices(
    params: DeliveryServiceQueryDto,
  ): Promise<IPaginatedResult<DeliveryServiceRowDto>> {
    const paginated = await this.deliveryRepository.findAllRows(params);
    return {
      ...paginated,
      data: paginated.data.map((row) => new DeliveryServiceRowDto(row)),
    };
  }

  async updateExternalDeliveryService(
    id: number,
    userId: number,
    dto: UpdateDeliveryServiceDto,
  ): Promise<DeliveryServiceRowDto> {
    const existing = await this.deliveryRepository.findZoneById(id);
    if (!existing) {
      throw new NotFoundException(`External delivery service with ID ${id} not found`);
    }

    //* CROSS-FIELD DAY ORDERING IS CHECKED HERE, NOT IN THE DTO — AN UPDATE
    //* MAY TOUCH ONLY ONE OF THE TWO FIELDS, SO THE COMPARISON HAS TO RUN
    //* AGAINST THE ROW'S EXISTING VALUE FOR WHICHEVER SIDE WASN'T SUBMITTED.
    const effectiveMin = dto.minDeliveryDays ?? existing.minDeliveryDays;
    const effectiveMax = dto.maxDeliveryDays ?? existing.maxDeliveryDays;
    if (effectiveMax < effectiveMin) {
      throw new BadRequestException(
        'Maximum delivery days must be greater than or equal to minimum delivery days',
      );
    }

    const updated = await this.deliveryRepository.withTransaction(async (tx) => {
      //* RENAMING TO A NAME THAT COLLIDES WITH A *DIFFERENT* EXISTING
      //* PROVIDER IS REJECTED RATHER THAN MERGED — MERGING THIS ZONE INTO
      //* THAT OTHER PROVIDER IS A DELIBERATE OUT-OF-SCOPE DECISION FOR THIS
      //* BASIC API. DELETE AND RE-ADD INSTEAD, SAME PHILOSOPHY AS
      //* Support's "delete and re-create instead of re-typing" CONVENTION.
      if (dto.companyName && dto.companyName !== existing.provider.name) {
        const nameConflict = await this.deliveryRepository.findProviderByName(
          dto.companyName,
          tx,
        );
        if (nameConflict && nameConflict.id !== existing.providerId) {
          throw new ConflictException(
            'Another provider already uses this company name — delete and re-add this row instead of renaming into an existing provider',
          );
        }

        const slug = generateSlug(dto.companyName);
        await this.deliveryRepository.renameProvider(
          existing.providerId,
          {
            name: dto.companyName,
            slug,
            phone: dto.phone,
            officeLocation: dto.officeLocation,
            updatedBy: userId,
          },
          tx,
        );
      } else if (dto.phone !== undefined || dto.officeLocation !== undefined) {
        await this.deliveryRepository.updateProviderContactInfo(
          existing.providerId,
          { phone: dto.phone, officeLocation: dto.officeLocation, updatedBy: userId },
          tx,
        );
      }

      return await this.deliveryRepository.updateZone(
        id,
        {
          areaName: dto.areaName,
          minDeliveryDays: dto.minDeliveryDays,
          maxDeliveryDays: dto.maxDeliveryDays,
          baseFee: dto.baseFee,
          codAvailable: dto.codAvailable,
        },
        tx,
      );
    });

    return new DeliveryServiceRowDto(updated);
  }

  async deleteExternalDeliveryService(id: number): Promise<void> {
    const existing = await this.deliveryRepository.findZoneById(id);
    if (!existing) {
      throw new NotFoundException(`External delivery service with ID ${id} not found`);
    }
    //* DELETES ONLY THE ZONE — THE PROVIDER ROW SURVIVES (IT MAY OWN OTHER
    //* ZONES). A PROVIDER LEFT WITH ZERO ZONES SIMPLY STOPS APPEARING IN
    //* THIS TABLE, SINCE THE LISTING IS ZONE-DRIVEN. SEE docs/delivery.md.
    await this.deliveryRepository.deleteZone(id);
  }
}
