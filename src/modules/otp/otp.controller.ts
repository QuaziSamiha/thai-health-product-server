import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { OtpService } from './otp.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { sendResponse } from '../../common/responses/send-response';
import type { Response } from 'express';

@ApiTags('OTP')
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}
  @Post('verify-otp')
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Verify user email with OTP' })
  @ApiBody({ type: VerifyOtpDto })
  async verify(@Body() dto: VerifyOtpDto, @Res() res: Response) {
    try {
      const result = await this.otpService.verifyOtp(dto);
      sendResponse(res, {
        statusCode: HttpStatus.FOUND,
        success: true,
        message: 'OTP verified successfully',
        data: result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to verify OTP';
      sendResponse(res, {
        statusCode: HttpStatus.BAD_REQUEST,
        success: false,
        message: errorMessage,
      });
    }
  }
}
