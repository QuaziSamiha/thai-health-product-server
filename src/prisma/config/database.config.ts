import { registerAs } from '@nestjs/config';

//* NAMESPACE REGISTRATION — REGISTERS THIS FACTORY UNDER THE KEY 'database'
//* SO IT IS READ AS configService.get('database.url'), OWNED BY PRISMAMODULE
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  pool: {
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
    idleTimeoutMillis:
      Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS) || 10000,
    connectionTimeoutMillis:
      Number(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS) || 0,
  },
}));
