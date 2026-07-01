import { z } from 'zod';

//* SELF-CONTAINED ENV CONTRACT FOR THIS MODULE — NO DEPENDENCY ON THE APP SHELL'S config/env.validation.ts
//* LETS src/shared/logger BE COPIED INTO ANOTHER PROJECT AND VALIDATE ITSELF, WITH ZERO KNOWLEDGE OF UNRELATED DOMAINS
export const loggerEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .optional(),
  LOG_DIR: z.string().default('logs'),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_RETENTION_DAYS: z.coerce.number().default(14),
  LOG_CONSOLE_ENABLED: z.coerce.boolean().default(true),
  LOG_FILE_ENABLED: z.coerce.boolean().default(true),
  LOG_ERROR_FILE_ENABLED: z.coerce.boolean().default(true),
  LOG_JSON_CONSOLE: z.coerce.boolean().optional(),
});

export type LoggerEnv = z.infer<typeof loggerEnvSchema>;
