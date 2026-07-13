import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ComboProductService } from './combo-product.service';
import { CreateComboProductDto } from './dto/create-combo-product.dto';
import { ComboProductResponseDto } from './dto/combo-product-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { UserRole } from '../../generated/prisma/enums';

@ApiTags('Combo Product')
@Controller('combo-product')
export class ComboProductController {
  constructor(private readonly comboProductService: ComboProductService) {}

  @Post('create-combo')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({
    summary: 'Create a new combo product',
    description:
      'Bundles existing products/variants into a time-boxed combo offer at a special price, with an optional gallery of up to 10 images. Admin only.',
  })
  @ApiBody({ type: CreateComboProductDto })
  @ApiCreatedResponse({
    description: 'Combo created successfully.',
    type: ComboProductResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid input data, a variant that does not belong to the given product, or a combo price greater than the sum of its bundled items.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ApiNotFoundResponse({
    description: 'A bundled product or variant does not exist.',
  })
  @ApiConflictResponse({
    description: 'A combo with this title (or resulting slug) already exists.',
  })
  @ResponseMessage('Combo created successfully')
  async createCombo(
    @Body() createComboProductDto: CreateComboProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }

    return this.comboProductService.createComboProduct(
      req.user.id,
      createComboProductDto,
      images ?? [],
    );
  }
}
