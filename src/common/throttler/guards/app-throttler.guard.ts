import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

//* THE GUARD THAT ACTUALLY ENFORCES THE LIMITS. ThrottlerModule.forRoot/forRootAsync ONLY
//* REGISTERS OPTIONS AND A STORAGE SERVICE — IT APPLIES NOTHING ON ITS OWN, AND THAT IS
//* EXACTLY WHY EVERY ROUTE IN THIS APP WAS UNLIMITED FOR AS LONG AS ThrottlerModule WAS
//* CONFIGURED WITHOUT A GUARD. SEE docs/issues/rate-limiting.md §3.1.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  //* TRACK AUTHENTICATED CALLERS BY USER ID SO ONE NAT'd OFFICE DOESN'T SHARE ONE BUDGET,
  //* AND SO A STOLEN-TOKEN ABUSE PATTERN CAN'T BE HIDDEN BY ROTATING IPs. FALLS BACK TO IP.
  //*
  //* HONEST NOTE ON THE user: BRANCH — IT DOES NOT FIRE TODAY. THIS RUNS AS AN APP_GUARD,
  //* AND APP_GUARDS EXECUTE BEFORE CONTROLLER-SCOPED @UseGuards(JwtAuthGuard), SO req.user
  //* IS STILL undefined AT THIS POINT ON EVERY ROUTE. THAT ORDERING IS THE DELIBERATE
  //* CHOICE (docs/issues/rate-limiting.md §3.9): THROTTLING BEFORE AUTH PROTECTS THE AUTH
  //* GUARD ITSELF — JWT VERIFICATION AND BCRYPT — FROM BEING HAMMERED, AND IS THE ONLY
  //* ORDER UNDER WHICH PUBLIC ROUTES LIKE login AND create-user GET ANY PROTECTION AT ALL.
  //* THE BRANCH STAYS SO THAT ADDING A SECOND, POST-AUTH THROTTLER FOR PER-USER QUOTAS
  //* LATER IS A REGISTRATION CHANGE RATHER THAN AN EDIT HERE.
  protected getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req as { user?: { id?: number } }).user?.id;
    const ip = (req as { ip?: string }).ip;
    return Promise.resolve(userId ? `user:${userId}` : `ip:${ip ?? 'unknown'}`);
  }
}
