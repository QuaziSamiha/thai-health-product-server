import { registerAs } from '@nestjs/config';

//* NAMESPACE REGISTRATION — REGISTERS THIS FACTORY UNDER THE KEY 'AUTH'
//* SO IT IS READ AS CONFIGSERVICE.GET('AUTH.ACCESSSECRET'), NOT A RAW ENV LOOKUP
export default registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '5d',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  refreshExpiresInMs: parseInt(
    process.env.JWT_REFRESH_EXPIRES_IN_MS || '2592000000',
    10,
  ),
  nodeEnv: process.env.NODE_ENV,
}));
