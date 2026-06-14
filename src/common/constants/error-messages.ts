export const ERROR_MESSAGES = {
  CATEGORY: {
    NOT_FOUND: 'Category not found',
    NOT_FOUND_BY_ID: (id: number) => `Category with ID ${id} not found`,
    DUPLICATE_NAME: 'Category with this name already exists',
    DUPLICATE_SLUG: 'Category slug already in use',
    PARENT_NOT_FOUND: 'Parent category not found',
    SELF_PARENT: 'A category cannot be its own parent',
    DUPLICATE_NAME_ON_UPDATE: 'New category name results in a duplicate name',
  },
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    TOKEN_EXPIRED: 'Session expired, please log in again',
    TOKEN_INVALID: 'Invalid authentication token',
    USER_IDENTITY_MISSING: 'User identity missing from request',
  },
  USER: {
    NOT_FOUND: 'User not found',
    DUPLICATE_EMAIL: 'A user with this email already exists',
  },
  GENERIC: {
    INTERNAL_ERROR: 'An unexpected error occurred',
    FORBIDDEN: 'You do not have permission to perform this action',
    UNAUTHORIZED: 'Authentication required',
  },
} as const;
