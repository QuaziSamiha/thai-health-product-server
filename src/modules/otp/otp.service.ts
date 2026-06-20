import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
import { OtpRepository } from './otp.repository';
import { OTPType } from '../../generated/prisma/enums';
import { HashService } from '../../shared/hash/hash.service';
import * as crypto from 'crypto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UserService } from '../user/user.service';
import { VerifyOtpResponseDto } from './dto/verify-otp-response.dto';
import { Prisma } from '../../generated/prisma/client';
// import { MailService } from '../mail/mail.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly otpRepo: OtpRepository,
    // private readonly mailService: MailService,
    // private readonly configService: ConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly hashService: HashService,
  ) {}

  // * Generates a secure 6-digit OTP, hashes it for the DB, and sends the plain code via email.
  async generateAndSendOtp(
    identifier: string,
    type: OTPType,
    userId?: number,
    tx?: Prisma.TransactionClient,
  ) {
    try {
      // * Generate a cryptographically secure 6-digit number (100000 - 999999)
      const plainOtp = crypto.randomInt(100000, 999999).toString();

      this.logger.debug(`[DEV MODE] OTP for ${identifier}: ${plainOtp}`);

      // * Hash the OTP before saving
      const hashedOtp = await this.hashService.hash(plainOtp);

      // * Set expiration (e.g., 10 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // * Save to Database
      await this.otpRepo.createOTP(
        {
          code: hashedOtp,
          type,
          identifier,
          userId,
          expiresAt,
        },
        tx,
      );

      // * Send the plain code to the user's email.
      // In development, we allow console-only OTP flow as a fallback.
      // const isMailSent = await this.mailService.sendOtpEmail(
      //   identifier,
      //   plainOtp,
      // );
      // const isDev =
      //   this.configService.get<string>('NODE_ENV') === 'development';
      // if (!isMailSent && !isDev) {
      //   throw new InternalServerErrorException('Failed to send OTP email');
      // }

      return new VerifyOtpResponseDto({
        success: true,
        message: `OTP sent to ${identifier}`,
      });
    } catch (error) {
      this.logger.error('OTP Generation Error', error);
      throw new InternalServerErrorException('Failed to process OTP request');
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { identifier, type, code } = dto;

    const user = await this.userService.getUserByEmail(identifier);

    if (!user) {
      throw new NotFoundException(
        `No account found with identifier: ${identifier}`,
      );
    }

    // * Find the latest valid (unused & not expired) OTP for this user/type
    const otpRecord = await this.otpRepo.findLatestValidOtp(identifier, type);

    if (!otpRecord) {
      throw new BadRequestException(
        'OTP has expired or does not exist. Please request a new one.',
      );
    }

    const isMatch = await this.hashService.compare(code, otpRecord.code);

    if (!isMatch) {
      throw new BadRequestException('Invalid OTP code.');
    }

    // * "Burn" the OTP so it cannot be used again (Atomic security)
    // await this.otpRepo.markAsUsed(otpRecord.id);
    // * TRANSACTIONAL UPDATE (Senior Move)
    await this.otpRepo.withTransaction(async (tx) => {
      // * Burn the OTP so it's a one-time use
      await this.otpRepo.markAsUsed(otpRecord.id, tx);

      // * If it's a signup, activate the user via the service
      if (type === OTPType.SIGNUP) {
        await this.userService.activateUser(user.id, tx);
      }
    });

    return new VerifyOtpResponseDto({
      success: true,
      userId: otpRecord.userId ?? undefined,
      message: 'OTP verified successfully',
    });
  }
  // async verifyOtp(dto: VerifyOtpDto) {
  //   const { identifier, type, code } = dto;

  //   const user = await this.userService.getUserByEmail(identifier);

  //   if (!user) {
  //     throw new NotFoundException(
  //       `No account found with identifier: ${identifier}`,
  //     );
  //   }

  //   // * Find the latest valid (unused & not expired) OTP for this user/type
  //   const otpRecord = await this.otpRepo.findLatestValidOtp(identifier, type);

  //   if (!otpRecord) {
  //     throw new BadRequestException(
  //       'OTP has expired or does not exist. Please request a new one.',
  //     );
  //   }

  //   // * Compare the plain code from user with the hashed code in DB
  //   const isMatch = await HashUtil.compare(code, otpRecord.code);

  //   if (!isMatch) {
  //     throw new BadRequestException('Invalid OTP code.');
  //   }

  //   // * "Burn" the OTP so it cannot be used again (Atomic security)
  //   // await this.otpRepo.markAsUsed(otpRecord.id);
  //   // * TRANSACTIONAL UPDATE (Senior Move)
  //   await this.otpRepo.withTransaction(async (tx) => {
  //     // * Burn the OTP so it's a one-time use
  //     await this.otpRepo.markAsUsed(otpRecord.id, tx);

  //     // * If it's a signup, activate the user via the service
  //     if (type === OTPType.SIGNUP) {
  //       await this.userService.activateUser(user.id, tx);
  //     }
  //   });

  //   return new VerifyOtpResponseDto({
  //     success: true,
  //     userId: otpRecord.userId ?? undefined,
  //     message: 'OTP verified successfully',
  //   });
  // }
}
