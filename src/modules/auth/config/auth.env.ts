import { z } from 'zod';

//* SELF-CONTAINED ENV CONTRACT FOR THIS MODULE — NO DEPENDENCY ON THE APP SHELL'S config/env.validation.ts
//* LETS src/modules/auth BE COPIED INTO ANOTHER PROJECT AND VALIDATE ITSELF, WITH ZERO KNOWLEDGE OF UNRELATED DOMAINS
export const authEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('5d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_EXPIRES_IN_MS: z.coerce.number().default(2592000000),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;
