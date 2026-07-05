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
import { Prisma } from '../../generated/prisma/client';
import { constraintRecordFromUnknown } from '../utils/validation.util';

//* MAPS THE MOST COMMON PRISMA ERROR CODES TO A SAFE, ACTIONABLE CLIENT
//* RESPONSE. CODES NOT LISTED HERE (E.G. P2021 "TABLE/COLUMN DOES NOT
//* EXIST" — A SCHEMA/MIGRATION DRIFT BUG, NOT A CLIENT MISTAKE) FALL
//* THROUGH TO THE GENERIC 500 BELOW.
function mapPrismaError(
  exception: Prisma.PrismaClientKnownRequestError,
): { statusCode: number; message: string; error: string } | null {
  switch (exception.code) {
    case 'P2002': {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : 'field';
      return {
        statusCode: HttpStatus.CONFLICT,
        message: `A record with this ${fields} already exists`,
        error: 'Conflict',
      };
    }
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found',
        error: 'Not Found',
      };
    case 'P2003':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This action references a record that does not exist',
        error: 'Bad Request',
      };
    case 'P2000':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'One of the provided values is too long for its field',
        error: 'Bad Request',
      };
    default:
      return null;
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  //* NEVER LEAK RAW ERROR DETAILS (SCHEMA NAMES, STACK TRACES) TO A PRODUCTION
  //* CLIENT — BUT IN DEV/LOCAL, SURFACING THE REAL MESSAGE SAVES A TRIP TO
  //* THE LOG FILE FOR EVERY UNEXPECTED 500.
  private readonly isProduction = process.env.NODE_ENV === 'production';

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
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        statusCode = mapped.statusCode;
        message = mapped.message;
        error = mapped.error;
      } else if (!this.isProduction) {
        const lines = exception.message.split('\n').map((l) => l.trim());
        message = lines.filter(Boolean).pop() || exception.message;
        error = `Database Error (${exception.code})`;
      }
    } else if (!this.isProduction && exception instanceof Error) {
      message = exception.message;
      error = exception.name;
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
