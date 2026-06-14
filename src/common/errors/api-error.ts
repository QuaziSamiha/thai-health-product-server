// * This ApiError class is a Custom Error Wrapper.
export class ApiError extends Error {
  statusCode: number;
  error: string;

  constructor(statusCode: number, message: string, error?: string, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.error = error || message;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
