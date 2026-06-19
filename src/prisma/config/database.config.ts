import { registerAs } from '@nestjs/config';

//* NAMESPACE REGISTRATION — REGISTERS THIS FACTORY UNDER THE KEY 'DATABASE'
//* SO IT IS READ AS CONFIGSERVICE.GET('DATABASE.URL'), OWNED BY PRISMAMODULE
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));
