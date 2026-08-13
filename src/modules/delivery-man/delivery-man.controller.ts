import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DeliveryManService } from './delivery-man.service';
import { CreateDeliveryManDto } from './dto/create-delivery-man.dto';
import { UpdateDeliveryManDto } from './dto/update-delivery-man.dto';
import { DeliveryManResponseDto } from './dto/delivery-man-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import {
  PaginationQueryDto,
  ApiPaginatedResponse,
} from '../../shared/pagination';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

const UPLOAD_FIELDS = FileFieldsInterceptor([
  { name: 'avatar', maxCount: 1 },
  { name: 'nidDocument', maxCount: 1 },
]);

@ApiTags('Delivery Man')
@Controller('delivery-man')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class DeliveryManController {
  constructor(private readonly deliveryManService: DeliveryManService) {}

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(UPLOAD_FIELDS)
  @ApiOperation({
    summary: 'Onboard a new delivery man (Admin only)',
    description:
      'Creates a User (role = DELIVERY_PARTNER, no password — admin-managed directory, not self-service signup) together with its Profile and DeliveryManProfile extension.',
  })
  @ApiBody({ type: CreateDeliveryManDto })
  @ApiResponse({ status: 201, description: 'Delivery man created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  @ResponseMessage('Delivery man created successfully')
  async create(
    @Body() dto: CreateDeliveryManDto,
    @UploadedFiles()
    files: {
      avatar?: Express.Multer.File[];
      nidDocument?: Express.Multer.File[];
    },
  ): Promise<DeliveryManResponseDto> {
    return this.deliveryManService.createDeliveryMan(
      dto,
      files?.avatar?.[0],
      files?.nidDocument?.[0],
    );
  }

  @Get('all')
  @ApiOperation({ summary: 'List all delivery men (Admin only)' })
  @ApiPaginatedResponse(
    DeliveryManResponseDto,
    'Delivery men retrieved successfully.',
  )
  @ResponseMessage('Delivery men retrieved successfully')
  async findAll(@Query() paginationParams: PaginationQueryDto) {
    return this.deliveryManService.getAllDeliveryMen(paginationParams);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery man by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Delivery man retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Delivery man not found.' })
  @ResponseMessage('Delivery man retrieved successfully')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeliveryManResponseDto> {
    return this.deliveryManService.getDeliveryManById(id);
  }

  @Patch('update/:id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(UPLOAD_FIELDS)
  @ApiOperation({
    summary: 'Update a delivery man (Admin only)',
    description:
      'Partial update covering both identity fields (name/phone/avatar) and delivery-specific fields (vehicle, coverage, employment, NID). Resubmitting nidNumber or a new NID document resets nidVerificationStatus back to PENDING.',
  })
  @ApiBody({ type: UpdateDeliveryManDto })
  @ApiResponse({ status: 200, description: 'Delivery man updated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 404, description: 'Delivery man not found.' })
  @ResponseMessage('Delivery man updated successfully')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryManDto,
    @UploadedFiles()
    files: {
      avatar?: Express.Multer.File[];
      nidDocument?: Express.Multer.File[];
    },
  ): Promise<DeliveryManResponseDto> {
    return this.deliveryManService.updateDeliveryMan(
      id,
      dto,
      files?.avatar?.[0],
      files?.nidDocument?.[0],
    );
  }
}
