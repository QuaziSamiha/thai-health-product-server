import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HomeRepository } from './home.repository';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomeQueryDto } from './dto/home-query.dto';
import {
  HomeResponseDto,
  HomeResponsePublicDto,
} from './dto/home-response.dto';
import { STORAGE_SERVICE_TOKEN } from '../../shared/storage/storage.constants';
import type { IStorageService } from '../../shared/storage/interfaces/storage.interface';
import { IPaginatedResult } from '../../shared/pagination';
import { HomeContentType } from '../../generated/prisma/enums';

const HOME_IMAGE_FOLDER = 'home/images';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly homeRepository: HomeRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
  ) {}

  async createHome(
    userId: number,
    createHomeDto: CreateHomeDto,
    image?: Express.Multer.File,
  ): Promise<HomeResponseDto> {
    //* imageUrl IS NOT NULL AT THE DB LAYER — ENFORCE IT HERE SINCE MULTER
    //* FILES AREN'T RUN THROUGH class-validator
    if (!image) {
      throw new BadRequestException('An image is required');
    }

    const {
      type,
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
      displayOrder,
    } = createHomeDto;

    const imagePath = await this.uploadFile(image, HOME_IMAGE_FOLDER);

    try {
      const newHome = await this.homeRepository.createHome({
        type,
        status,
        heading,
        bodyText,
        headingTh,
        bodyTextTh,
        videoUrl,
        redirectUrl,
        displayOrder,
        imageUrl: imagePath,
        createdBy: userId,
      });

      return new HomeResponseDto(
        newHome,
        this.configService.get<string>('app.baseUrl'),
      );
    } catch (error) {
      await this.deleteFile(imagePath, HOME_IMAGE_FOLDER);
      throw error;
    }
  }

  async getAllHomeContents(
    params: HomeQueryDto,
  ): Promise<IPaginatedResult<HomeResponseDto>> {
    const { type, ...paginationParams } = params;
    const paginatedHomeContents = await this.homeRepository.findAllAdmin(
      paginationParams,
      type,
    );

    return {
      ...paginatedHomeContents,
      data: paginatedHomeContents.data.map(
        (home) =>
          new HomeResponseDto(
            home,
            this.configService.get<string>('app.baseUrl'),
          ),
      ),
    };
  }

  async getActiveHomeContentsByType(
    type: HomeContentType,
  ): Promise<HomeResponsePublicDto[]> {
    const homeContents = await this.homeRepository.findActiveByType(type);
    const baseUrl = this.configService.get<string>('app.baseUrl');
    return homeContents.map((home) => new HomeResponsePublicDto(home, baseUrl));
  }

  async updateHome(
    id: number,
    updateHomeDto: UpdateHomeDto,
    image?: Express.Multer.File,
  ): Promise<HomeResponseDto> {
    const home = await this.homeRepository.findByIdAdmin(id);
    if (!home) {
      throw new NotFoundException(`Home content with ID ${id} not found`);
    }

    const {
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
      displayOrder,
    } = updateHomeDto;
    const updateData: {
      status?: UpdateHomeDto['status'];
      heading?: string;
      bodyText?: string;
      headingTh?: string;
      bodyTextTh?: string;
      videoUrl?: string;
      redirectUrl?: string;
      displayOrder?: number;
      imageUrl?: string;
    } = {
      status,
      heading,
      bodyText,
      headingTh,
      bodyTextTh,
      videoUrl,
      redirectUrl,
      displayOrder,
    };

    if (image) {
      updateData.imageUrl = await this.uploadFile(image, HOME_IMAGE_FOLDER);
      if (home.imageUrl) {
        await this.deleteFile(home.imageUrl, HOME_IMAGE_FOLDER);
      }
    }

    const updatedHome = await this.homeRepository.updateHome(id, updateData);
    return new HomeResponseDto(
      updatedHome,
      this.configService.get<string>('app.baseUrl'),
    );
  }

  async deleteHome(id: number): Promise<void> {
    const home = await this.homeRepository.findByIdAdmin(id);
    if (!home) {
      throw new NotFoundException(`Home content with ID ${id} not found`);
    }
    await this.homeRepository.deleteHome(id);
    if (home.imageUrl) {
      await this.deleteFile(home.imageUrl, HOME_IMAGE_FOLDER);
    }
  }

  private async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const savedFile = await this.storageService.saveFile(file, folder);
    return savedFile.path;
  }

  private async deleteFile(path: string, folder: string): Promise<void> {
    const filename = path.split('/').pop();
    if (!filename) {
      return;
    }
    await this.storageService
      .deleteFile(filename, folder)
      .catch((e) =>
        this.logger.warn(`Could not delete home content image: ${e}`),
      );
  }
}
