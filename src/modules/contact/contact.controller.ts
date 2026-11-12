import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/auth/roles.decorator';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';
import { THROTTLER_SHORT } from '../../common/throttler/throttler.constants';
import { UserRole } from '../../generated/prisma/enums';
import { ContactService } from './contact.service';
import {
  ContactMessageQueryDto,
  CreateContactMessageDto,
  UpdateContactInfoDto,
} from './dto/contact.dto';

//* PUBLIC, UNAUTHENTICATED FORM — CAP SUBMISSIONS PER IP SO A BOT CAN'T FLOOD
//* THE ADMIN INBOX.
const CONTACT_MESSAGE_THROTTLE = { limit: 5, ttl: 3_600_000 };

type AuthedRequest = Request & { user?: { id: number } };

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // ─── Contact Info ──────────────────────────────────────────────────────────

  @Get('info')
  @ApiOperation({ summary: 'Get contact page information (Public)' })
  @ResponseMessage('Contact information retrieved successfully')
  async getInfo() {
    return this.contactService.getInfo();
  }

  @Patch('info')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update contact page information',
    description: 'Creates the record on first save. Admin only.',
  })
  @ApiBody({ type: UpdateContactInfoDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Contact information updated successfully')
  async updateInfo(
    @Body() dto: UpdateContactInfoDto,
    @Req() req: AuthedRequest,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User identity missing from request');
    }
    return this.contactService.updateInfo(req.user.id, dto);
  }

  // ─── Contact Message ───────────────────────────────────────────────────────

  @Post('message')
  @Throttle({ [THROTTLER_SHORT]: CONTACT_MESSAGE_THROTTLE })
  @ApiOperation({ summary: 'Send a contact message (Public)' })
  @ApiBody({ type: CreateContactMessageDto })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiTooManyRequestsResponse({ description: 'Too many submissions.' })
  @ResponseMessage('Your message has been sent successfully')
  async sendMessage(@Body() dto: CreateContactMessageDto) {
    return this.contactService.createMessage(dto);
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all contact messages (paginated)',
    description:
      'Searchable by name / email / phone / message; filter with `?isRead=`. Admin only.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'Admin role required.' })
  @ResponseMessage('Contact messages retrieved successfully')
  async getAllMessages(@Query() query: ContactMessageQueryDto) {
    return this.contactService.getAllMessages(query);
  }

  @Get('message/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a contact message by ID (marks it read). Admin only.',
  })
  @ApiNotFoundResponse({ description: 'Contact message not found.' })
  @ResponseMessage('Contact message retrieved successfully')
  async getMessageById(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.getMessageById(id);
  }

  @Patch('message/:id/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a contact message as read. Admin only.' })
  @ApiNotFoundResponse({ description: 'Contact message not found.' })
  @ResponseMessage('Contact message marked as read')
  async markMessageRead(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.markMessageRead(id);
  }

  @Delete('message/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Permanently delete a contact message. Admin only.',
  })
  @ApiNotFoundResponse({ description: 'Contact message not found.' })
  @ResponseMessage('Contact message deleted successfully')
  async deleteMessage(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.deleteMessage(id);
  }
}
