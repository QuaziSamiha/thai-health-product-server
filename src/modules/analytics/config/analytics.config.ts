import { registerAs } from '@nestjs/config';
import { analyticsEnvSchema } from './analytics.env';

//* NAMESPACE REGISTRATION — REGISTERS THIS FACTORY UNDER THE KEY 'analytics', OWNED BY ANALYTICSMODULE
//* VALIDATES AGAINST ITS OWN SCHEMA (analytics.env.ts) — SAME SYMMETRIC PATTERN AS health.config.ts
const analyticsConfig = registerAs('analytics', () => {
  const env = analyticsEnvSchema.parse(process.env);
  return {
    propertyId: env.GA_PROPERTY_ID,
    clientEmail: env.GA_SERVICE_ACCOUNT_EMAIL,
    //* ENV FILES CAN'T HOLD A MULTI-LINE PEM, SO IT IS STORED WITH LITERAL
    //* "\n" SEQUENCES — WITHOUT RESTORING THEM THE KEY FAILS TO DECODE
    privateKey: env.GA_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    cacheTtlMs: env.GA_CACHE_TTL_SECONDS * 1000,
  };
});

export default analyticsConfig;
