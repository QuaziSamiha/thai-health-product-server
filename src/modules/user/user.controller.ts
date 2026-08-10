import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  NotFoundException,
  ForbiddenException,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import {
  PaginationQueryDto,
  ApiPaginatedResponse,
} from '../../shared/pagination';
import { UserResponseDtoWithDetails } from './dto/user-response.dto';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('Users')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('create-user')
  @ApiConsumes('application/json')
  @ApiOperation({
    summary:
      'Create a new user / User Registration / Sign Up by email password',
  })
  @ApiCreatedResponse({
    description: 'User created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiBody({ type: CreateUserDto })
  @ResponseMessage('User created successfully')
  async register(@Body() createUserDto: CreateUserDto, @Ip() ip: string) {
    return this.userService.registerUser(createUserDto, ip);
  }

  @Get('all-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiPaginatedResponse(
    UserResponseDtoWithDetails,
    'Users retrieved successfully.',
  )
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  @ResponseMessage('Users retrieved successfully')
  async getAllUsers(@Query() paginationParams: PaginationQueryDto) {
    return this.userService.getAllUsers(paginationParams);
  }

  @Get('my-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get logged in user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ResponseMessage('Profile retrieved successfully')
  async getMyProfile(@Req() req: Request & { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new NotFoundException('User identity missing from request');
    }
    return this.userService.getMyProfile(req.user.id);
  }

  @Patch('update-profile/:id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Update profile (first name, last name, phone, avatar)',
    description:
      'Partially updates the caller\'s own profile. Uploading a new avatar replaces the old one. Admins may also update any user\'s profile.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. You can only update your own profile.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ResponseMessage('Profile updated successfully')
  async updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
    @UploadedFile() avatar: Express.Multer.File | undefined,
    @Req() req: Request & { user?: { id: number; role?: string } },
  ) {
    if (!req.user?.id) {
      throw new NotFoundException('User identity missing from request');
    }

    if (req.user.id !== id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.userService.updateProfile(id, updateProfileDto, avatar);
  }

  @Patch('update-user-role/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ResponseMessage('User role updated successfully')
  async updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
  ) {
    return this.userService.updateUserRole(id, updateUserRoleDto.role);
  }

  @Delete('deactivate-user/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Deactivate a user (Admin only)',
    description:
      'Soft-deletes a user by setting status to DEACTIVATED. Reversible -- the row, its orders, and its audit references (createdBy/updatedBy) stay intact.',
  })
  @ApiResponse({ status: 200, description: 'User deactivated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'User is already deactivated.' })
  @ResponseMessage('User deactivated successfully')
  async deactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.userService.deactivateUser(id);
  }

  @Patch('update-password/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user password' })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  @ApiResponse({
    status: 400,
    description:
      'Current password does not match, or new password is the same as the current password.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. You can only update your own password.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ResponseMessage('Password updated successfully')
  async updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasswordDto: UpdatePasswordDto,
    @Req() req: Request & { user?: { id: number; role?: string } },
  ) {
    if (!req.user?.id) {
      throw new NotFoundException('User identity missing from request');
    }

    if (req.user.id !== id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own password');
    }

    return this.userService.updatePassword(id, updatePasswordDto);
  }
}
