import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response/response-message.decorator';

@ApiTags('OTP')
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}
  @Post('verify-otp')
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Verify user email with OTP' })
  @ApiBody({ type: VerifyOtpDto })
  @HttpCode(HttpStatus.FOUND)
  @ResponseMessage('OTP verified successfully')
  async verify(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto);
  }
}
