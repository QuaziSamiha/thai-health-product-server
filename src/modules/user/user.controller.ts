import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Ip,
  NotFoundException,
  ForbiddenException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
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
import { sendResponse } from '../../common/responses/send-response';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { PaginationParamsDto } from '../../shared/pagination/dto/pagination-params.dto';
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
  async register(
    @Body() createUserDto: CreateUserDto,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.userService.registerUser(createUserDto, ip);
      sendResponse(res, {
        statusCode: HttpStatus.CREATED,
        success: true,
        message: 'User created successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create user';
      sendResponse(res, {
        statusCode: HttpStatus.BAD_REQUEST,
        success: false,
        message: errorMessage,
      });
    }
  }

  @Get('all-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  async getAllUsers(
    @Query() paginationParams: PaginationParamsDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.userService.getAllUsers(paginationParams);
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Users retrieved successfully',
        data: result.data,
        meta: result.meta, // RESULT: paginated users
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to retrieve users';
      return sendResponse(res, {
        statusCode: HttpStatus.BAD_REQUEST,
        success: false,
        message: errorMessage,
      });
    }
  }

  @Get('my-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get logged in user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getMyProfile(
    @Req() req: Request & { user?: { id: number } },
    @Res() res: Response,
  ) {
    try {
      if (!req.user?.id) {
        throw new NotFoundException('User identity missing from request');
      }

      const result = await this.userService.getMyProfile(req.user.id);
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Profile retrieved successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to retrieve profile';
      return sendResponse(res, {
        statusCode: HttpStatus.BAD_REQUEST,
        success: false,
        message: errorMessage,
      });
    }
  }

  @Patch('update-user-role/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin role required.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.userService.updateUserRole(
        id,
        updateUserRoleDto.role,
      );
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'User role updated successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update user role';
      const status =
        error instanceof NotFoundException
          ? HttpStatus.NOT_FOUND
          : HttpStatus.BAD_REQUEST;

      return sendResponse(res, {
        statusCode: status,
        success: false,
        message: errorMessage,
      });
    }
  }

  @Patch('update-password/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user password' })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  @ApiResponse({ status: 400, description: 'Current password does not match.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. You can only update your own password.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasswordDto: UpdatePasswordDto,
    @Req() req: Request & { user?: { id: number; role?: string } },
    @Res() res: Response,
  ) {
    try {
      if (!req.user?.id) {
        throw new NotFoundException('User identity missing from request');
      }

      if (req.user.id !== id && req.user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You can only update your own password');
      }

      const result = await this.userService.updatePassword(
        id,
        updatePasswordDto,
      );
      return sendResponse(res, {
        statusCode: HttpStatus.OK,
        success: true,
        message: 'Password updated successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update password';
      const status =
        error instanceof NotFoundException
          ? HttpStatus.NOT_FOUND
          : error instanceof ForbiddenException
            ? HttpStatus.FORBIDDEN
            : HttpStatus.BAD_REQUEST;

      return sendResponse(res, {
        statusCode: status,
        success: false,
        message: errorMessage,
      });
    }
  }
}
