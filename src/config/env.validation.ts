import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(5001),
  API_PREFIX: z.string().default('api/v1'),

  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().default(10000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().default(0),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('5d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_EXPIRES_IN_MS: z.coerce.number().default(2592000000),

  // Mail
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.message}`);
  }
  return result.data;
}
