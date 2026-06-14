import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiError } from './api-error';
import { ValidationError } from 'class-validator';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { constraintRecordFromUnknown } from '../../utils/validation.util';

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
    } else if (exception instanceof UnauthorizedException) {
      statusCode = HttpStatus.UNAUTHORIZED;
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object'
          ? (exceptionResponse['message'] as string) || 'Unauthorized'
          : exceptionResponse;
      error = 'Unauthorized';
    } else if (exception instanceof ForbiddenException) {
      statusCode = HttpStatus.FORBIDDEN;
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object'
          ? (exceptionResponse['message'] as string) || 'Forbidden'
          : exceptionResponse;
      error = 'Forbidden';
    } else if (exception instanceof ApiError) {
      statusCode = exception.statusCode;
      message = exception.message;
      error = exception.message;
    } else if (exception instanceof BadRequestException) {
      const validationErrors = exception.getResponse() as {
        message?: string | ValidationError[];
      };
      if (
        Array.isArray(validationErrors['message']) &&
        validationErrors['message'][0] instanceof ValidationError
      ) {
        statusCode = HttpStatus.BAD_REQUEST;
        message = validationErrors['message']
          .map((item) =>
            Object.values(constraintRecordFromUnknown(item)).join(', '),
          )
          .join(', ');
        error = 'Validation Error';
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        message =
          (validationErrors['message'] as string) || 'Validation failed';
        error = 'Bad Request';
      }
    }

    if ((statusCode as number) >= 500) {
      this.logger.error(
        `Unhandled Exception [${statusCode}]: ${message}`,
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
