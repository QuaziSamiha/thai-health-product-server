// * Handles Swagger + Permissions
import { SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...permissions: string[]) => {
  return (
    // We use a specific shape: a function that can be instantiated
    target: object | (new (...args: any[]) => any),
    key?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    if (key) {
      // Method decorator
      SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor!);
      ApiBearerAuth()(target, key, descriptor!);
    } else {
      // Class decorator
      // We cast to 'Function' only at the last second where NestJS's
      // internal library specifically requires that legacy type.
      SetMetadata(PERMISSIONS_KEY, permissions)(target as any);
      ApiBearerAuth()(target as any);
    }
  };
};
