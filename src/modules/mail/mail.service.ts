import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  private readonly logger = new Logger(MailService.name);

  async sendOtpEmail(email: string, otpCode: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify Your Email - Essence Lab',
        template: './otp', // Points to templates/otp.hbs
        context: {
          otpCode, // This replaces {{otp}} in the Handlebars file
        },
      });
      return true;
    } catch (error: unknown) {
      const err = error as {
        code?: string;
        response?: string;
        message?: string;
      };
      if (err?.code === 'EAUTH') {
        this.logger.error(
          `SMTP authentication failed (${err.response || err.message || 'Unknown error'}). Check MAIL_USERNAME/MAIL_PASSWORD.`,
        );
      } else {
        this.logger.error(
          `Email sending failed: ${err?.message || 'Unknown error'}`,
        );
      }
      return false;
    }
  }
}
