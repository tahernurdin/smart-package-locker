import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import { DEFAULT_PAGE_LIMIT } from '../../shared/pagination/page.js';
import { InvalidPackageSortError } from '../domain/errors.js';
import type {
  ListPackagesQuery,
  PackageListingRepository,
  PackageListingRow,
} from '../domain/package-listing.repository.js';
import type { ListMyPackagesQueryDto } from '../interface/dto/list-my-packages-query.dto.js';
import { ListMyPackagesService } from './list-my-packages.service.js';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const config = { currency: 'AUD' } as AppConfiguration;

function row(overrides: Partial<PackageListingRow> = {}): PackageListingRow {
  return {
    id: 'pkg-1',
    customerId: CUSTOMER,
    size: LockerSize.of('SMALL'),
    trackingRef: 'TRK-1',
    status: 'RETRIEVED',
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    storedAt: new Date('2026-01-02T00:00:00Z'),
    retrievedAt: new Date('2026-01-03T00:00:00Z'),
    storageFeeMinor: 250,
    locker: { id: 'locker-1', code: 'A-01' },
    station: { id: 'station-1', name: 'HQ Bank' },
    ...overrides,
  };
}

function spyRepo(rows: PackageListingRow[] = [], total = rows.length) {
  let seen: ListPackagesQuery | undefined;
  const repo = {
    list: async (query: ListPackagesQuery) => {
      seen = query;
      return { rows, total };
    },
  } as unknown as PackageListingRepository;
  return { repo, received: () => seen };
}

describe('ListMyPackagesService', () => {
  it('scopes the query to the authenticated customer', async () => {
    const { repo, received } = spyRepo();

    await new ListMyPackagesService(repo, config).listMyPackages(CUSTOMER);

    expect(received()).toEqual({
      filter: { customerId: CUSTOMER, status: undefined, size: undefined },
      sort: { field: 'registeredAt', direction: 'desc' },
      page: { limit: DEFAULT_PAGE_LIMIT, offset: 0 },
    });
  });

  /**
   * The DTO has no `customerId`, so this shape can only arrive from a caller
   * that skipped the pipe — and even then the id in the filter is the one the
   * token proved, not the one the query asked for.
   */
  it('cannot be pointed at another customer through the query', async () => {
    const { repo, received } = spyRepo();

    await new ListMyPackagesService(repo, config).listMyPackages(CUSTOMER, {
      customerId: '22222222-2222-4222-8222-222222222222',
    } as unknown as ListMyPackagesQueryDto);

    expect(received()?.filter.customerId).toBe(CUSTOMER);
  });

  it('maps a collected parcel, pricing the stay in the configured currency', async () => {
    const { repo } = spyRepo([row()]);

    const page = await new ListMyPackagesService(repo, config).listMyPackages(
      CUSTOMER,
    );

    expect(page.items).toEqual([
      {
        id: 'pkg-1',
        customerId: CUSTOMER,
        size: 'SMALL',
        trackingRef: 'TRK-1',
        status: 'RETRIEVED',
        registeredAt: new Date('2026-01-01T00:00:00Z'),
        storedAt: new Date('2026-01-02T00:00:00Z'),
        retrievedAt: new Date('2026-01-03T00:00:00Z'),
        storageFee: { amountMinor: 250, currency: 'AUD' },
        lockerId: 'locker-1',
        lockerCode: 'A-01',
        stationId: 'station-1',
        stationName: 'HQ Bank',
      },
    ]);
  });

  it('leaves a parcel that was never stored without a locker or a fee', async () => {
    const { repo } = spyRepo([
      row({
        status: 'REGISTERED',
        storedAt: null,
        retrievedAt: null,
        storageFeeMinor: null,
        locker: null,
        station: null,
      }),
    ]);

    const page = await new ListMyPackagesService(repo, config).listMyPackages(
      CUSTOMER,
    );

    expect(page.items[0]).toMatchObject({
      status: 'REGISTERED',
      storedAt: null,
      storageFee: null,
      lockerId: null,
      lockerCode: null,
      stationId: null,
      stationName: null,
    });
  });

  it('never exposes the pickup code', async () => {
    const { repo } = spyRepo([row()]);

    const page = await new ListMyPackagesService(repo, config).listMyPackages(
      CUSTOMER,
    );

    expect(JSON.stringify(page)).not.toMatch(/pickup/i);
  });

  it('wraps the rows in the page envelope', async () => {
    const { repo } = spyRepo([row()], 87);

    const page = await new ListMyPackagesService(repo, config).listMyPackages(
      CUSTOMER,
      { limit: 1, offset: 20 },
    );

    expect(page).toMatchObject({ total: 87, limit: 1, offset: 20 });
    expect(page.items).toHaveLength(1);
  });

  it('passes the filters and sort through', async () => {
    const { repo, received } = spyRepo();

    await new ListMyPackagesService(repo, config).listMyPackages(CUSTOMER, {
      status: 'STORED',
      size: 'LARGE',
      sortBy: 'storedAt',
      sortDir: 'asc',
    });

    expect(received()?.filter).toEqual({
      customerId: CUSTOMER,
      status: 'STORED',
      size: LockerSize.of('LARGE'),
    });
    expect(received()?.sort).toEqual({ field: 'storedAt', direction: 'asc' });
  });

  it('refuses a sort field that never went through the pipe', async () => {
    const { repo } = spyRepo();

    await expect(
      new ListMyPackagesService(repo, config).listMyPackages(CUSTOMER, {
        sortBy: 'pickupCodeHash',
      } as unknown as ListMyPackagesQueryDto),
    ).rejects.toThrow(InvalidPackageSortError);
  });
});
