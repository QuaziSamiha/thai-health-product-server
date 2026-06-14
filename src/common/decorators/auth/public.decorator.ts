// * these decorator is specifically for Authentication & Authorization logic (like @Public, @Roles, or @CurrentUser)
// * Replaces OptionalAuthGuard
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * SetMetadata: This is a NestJS utility that attaches a "key-value pair" to a route handler or a class.
 * The Key: isPublic.
 * The Value: true.
 * Usage: When you put @Public() over a controller method, you are basically sticking a label on that method that says:
 "Hey, this specific route is accessible to everyone."
 */
