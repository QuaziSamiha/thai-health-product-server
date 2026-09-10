import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { BetaAnalyticsDataClient, protos } from '@google-analytics/data';
import analyticsConfig from './config/analytics.config';
import {
  ANALYTICS_RANGES,
  ANALYTICS_TIME_ZONE,
  AnalyticsRange,
  FAILURE_CACHE_TTL_MS,
  TOP_CHANNELS_LIMIT,
  TOP_CITIES_LIMIT,
  TOP_PAGES_LIMIT,
} from './constants/analytics.constants';
import {
  AnalyticsMetricDto,
  AnalyticsOverviewResponseDto,
} from './dto/analytics-overview-response.dto';
import {
  buildReportWindow,
  eachDay,
  ReportWindow,
} from './utils/report-window.util';

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type ReportRow = protos.google.analytics.data.v1beta.IRow;

//* THE gRPC STATUS CODES GA'S CLIENT SURFACES ON error.code — MIRRORED HERE
//* RATHER THAN IMPORTED FROM google-gax, WHICH IS ONLY A TRANSITIVE DEPENDENCY
const GrpcStatus = {
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  UNAUTHENTICATED: 16,
} as const;

interface CacheEntry {
  expiresAt: number;
  value: Promise<AnalyticsOverviewResponseDto>;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function toMetric(value: number, previous: number): AnalyticsMetricDto {
  return {
    value,
    previous,
    changePercent:
      previous === 0 ? null : round1(((value - previous) / previous) * 100),
  };
}

//* LOOKS METRICS UP BY NAME VIA metricHeaders INSTEAD OF BY POSITION, SO
//* REORDERING A REQUEST'S metrics ARRAY CAN NEVER SILENTLY SWAP TWO FIGURES
function metricReader(
  report: RunReportResponse | undefined,
  row: ReportRow | undefined,
): (name: string) => number {
  const values = new Map<string, number>();
  (report?.metricHeaders ?? []).forEach((header, index) => {
    if (header.name) {
      values.set(
        header.name,
        Number(row?.metricValues?.[index]?.value ?? 0) || 0,
      );
    }
  });
  return (name) => values.get(name) ?? 0;
}

const dimension = (row: ReportRow, index = 0): string =>
  row.dimensionValues?.[index]?.value ?? '';

//* GA REPORTS "(not set)" WHEN IT COULD NOT RESOLVE A DIMENSION (E.G. AN
//* IP IT CANNOT GEOLOCATE) — SHOW SOMETHING AN ADMIN CAN READ
const readable = (value: string, fallback: string): string =>
  !value || value === '(not set)' ? fallback : value;

/**
 * Reads the storefront's GA4 property through the Google Analytics Data API
 * using a service account, and shapes it for the admin analytics page.
 *
 * **Why this lives on the API server and not in a Next.js route:** the
 * service-account key never leaves the backend, the endpoint sits behind the
 * same JWT + role guard as every other admin read, and one process-wide
 * cache serves every admin instead of each browser hitting Google.
 *
 * **Quota:** the whole page is one `batchRunReports` call (five reports in a
 * single round trip), cached per window for `GA_CACHE_TTL_SECONDS`, with
 * concurrent requests for the same window sharing one in-flight call. The
 * cache is per process — N replicas make at most N calls per TTL, which is
 * still nowhere near GA's 40K tokens/hour property quota.
 */
@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private client?: BetaAnalyticsDataClient;

  constructor(
    @Inject(analyticsConfig.KEY)
    private readonly config: ConfigType<typeof analyticsConfig>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  getOverview(range: AnalyticsRange): Promise<AnalyticsOverviewResponseDto> {
    const { propertyId, clientEmail, privateKey, cacheTtlMs } = this.config;

    if (!propertyId || !clientEmail || !privateKey) {
      throw new ServiceUnavailableException({
        message:
          'Google Analytics is not configured on the server. Set GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_EMAIL and GA_SERVICE_ACCOUNT_PRIVATE_KEY.',
        error: 'Service Unavailable',
        errorCode: 'ANALYTICS_NOT_CONFIGURED',
      });
    }

    const window = buildReportWindow(
      ANALYTICS_RANGES[range],
      ANALYTICS_TIME_ZONE,
    );
    //* endDate IN THE KEY MAKES THE CACHE ROLL OVER AT MIDNIGHT ON ITS OWN —
    //* YESTERDAY'S WINDOW IS NEVER SERVED AS TODAY'S
    const key = `${range}:${window.endDate}`;
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    this.evictExpired(now);

    //* THE PROMISE ITSELF IS CACHED, NOT ITS RESULT — A SECOND ADMIN OPENING
    //* THE PAGE WHILE THE FIRST CALL IS IN FLIGHT JOINS IT INSTEAD OF STARTING
    //* ANOTHER ONE
    const entry: CacheEntry = {
      expiresAt: now + cacheTtlMs,
      value: this.fetchOverview(propertyId, range, window),
    };
    entry.value.catch(() => {
      entry.expiresAt = Date.now() + FAILURE_CACHE_TTL_MS;
    });
    this.cache.set(key, entry);

    return entry.value;
  }

  private getClient(): BetaAnalyticsDataClient {
    this.client ??= new BetaAnalyticsDataClient({
      credentials: {
        client_email: this.config.clientEmail,
        private_key: this.config.privateKey,
      },
    });
    return this.client;
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }

  private async fetchOverview(
    propertyId: string,
    range: AnalyticsRange,
    window: ReportWindow,
  ): Promise<AnalyticsOverviewResponseDto> {
    const current = { startDate: window.startDate, endDate: window.endDate };

    //* ORDER IS LOAD-BEARING — THE RESPONSE'S reports ARRAY COMES BACK IN
    //* THE SAME ORDER AND IS DESTRUCTURED POSITIONALLY BELOW. GA CAPS A
    //* BATCH AT FIVE REPORTS, SO THIS IS FULL.
    const requests: RunReportRequest[] = [
      {
        //* TWO NAMED RANGES, NO DIMENSIONS — GA RETURNS ONE ROW PER RANGE,
        //* KEYED BY AN IMPLICIT "dateRange" DIMENSION CARRYING THESE NAMES
        dateRanges: [
          { ...current, name: 'current' },
          {
            startDate: window.previousStartDate,
            endDate: window.previousEndDate,
            name: 'previous',
          },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      },
      {
        dateRanges: [current],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
      {
        dateRanges: [current],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: TOP_CHANNELS_LIMIT,
      },
      {
        dateRanges: [current],
        dimensions: [{ name: 'city' }, { name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: TOP_CITIES_LIMIT,
      },
      {
        dateRanges: [current],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: TOP_PAGES_LIMIT,
      },
    ];

    let reports: RunReportResponse[];
    try {
      const [response] = await this.getClient().batchRunReports({
        property: `properties/${propertyId}`,
        requests,
      });
      reports = response.reports ?? [];
    } catch (error) {
      throw this.toHttpException(error, propertyId);
    }

    const [summaryReport, trendReport, channelReport, cityReport, pageReport] =
      reports;

    const summaryRows = new Map(
      (summaryReport?.rows ?? []).map((row) => [dimension(row), row]),
    );
    const now = metricReader(summaryReport, summaryRows.get('current'));
    const before = metricReader(summaryReport, summaryRows.get('previous'));

    //* GA OMITS DAYS WITH NO TRAFFIC ENTIRELY — ZERO-FILL SO THE CHART SHOWS
    //* A QUIET DAY AS A ZERO RATHER THAN SILENTLY CLOSING THE GAP
    const trendByDate = new Map(
      (trendReport?.rows ?? []).map((row) => [dimension(row), row]),
    );

    return {
      range,
      ...window,
      summary: {
        activeUsers: toMetric(now('activeUsers'), before('activeUsers')),
        newUsers: toMetric(now('newUsers'), before('newUsers')),
        sessions: toMetric(now('sessions'), before('sessions')),
        pageViews: toMetric(now('screenPageViews'), before('screenPageViews')),
        //* GA RETURNS RATES AS 0–1 FRACTIONS; THE CLIENT SHOWS PERCENTAGES
        bounceRate: toMetric(
          round1(now('bounceRate') * 100),
          round1(before('bounceRate') * 100),
        ),
        avgSessionDuration: toMetric(
          Math.round(now('averageSessionDuration')),
          Math.round(before('averageSessionDuration')),
        ),
      },
      trend: eachDay(window.startDate, window.endDate).map((date) => {
        const read = metricReader(
          trendReport,
          trendByDate.get(date.replace(/-/g, '')),
        );
        return {
          date,
          activeUsers: read('activeUsers'),
          sessions: read('sessions'),
          pageViews: read('screenPageViews'),
        };
      }),
      channels: (channelReport?.rows ?? []).map((row) => ({
        channel: readable(dimension(row), 'Unassigned'),
        sessions: metricReader(channelReport, row)('sessions'),
      })),
      cities: (cityReport?.rows ?? []).map((row) => ({
        city: readable(dimension(row, 0), 'Unknown'),
        country: readable(dimension(row, 1), ''),
        activeUsers: metricReader(cityReport, row)('activeUsers'),
      })),
      topPages: (pageReport?.rows ?? []).map((row) => {
        const read = metricReader(pageReport, row);
        return {
          path: dimension(row),
          pageViews: read('screenPageViews'),
          activeUsers: read('activeUsers'),
        };
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  //* THE RAW GOOGLE ERROR IS LOGGED IN FULL BUT NEVER SENT TO THE CLIENT —
  //* THE ADMIN GETS A SENTENCE THAT SAYS WHICH SETTING TO FIX INSTEAD
  private toHttpException(error: unknown, propertyId: string): HttpException {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code: unknown }).code
        : undefined;
    const raw = error instanceof Error ? error.message : String(error);

    this.logger.error(
      `GA4 batchRunReports failed for property ${propertyId} (code ${String(code)}): ${raw}`,
      error instanceof Error ? error.stack : undefined,
    );

    let message: string;
    if (/SERVICE_DISABLED|has not been used|it is disabled/i.test(raw)) {
      message =
        "The Google Analytics Data API is not enabled in the service account's Google Cloud project. Enable it under APIs & Services, then retry in a few minutes.";
    } else if (/DECODER|PEM|private key/i.test(raw)) {
      message =
        'GA_SERVICE_ACCOUNT_PRIVATE_KEY could not be read. Paste the private_key value from the service account JSON exactly, keeping the \\n sequences.';
    } else {
      switch (code) {
        case GrpcStatus.PERMISSION_DENIED:
          message = `The service account has no access to GA4 property ${propertyId}. Add ${this.config.clientEmail} as a Viewer under GA Admin → Property access management.`;
          break;
        case GrpcStatus.UNAUTHENTICATED:
          message =
            'Google rejected the service account credentials. Check GA_SERVICE_ACCOUNT_EMAIL and GA_SERVICE_ACCOUNT_PRIVATE_KEY, and that the key has not been deleted.';
          break;
        case GrpcStatus.NOT_FOUND:
        case GrpcStatus.INVALID_ARGUMENT:
          message = `GA4 property ${propertyId} was not found or rejected the report. Check that GA_PROPERTY_ID is the numeric property ID.`;
          break;
        case GrpcStatus.RESOURCE_EXHAUSTED:
          message =
            'The Google Analytics Data API quota for this property is used up. Try again in an hour.';
          break;
        default:
          message =
            'Google Analytics could not be reached. Try again in a moment.';
      }
    }

    return new BadGatewayException({
      message,
      error: 'Bad Gateway',
      errorCode: 'ANALYTICS_UPSTREAM_ERROR',
    });
  }
}
