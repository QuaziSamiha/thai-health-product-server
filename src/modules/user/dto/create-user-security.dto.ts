import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, MaxLength, IsIP } from 'class-validator';

export class CreateUserSecurityDto {
  @ApiPropertyOptional({
    description:
      'A static IP address assigned to a user (e.g., for restricted Admin or Vendor access)',
    example: '192.168.1.100',
  })
  @IsIP(4) // More specific than IsString()
  @IsOptional()
  @MaxLength(15, { message: 'Assigned IP must be at most 15 characters long' })
  assignedIp?: string;
}
