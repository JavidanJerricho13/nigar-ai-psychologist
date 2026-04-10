import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Global exception filter that:
 * 1. Captures all errors in Sentry with context
 * 2. Returns clean error messages to users
 * 3. Never leaks stack traces or internal details
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Daxili xəta baş verdi';

    // Capture in Sentry (non-HTTP errors only — HTTP errors are expected)
    if (status >= 500) {
      Sentry.captureException(exception, {
        tags: {
          path: request?.url,
          method: request?.method,
        },
      });
    }

    this.logger.error(
      `${request?.method ?? 'UNKNOWN'} ${request?.url ?? 'N/A'} → ${status}: ${exception instanceof Error ? exception.message : String(exception)}`,
    );

    response?.status?.(status)?.json?.({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
