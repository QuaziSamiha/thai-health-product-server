import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics.service';
import { buildReportWindow, eachDay } from '../utils/report-window.util';

type ServiceConfig = ConstructorParameters<typeof AnalyticsService>[0];

const CONFIG: ServiceConfig = {
  propertyId: '123456789',
  clientEmail: 'ga-reader@thp.iam.gserviceaccount.com',
  privateKey: 'key',
  cacheTtlMs: 60_000,
};

const metricHeaders = (...names: string[]) => names.map((name) => ({ name }));
const row = (dims: string[], values: number[]) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: values.map((value) => ({ value: String(value) })),
});

function fakeBatchResponse(endDate: string) {
  return [
    {
      reports: [
        {
          metricHeaders: metricHeaders(
            'activeUsers',
            'newUsers',
            'sessions',
            'screenPageViews',
            'bounceRate',
            'averageSessionDuration',
          ),
          rows: [
            row(['previous'], [100, 50, 150, 400, 0.5, 80.4]),
            row(['current'], [120, 60, 180, 500, 0.4123, 95.6]),
          ],
        },
        {
          metricHeaders: metricHeaders(
            'activeUsers',
            'sessions',
            'screenPageViews',
          ),
          rows: [row([endDate.replace(/-/g, '')], [7, 9, 30])],
        },
        {
          metricHeaders: metricHeaders('sessions'),
          rows: [row(['Organic Search'], [90]), row(['(not set)'], [3])],
        },
        {
          metricHeaders: metricHeaders('activeUsers'),
          rows: [row(['Bangkok', 'Thailand'], [80])],
        },
        {
          metricHeaders: metricHeaders('screenPageViews', 'activeUsers'),
          rows: [row(['/en/product'], [200, 70])],
        },
      ],
    },
  ];
}

function createService(config: ServiceConfig = CONFIG) {
  const service = new AnalyticsService(config);
  const batchRunReports = jest.fn();
  //* SWAP IN A FAKE CLIENT SO NO TEST EVER TALKS TO GOOGLE
  (service as unknown as { client: unknown }).client = {
    batchRunReports,
    close: jest.fn(),
  };
  return { service, batchRunReports };
}

describe('report window', () => {
  it('ends yesterday and places an equally long window right before it', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T02:00:00Z'));
    try {
      expect(buildReportWindow(7, 'Asia/Bangkok')).toEqual({
        startDate: '2026-09-03',
        endDate: '2026-09-09',
        previousStartDate: '2026-08-27',
        previousEndDate: '2026-09-02',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the property time zone, not UTC, to decide what "today" is', () => {
    //* 18:00 UTC ON THE 9TH IS ALREADY 01:00 ON THE 10TH IN BANGKOK
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T18:00:00Z'));
    try {
      expect(buildReportWindow(1, 'Asia/Bangkok').endDate).toBe('2026-09-09');
      expect(buildReportWindow(1, 'UTC').endDate).toBe('2026-09-08');
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists every day inclusively across a month boundary', () => {
    expect(eachDay('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

describe('AnalyticsService', () => {
  it('answers 503 without calling Google when credentials are missing', () => {
    const { service, batchRunReports } = createService({
      ...CONFIG,
      privateKey: undefined,
    });

    expect(() => service.getOverview('28d')).toThrow(
      ServiceUnavailableException,
    );
    expect(batchRunReports).not.toHaveBeenCalled();
  });

  it('shapes the batch response: named ranges, zero-filled trend, readable labels', async () => {
    const { service, batchRunReports } = createService();
    const { endDate } = buildReportWindow(7, 'Asia/Bangkok');
    batchRunReports.mockResolvedValue(fakeBatchResponse(endDate));

    const overview = await service.getOverview('7d');

    expect(batchRunReports).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'properties/123456789' }),
    );
    //* 'previous' ARRIVES FIRST IN THE FAKE — MATCHING IS BY NAME, NOT POSITION
    expect(overview.summary.activeUsers).toEqual({
      value: 120,
      previous: 100,
      changePercent: 20,
    });
    expect(overview.summary.bounceRate.value).toBe(41.2);
    expect(overview.summary.avgSessionDuration.value).toBe(96);

    expect(overview.trend).toHaveLength(7);
    expect(overview.trend[6]).toEqual({
      date: endDate,
      activeUsers: 7,
      sessions: 9,
      pageViews: 30,
    });
    expect(overview.trend[0].sessions).toBe(0);

    expect(overview.channels.map((c) => c.channel)).toEqual([
      'Organic Search',
      'Unassigned',
    ]);
    expect(overview.cities[0]).toEqual({
      city: 'Bangkok',
      country: 'Thailand',
      activeUsers: 80,
    });
  });

  it('reports a null change when the previous period had nothing', async () => {
    const { service, batchRunReports } = createService();
    batchRunReports.mockResolvedValue([{ reports: [] }]);

    const overview = await service.getOverview('28d');

    expect(overview.summary.sessions).toEqual({
      value: 0,
      previous: 0,
      changePercent: null,
    });
  });

  it('shares one Google call between concurrent and repeat requests', async () => {
    const { service, batchRunReports } = createService();
    batchRunReports.mockResolvedValue([{ reports: [] }]);

    await Promise.all([service.getOverview('28d'), service.getOverview('28d')]);
    await service.getOverview('28d');
    await service.getOverview('7d');

    expect(batchRunReports).toHaveBeenCalledTimes(2);
  });

  it('turns a permission error into a 502 naming the service account', async () => {
    const { service, batchRunReports } = createService();
    batchRunReports.mockRejectedValue(
      Object.assign(
        new Error(
          '7 PERMISSION_DENIED: User does not have sufficient permissions',
        ),
        {
          code: 7,
        },
      ),
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    const request = service.getOverview('28d');

    await expect(request).rejects.toBeInstanceOf(BadGatewayException);
    await expect(request).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: 'ANALYTICS_UPSTREAM_ERROR',
        message: expect.stringContaining(CONFIG.clientEmail!),
      }),
    });
  });
});
