export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_STATUS: (status: string) => `Account is ${status}`,
  ACCOUNT_PENDING_VERIFICATION:
    'Account is not active. Please verify your email before logging in',
  PASSWORD_NOT_SET:
    'Password not set. Please use third-party (Google, Facebook) login.',
  INVALID_TOKEN_PAYLOAD: 'Invalid token payload',
  USER_NOT_FOUND: 'User not found',
  ACCOUNT_NOT_ACTIVE: 'Account is not active',
  INVALID_OR_EXPIRED_REFRESH_TOKEN: 'Invalid or expired refresh token',
} as const;
