import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type SuccessEnvelope = {
  statusCode: number;
  success: true;
  message: string;
  data: unknown;
};

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessEnvelope> {
    // * This is the core method. context gives you access to the current request/response, and next allows the request to continue to your controller.
    return next.handle().pipe(
      map((data: unknown): SuccessEnvelope => {
        const response = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        return {
          statusCode: response.statusCode,
          success: true,
          message: 'Operation successful',
          data,
        };
      }),
    );
  }
}
