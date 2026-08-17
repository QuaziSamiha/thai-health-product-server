import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OTPType } from '../../generated/prisma/enums';

//* ONE TEMPLATE (templates/otp.hbs), ONE COPY BLOCK PER OTPType. THE WORDING IS
//* NOT COSMETIC: A PASSWORD-RESET CODE ARRIVING UNDER "VERIFY YOUR EMAIL" GIVES
//* THE RECIPIENT NO WAY TO TELL A RESET THEY DIDN'T ASK FOR FROM ROUTINE SIGNUP
//* MAIL, WHICH IS EXACTLY THE SIGNAL THEY NEED WHEN SOMEONE IS TRYING TO TAKE
//* THE ACCOUNT OVER. ADDING AN OTPType MEANS ADDING AN ENTRY HERE — THE
//* Record<OTPType, ...> TYPE MAKES A MISSING ONE A COMPILE ERROR, NOT A
//* SILENTLY-WRONG EMAIL.
const OTP_EMAIL_COPY: Record<
  OTPType,
  { subject: string; title: string; intro: string; unsolicited: string }
> = {
  [OTPType.SIGNUP]: {
    subject: 'Verify Your Email - Thai Health Product',
    title: 'Verify Your Email',
    intro:
      'Thank you for choosing Thai Health Product. Use the following One-Time Password (OTP) to complete your verification process:',
    unsolicited: 'If you did not request this code, please ignore this email.',
  },
  [OTPType.PASSWORD_RESET]: {
    subject: 'Reset Your Password - Thai Health Product',
    title: 'Reset Your Password',
    intro:
      'We received a request to reset the password for your Thai Health Product account. Use the following One-Time Password (OTP) to set a new password:',
    unsolicited:
      'If you did not request a password reset, you can safely ignore this email — your password will not change until this code is used.',
  },
  [OTPType.LOGIN_2FA]: {
    subject: 'Your Login Code - Thai Health Product',
    title: 'Confirm Your Login',
    intro:
      'Use the following One-Time Password (OTP) to finish signing in to your Thai Health Product account:',
    unsolicited:
      'If you did not try to sign in, please change your password immediately.',
  },
  [OTPType.PHONE_CHANGE]: {
    subject: 'Confirm Your Phone Number - Thai Health Product',
    title: 'Confirm Your Phone Number',
    intro:
      'Use the following One-Time Password (OTP) to confirm the new phone number on your Thai Health Product account:',
    unsolicited: 'If you did not request this change, please ignore this email.',
  },
};

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  private readonly logger = new Logger(MailService.name);

  async sendOtpEmail(
    email: string,
    otpCode: string,
    type: OTPType = OTPType.SIGNUP,
  ) {
    const copy = OTP_EMAIL_COPY[type] ?? OTP_EMAIL_COPY[OTPType.SIGNUP];

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: copy.subject,
        template: './otp', // Points to templates/otp.hbs
        context: {
          otpCode, // This replaces {{otpCode}} in the Handlebars file
          title: copy.title,
          intro: copy.intro,
          unsolicited: copy.unsolicited,
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
