// * The ONLY entry point (Global)
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth/public.decorator';
import { User } from '../../../generated/prisma/client';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Main gatekeeper logic.
   * Checks for @Public() decorator and attempts JWT validation.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    try {
      // Attempt standard Passport-JWT validation
      return (await super.canActivate(context)) as boolean;
    } catch (err: unknown) {
      // If the route is marked @Public(), we ignore authentication errors
      if (isPublic) {
        return true;
      }

      // Otherwise, handle the error gracefully
      const message =
        err instanceof Error ? err.message : 'Unauthorized access';
      throw new UnauthorizedException(message);
    }
  }

  /**
   * Finalizes the request by attaching the user or throwing an exception.
   * We use the generic <TUser = any> to match the base class signature.
   */
  handleRequest<TUser = User>(err: any, user: any, info: any): TUser {
    // If there is an error or no user
    if (err || !user) {
      const errorMessage =
        info instanceof Error ? info.message : 'Unauthorized';
      throw err || new UnauthorizedException(errorMessage);
    }

    // Cast to TUser (which defaults to your Prisma User)
    return user as TUser;
  }
}
