import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Address')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  private requireUserId(req: Request & { user?: { id: number } }): number {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return req.user.id;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new address',
    description:
      "Adds a delivery address to the logged-in customer's address book. The first address a customer saves always becomes the default.",
  })
  @ApiCreatedResponse({
    description: 'Address created successfully.',
    type: AddressResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ResponseMessage('Address created successfully')
  async createAddress(
    @Body() createAddressDto: CreateAddressDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    const userId = this.requireUserId(req);
    return this.addressService.createAddress(userId, createAddressDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List my addresses',
    description:
      "Returns every address in the logged-in customer's address book, default first, then newest.",
  })
  @ApiOkResponse({
    description: 'Addresses retrieved successfully.',
    type: [AddressResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ResponseMessage('Addresses retrieved successfully')
  async getAddresses(@Req() req: Request & { user?: { id: number } }) {
    const userId = this.requireUserId(req);
    return this.addressService.findAddressesByUserId(userId);
  }

  @Get('default')
  @ApiOperation({
    summary: 'Get my default address',
    description:
      "Returns the logged-in customer's default address, for checkout auto-fill.",
  })
  @ApiOkResponse({
    description: 'Default address retrieved successfully.',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiNotFoundResponse({ description: 'No default address found.' })
  @ResponseMessage('Default address retrieved successfully')
  async getDefaultAddress(@Req() req: Request & { user?: { id: number } }) {
    const userId = this.requireUserId(req);
    return this.addressService.getDefaultAddress(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my addresses by id' })
  @ApiOkResponse({
    description: 'Address retrieved successfully.',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Address belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Address not found.' })
  @ResponseMessage('Address retrieved successfully')
  async getAddressById(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user?: { id: number } },
  ) {
    const userId = this.requireUserId(req);
    return this.addressService.getAddressById(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my addresses' })
  @ApiOkResponse({
    description: 'Address updated successfully.',
    type: AddressResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Address belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Address not found.' })
  @ResponseMessage('Address updated successfully')
  async updateAddress(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAddressDto: UpdateAddressDto,
    @Req() req: Request & { user?: { id: number } },
  ) {
    const userId = this.requireUserId(req);
    return this.addressService.updateAddress(userId, id, updateAddressDto);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Mark one of my addresses as the default' })
  @ApiOkResponse({
    description: 'Default address updated successfully.',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Address belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Address not found.' })
  @ResponseMessage('Default address updated successfully')
  async setDefaultAddress(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user?: { id: number } },
  ) {
    const userId = this.requireUserId(req);
    return this.addressService.setDefaultAddress(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of my addresses' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Address belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Address not found.' })
  @ResponseMessage('Address deleted successfully')
  async deleteAddress(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user?: { id: number } },
  ) {
    const userId = this.requireUserId(req);
    return this.addressService.deleteAddress(userId, id);
  }
}
