import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MailService } from './mail.service';
import { EmailDto } from './dto/email.dto';

@ApiTags('Email')
@Controller('email')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a test email',
    description: 'Sends a simple test email to verify email functionality',
  })
  @ApiBody({
    type: EmailDto,
    description: 'Email address to send test email to',
    examples: {
      example: {
        value: { email: 'quazisamha@gmail.com' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Test email sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Failed to send test email',
  })
  async sendTestEmail(@Body() body: EmailDto) {
    try {
      await this.mailService.sendOtpEmail(body.email, '222222');
      return {
        success: true,
        message: 'Test email sent successfully',
        email: body.email,
      };
    } catch (error: any) {
      //('error', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send OTP by email';
      return {
        success: false,
        message: 'Failed to send test email',
        error: errorMessage,
        email: body.email,
      };
    }
  }
}
