import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import type { WinstonModuleOptions } from 'nest-winston';
import { RequestContextService } from './request-context.service';
import { redactSensitiveFields } from './utils/redact.util';
import { DEFAULT_REDACTED_KEYS } from './constants/logger.constants';

export interface LoggerConfig {
  level: string;
  dir: string;
  maxSize: string;
  maxFiles: string;
  consoleEnabled: boolean;
  fileEnabled: boolean;
  errorFileEnabled: boolean;
  jsonConsole: boolean;
}

//* PULLS correlationId/userId/role OUT OF THE REQUEST-SCOPED ASYNCLOCALSTORAGE AND ONTO EVERY
//* LOG LINE — THIS IS WHAT LETS `this.logger.log('...')` ANYWHERE IN THE APP CARRY THE CURRENT
//* REQUEST'S CORRELATION ID WITH NO CHANGES TO ANY EXISTING CALL SITE.
//* TAKES THE SAME RequestContextService SINGLETON NEST ALREADY INJECTS ELSEWHERE (E.G. INTO
//* RequestContextMiddleware) — PASSED IN EXPLICITLY BECAUSE THIS PLAIN WINSTON FORMAT FUNCTION
//* ISN'T PART OF NEST'S DI GRAPH AND CAN'T HAVE IT INJECTED THE NORMAL WAY.
const buildContextEnrichmentFormat = (
  requestContextService: RequestContextService,
) =>
  winston.format((info) => {
    const correlationId = requestContextService.get('correlationId');
    const userId = requestContextService.get('userId');
    const role = requestContextService.get('role');
    if (correlationId !== undefined) info.correlationId = correlationId;
    if (userId !== undefined) info.userId = userId;
    if (role !== undefined) info.role = role;
    return info;
  });

//* REDACTS SENSITIVE FIELDS FROM ANY OBJECT METADATA ATTACHED TO A LOG CALL
//* (E.G. `logger.log('msg', { password: '...' })`) BEFORE IT REACHES A TRANSPORT.
const redactionFormat = winston.format((info) =>
  redactSensitiveFields(info, DEFAULT_REDACTED_KEYS),
);

export function buildWinstonModuleOptions(
  config: LoggerConfig,
  requestContextService: RequestContextService,
): WinstonModuleOptions {
  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    buildContextEnrichmentFormat(requestContextService)(),
    redactionFormat(),
  );

  const transports: winston.transport[] = [];

  if (config.consoleEnabled) {
    transports.push(
      new winston.transports.Console({
        level: config.level,
        format: config.jsonConsole
          ? winston.format.combine(baseFormat, winston.format.json())
          : winston.format.combine(
              baseFormat,
              winston.format.colorize({ all: true }),
              winston.format.printf((info) => {
                const context = (info.context as string | undefined) ?? 'App';
                const correlationId =
                  (info.correlationId as string | undefined) ?? '-';
                return `[${String(info.timestamp)}] ${info.level} [${context}] [${correlationId}] ${String(info.message)}`;
              }),
            ),
      }),
    );
  }

  if (config.fileEnabled) {
    transports.push(
      new DailyRotateFile({
        dirname: config.dir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: config.maxSize,
        maxFiles: config.maxFiles,
        level: config.level,
        format: winston.format.combine(baseFormat, winston.format.json()),
      }),
    );
  }

  if (config.errorFileEnabled) {
    transports.push(
      new DailyRotateFile({
        dirname: config.dir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: config.maxSize,
        maxFiles: config.maxFiles,
        level: 'error',
        format: winston.format.combine(baseFormat, winston.format.json()),
      }),
    );
  }

  return { transports };
}
