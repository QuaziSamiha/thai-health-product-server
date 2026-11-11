import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PartnerOptionStatus,
  PartnerRequestStatus,
} from '../../generated/prisma/enums';
import { IPaginatedResult } from '../../shared/pagination';
import { PartnerRepository } from './partner.repository';
import {
  CreatePartnerOptionDto,
  PartnerOptionQueryDto,
  UpdatePartnerOptionDto,
} from './dto/partner-option.dto';
import {
  CreatePartnerRequestDto,
  PartnerRequestQueryDto,
} from './dto/partner-request.dto';
import {
  PartnerOptionMinifiedResponseDto,
  PartnerOptionResponseDto,
  PartnerRequestResponseDto,
} from './dto/partner-response.dto';

//* PartnerType AND PartnerCountry FOLLOW IDENTICAL RULES, SO THE BUSINESS LOGIC
//* IS WRITTEN ONCE AGAINST THIS SMALL ADAPTER AND EACH TABLE PLUGS IN ITS OWN
//* REPOSITORY METHODS.
type OptionRow = ConstructorParameters<typeof PartnerOptionResponseDto>[0];
interface OptionOps {
  label: string; //* USED IN ERROR MESSAGES — "Partner type" / "Country"
  findById(id: number): Promise<OptionRow | null>;
  findByName(
    name: string,
  ): Promise<{ id: number; status: PartnerOptionStatus } | null>;
  findAll(params: PartnerOptionQueryDto): Promise<IPaginatedResult<OptionRow>>;
  findActive(): Promise<Array<{ id: number; name: string }>>;
  create(data: {
    name: string;
    status?: PartnerOptionStatus;
    userId: number;
  }): Promise<OptionRow>;
  update(
    id: number,
    data: { name?: string; status?: PartnerOptionStatus; userId: number },
  ): Promise<OptionRow>;
}

@Injectable()
export class PartnerService {
  private readonly typeOps: OptionOps;
  private readonly countryOps: OptionOps;

  constructor(private readonly partnerRepository: PartnerRepository) {
    const repo = this.partnerRepository;
    this.typeOps = {
      label: 'Partner type',
      findById: (id) => repo.findTypeById(id),
      findByName: (name) => repo.findTypeByName(name),
      findAll: (params) => repo.findAllTypes(params),
      findActive: () => repo.findActiveTypes(),
      create: (data) => repo.createType(data),
      update: (id, data) => repo.updateType(id, data),
    };
    this.countryOps = {
      label: 'Country',
      findById: (id) => repo.findCountryById(id),
      findByName: (name) => repo.findCountryByName(name),
      findAll: (params) => repo.findAllCountries(params),
      findActive: () => repo.findActiveCountries(),
      create: (data) => repo.createCountry(data),
      update: (id, data) => repo.updateCountry(id, data),
    };
  }

  // ─── Partner Type ──────────────────────────────────────────────────────────

  createType(userId: number, dto: CreatePartnerOptionDto) {
    return this.createOption(this.typeOps, userId, dto);
  }
  getAllTypes(params: PartnerOptionQueryDto) {
    return this.getAllOptions(this.typeOps, params);
  }
  getActiveTypes() {
    return this.getActiveOptions(this.typeOps);
  }
  getTypeById(id: number) {
    return this.getOptionById(this.typeOps, id);
  }
  updateType(id: number, userId: number, dto: UpdatePartnerOptionDto) {
    return this.updateOption(this.typeOps, id, userId, dto);
  }
  archiveType(id: number, userId: number) {
    return this.archiveOption(this.typeOps, id, userId);
  }

  // ─── Partner Country ───────────────────────────────────────────────────────

  createCountry(userId: number, dto: CreatePartnerOptionDto) {
    return this.createOption(this.countryOps, userId, dto);
  }
  getAllCountries(params: PartnerOptionQueryDto) {
    return this.getAllOptions(this.countryOps, params);
  }
  getActiveCountries() {
    return this.getActiveOptions(this.countryOps);
  }
  getCountryById(id: number) {
    return this.getOptionById(this.countryOps, id);
  }
  updateCountry(id: number, userId: number, dto: UpdatePartnerOptionDto) {
    return this.updateOption(this.countryOps, id, userId, dto);
  }
  archiveCountry(id: number, userId: number) {
    return this.archiveOption(this.countryOps, id, userId);
  }

  // ─── Partner Request ───────────────────────────────────────────────────────

  async createRequest(
    dto: CreatePartnerRequestDto,
  ): Promise<PartnerRequestResponseDto> {
    //* ONLY ACTIVE OPTIONS ARE SELECTABLE — AN INACTIVE/ARCHIVED ID FROM A
    //* STALE FORM IS REJECTED RATHER THAN SILENTLY ACCEPTED.
    const [type, country] = await Promise.all([
      this.partnerRepository.findTypeById(dto.partnerTypeId),
      this.partnerRepository.findCountryById(dto.partnerCountryId),
    ]);
    if (type?.status !== PartnerOptionStatus.ACTIVE) {
      throw new BadRequestException('Please select a valid partner type');
    }
    if (country?.status !== PartnerOptionStatus.ACTIVE) {
      throw new BadRequestException('Please select a valid country');
    }

    const created = await this.partnerRepository.createRequest({
      ...dto,
      message: dto.message || undefined,
    });
    return new PartnerRequestResponseDto(created);
  }

  async getAllRequests(
    params: PartnerRequestQueryDto,
  ): Promise<IPaginatedResult<PartnerRequestResponseDto>> {
    const result = await this.partnerRepository.findAllRequests(params);
    return {
      ...result,
      data: result.data.map((row) => new PartnerRequestResponseDto(row)),
    };
  }

  async getRequestById(id: number): Promise<PartnerRequestResponseDto> {
    const request = await this.partnerRepository.findRequestById(id);
    if (!request) {
      throw new NotFoundException(`Partner request with ID ${id} not found`);
    }
    return new PartnerRequestResponseDto(request);
  }

  async updateRequestStatus(
    id: number,
    status: PartnerRequestStatus,
  ): Promise<PartnerRequestResponseDto> {
    if (status === PartnerRequestStatus.ARCHIVED) {
      throw new BadRequestException(
        'Use the delete endpoint to archive a partner request',
      );
    }
    await this.assertRequestNotArchived(id);
    const updated = await this.partnerRepository.updateRequestStatus(
      id,
      status,
    );
    return new PartnerRequestResponseDto(updated);
  }

  //* SOFT DELETE — ARCHIVED REQUESTS STAY VISIBLE TO ADMINS BUT READ-ONLY
  async archiveRequest(id: number): Promise<PartnerRequestResponseDto> {
    await this.assertRequestNotArchived(id);
    const updated = await this.partnerRepository.updateRequestStatus(
      id,
      PartnerRequestStatus.ARCHIVED,
    );
    return new PartnerRequestResponseDto(updated);
  }

  private async assertRequestNotArchived(id: number) {
    const request = await this.getRequestById(id);
    if (request.status === PartnerRequestStatus.ARCHIVED) {
      throw new ConflictException(
        'This partner request is archived and can no longer be changed',
      );
    }
  }

  // ─── Shared option logic ───────────────────────────────────────────────────

  private async createOption(
    ops: OptionOps,
    userId: number,
    dto: CreatePartnerOptionDto,
  ): Promise<PartnerOptionResponseDto> {
    if (dto.status === PartnerOptionStatus.ARCHIVED) {
      throw new BadRequestException(
        'A new entry cannot be created as ARCHIVED',
      );
    }

    const existing = await ops.findByName(dto.name);
    if (existing && existing.status !== PartnerOptionStatus.ARCHIVED) {
      throw new ConflictException(`${ops.label} "${dto.name}" already exists`);
    }

    //* name IS UNIQUE ACROSS ARCHIVED ROWS TOO, SO RE-ADDING AN ARCHIVED NAME
    //* RESTORES THAT ROW INSTEAD OF FAILING ON THE UNIQUE INDEX.
    const row = existing
      ? await ops.update(existing.id, {
          name: dto.name,
          status: dto.status ?? PartnerOptionStatus.ACTIVE,
          userId,
        })
      : await ops.create({ name: dto.name, status: dto.status, userId });

    return new PartnerOptionResponseDto(row);
  }

  private async getAllOptions(
    ops: OptionOps,
    params: PartnerOptionQueryDto,
  ): Promise<IPaginatedResult<PartnerOptionResponseDto>> {
    const result = await ops.findAll(params);
    return {
      ...result,
      data: result.data.map((row) => new PartnerOptionResponseDto(row)),
    };
  }

  private async getActiveOptions(
    ops: OptionOps,
  ): Promise<PartnerOptionMinifiedResponseDto[]> {
    const rows = await ops.findActive();
    return rows.map((row) => new PartnerOptionMinifiedResponseDto(row));
  }

  private async getOptionById(
    ops: OptionOps,
    id: number,
  ): Promise<PartnerOptionResponseDto> {
    const row = await ops.findById(id);
    if (!row) {
      throw new NotFoundException(`${ops.label} with ID ${id} not found`);
    }
    return new PartnerOptionResponseDto(row);
  }

  private async updateOption(
    ops: OptionOps,
    id: number,
    userId: number,
    dto: UpdatePartnerOptionDto,
  ): Promise<PartnerOptionResponseDto> {
    const existing = await this.getOptionById(ops, id);
    if (existing.status === PartnerOptionStatus.ARCHIVED) {
      throw new ConflictException(
        `${ops.label} is archived and can no longer be changed`,
      );
    }
    if (dto.status === PartnerOptionStatus.ARCHIVED) {
      throw new BadRequestException(
        `Use the delete endpoint to archive a ${ops.label.toLowerCase()}`,
      );
    }

    if (dto.name) {
      const sameName = await ops.findByName(dto.name);
      if (sameName && sameName.id !== id) {
        throw new ConflictException(
          `${ops.label} "${dto.name}" already exists`,
        );
      }
    }

    const row = await ops.update(id, { ...dto, userId });
    return new PartnerOptionResponseDto(row);
  }

  //* SOFT DELETE — ROWS ARE NEVER HARD-DELETED BECAUSE PartnerRequest HOLDS A
  //* RESTRICT FK TO THEM AND OLD REQUESTS MUST KEEP SHOWING THEIR TYPE/COUNTRY.
  private async archiveOption(
    ops: OptionOps,
    id: number,
    userId: number,
  ): Promise<PartnerOptionResponseDto> {
    const existing = await this.getOptionById(ops, id);
    if (existing.status === PartnerOptionStatus.ARCHIVED) {
      throw new ConflictException(`${ops.label} is already archived`);
    }
    const row = await ops.update(id, {
      status: PartnerOptionStatus.ARCHIVED,
      userId,
    });
    return new PartnerOptionResponseDto(row);
  }
}
