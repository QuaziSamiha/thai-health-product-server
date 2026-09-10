import { z } from 'zod';

//* AN EMPTY `GA_PROPERTY_ID=` LINE IN AN ENV FILE ARRIVES AS "" — TREAT IT AS
//* "NOT SET" RATHER THAN LETTING THE FORMAT CHECKS BELOW CRASH THE BOOT
const optionalEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

//* SELF-CONTAINED ENV CONTRACT FOR THIS MODULE — NO DEPENDENCY ON THE APP SHELL'S config/env.validation.ts
//*
//* EVERY CREDENTIAL IS OPTIONAL AT THE SCHEMA LEVEL, SAME REASONING AS
//* GOOGLE_CLIENT_ID IN auth.env.ts: A DEPLOYMENT WITHOUT GA WIRED UP YET MUST
//* STILL BOOT. AnalyticsService ANSWERS 503 ANALYTICS_NOT_CONFIGURED AT
//* REQUEST TIME INSTEAD.
export const analyticsEnvSchema = z.object({
  //* THE NUMERIC GA4 *PROPERTY* ID (Admin → Property details), NOT THE
  //* "G-XXXXXXX" MEASUREMENT ID AND NOT THE "GTM-XXXX" CONTAINER ID
  GA_PROPERTY_ID: optionalEnv(
    z
      .string()
      .regex(
        /^\d+$/,
        'GA_PROPERTY_ID must be the numeric GA4 property ID, not a G-/GTM- ID',
      ),
  ),
  GA_SERVICE_ACCOUNT_EMAIL: optionalEnv(z.string().email()),
  //* THE `private_key` FIELD OF THE SERVICE ACCOUNT JSON, KEPT ON ONE LINE
  //* WITH LITERAL "\n" SEQUENCES — analytics.config.ts RESTORES THE NEWLINES
  GA_SERVICE_ACCOUNT_PRIVATE_KEY: optionalEnv(z.string()),
  //* HOW LONG ONE GA RESPONSE IS REUSED. GA4 ITSELF ONLY REPROCESSES DATA A
  //* FEW TIMES A DAY, SO AN HOUR COSTS NO FRESHNESS AND KEEPS THE DATA API
  //* QUOTA (40K TOKENS/HOUR/PROPERTY) FAR OUT OF REACH
  GA_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(3600),
});

export type AnalyticsEnv = z.infer<typeof analyticsEnvSchema>;
