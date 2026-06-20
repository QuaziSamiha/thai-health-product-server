import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from 'class-validator';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { constraintRecordFromUnknown } from '../utils/validation.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof JsonWebTokenError) {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Invalid token';
      error = (exception as Error).message;
    } else if (exception instanceof TokenExpiredError) {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Token expired';
      error = (exception as Error).message;
    } else if (exception instanceof BadRequestException) {
      const validationErrors = exception.getResponse() as {
        message?: string | ValidationError[];
      };
      if (
        Array.isArray(validationErrors.message) &&
        validationErrors.message[0] instanceof ValidationError
      ) {
        statusCode = HttpStatus.BAD_REQUEST;
        message = validationErrors.message
          .map((item) =>
            Object.values(constraintRecordFromUnknown(item)).join(', '),
          )
          .join(', ');
        error = 'Validation Error';
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        message = (validationErrors.message as string) || 'Validation failed';
        error = 'Bad Request';
      }
    } else if (exception instanceof HttpException) {
      //* GENERIC FALLBACK FOR EVERY HttpException SUBCLASS (BUILT-IN OR CUSTOM) —
      //* COVERS ANY CURRENT OR FUTURE EXCEPTION WITHOUT NEEDING ITS OWN NAMED BRANCH HERE
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj['message'] as string) || exception.message;
        error = (responseObj['error'] as string) || exception.message;
      } else {
        message = exceptionResponse;
        error = exceptionResponse;
      }
    }

    if ((statusCode as number) >= 500) {
      const logMessage = Array.isArray(message) ? message.join(', ') : message;
      this.logger.error(
        `Unhandled Exception [${statusCode}]: ${logMessage}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      success: false,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
