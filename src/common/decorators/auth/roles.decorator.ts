// * The logic for Roles/Permissions - Handles Role logic
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * This snippet is a Custom Decorator factory. In NestJS, decorators are the primary way to attach Metadata (extra information) 
 to your classes or methods so that other parts of the system (like Guards) can read that info later.
 * Here is a breakdown of how it works:
1. The SetMetadata Function
This is a built-in NestJS utility. It stores a "key-value" pair in the background of a specific route handler.
Key (ROLES_KEY): The unique name for this piece of data (in your case, 'roles').
Value (roles): The actual list of roles you want to allow.

2. The Decorator Factory
TypeScript
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
...roles: This uses the JavaScript Spread Operator. It allows you to pass multiple roles as individual arguments (e.g., Roles(UserRole.ADMIN, UserRole.MODERATOR)), and it bundles them into an array for you.
UserRole[]: This ensures Type Safety. By importing the enum from your Prisma generated files, TypeScript will yell at you if you try to use a role that doesn't exist in your database schema.
 */
