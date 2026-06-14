import { forwardRef, Module } from '@nestjs/common';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { OtpRepository } from './otp.repository';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [forwardRef(() => UserModule), MailModule],
  controllers: [OtpController],
  providers: [OtpService, OtpRepository],
  exports: [OtpService],
})
export class OtpModule {}

// src/modules/otp/otp.module.ts
// import { Module } from '@nestjs/common';
// import { OtpService } from './otp.service';
// import { OtpController } from './otp.controller';
// import { OtpRepository } from './otp.repository';
// import { MailModule } from '../mail/mail.module';

// @Module({
//   imports: [MailModule],
//   controllers: [OtpController],
//   providers: [OtpService, OtpRepository],
//   exports: [OtpService], // So UserService can call generateAndSendOtp
// })
// export class OtpModule {}
