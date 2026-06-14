import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @IsNumber()
  PORT!: number;

  // @IsString()
  // JWT_SECRET!: string;

  // @IsString()
  // JWT_EXPIRES_IN!: string; // e.g., '15m', '1h', etc.

  // @IsString()
  // JWT_REFRESH_SECRET!: string;

  // @IsString()
  // JWT_REFRESH_EXPIRES_IN!: string; // e.g., '7d'

  // @IsNumber()
  // JWT_REFRESH_EXPIRES_IN_MS!: number; // e.g., 604800000
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  API_PREFIX!: string;

  @IsUrl({ require_tld: false }) // Allows localhost URLs
  BASE_URL!: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // Allows automatic conversion (e.g., string to number)
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
// export function validate(config: Record<string, unknown>) {
//     const validatedConfig = plainToInstance(EnvironmentVariables, config);
//     const errors = validateSync(validatedConfig);

//     if (errors.length > 0) {
//         throw new Error(errors.toString());
//     }
//     return validatedConfig;
// }
