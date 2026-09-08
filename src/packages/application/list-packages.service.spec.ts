import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../../shared/pagination/page.js';
import { InvalidLockerSizeError } from '../../lockers/domain/errors.js';
import { InvalidPackageSortError } from '../domain/errors.js';
import type {
  ListPackagesQuery,
  PackageListingRepository,
  PackageListingRow,
} from '../domain/package-listing.repository.js';
import type { ListPackagesQueryDto } from '../interface/dto/list-packages-query.dto.js';
import { ListPackagesService } from './list-packages.service.js';

const config = { currency: 'AUD' } as AppConfiguration;

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

describe('ListPackagesService', () => {
  it('defaults the window and the sort when the query asks for neither', async () => {
    const { repo, received } = spyRepo();

    await new ListPackagesService(repo, config).listPackages();

    expect(received()).toEqual({
      filter: {
        customerId: undefined,
        status: undefined,
        size: undefined,
        stationId: undefined,
        lockerId: undefined,
        trackingRef: undefined,
      },
      sort: { field: 'registeredAt', direction: 'desc' },
      page: { limit: DEFAULT_PAGE_LIMIT, offset: 0 },
    });
  });

  it('passes every operator filter through, as domain values', async () => {
    const { repo, received } = spyRepo();

    await new ListPackagesService(repo, config).listPackages({
      customerId: 'customer-9',
      status: 'STORED',
      size: 'MEDIUM',
      stationId: 'station-3',
      lockerId: 'locker-7',
      trackingRef: 'TRK-42',
    });

    expect(received()?.filter).toEqual({
      customerId: 'customer-9',
      status: 'STORED',
      size: LockerSize.of('MEDIUM'),
      stationId: 'station-3',
      lockerId: 'locker-7',
      trackingRef: 'TRK-42',
    });
  });

  // The DTO's @Max(200) only binds callers that came through the HTTP pipe.
  it('clamps a limit past the ceiling rather than passing it to the repository', async () => {
    const { repo, received } = spyRepo();

    await new ListPackagesService(repo, config).listPackages({
      limit: 100_000,
      offset: -1,
    });

    expect(received()?.page).toEqual({ limit: MAX_PAGE_LIMIT, offset: 0 });
  });

  it('reports the total behind the window', async () => {
    const { repo } = spyRepo([], 1_204);

    const page = await new ListPackagesService(repo, config).listPackages({
      limit: 25,
      offset: 100,
    });

    expect(page).toEqual({ items: [], total: 1_204, limit: 25, offset: 100 });
  });

  it('re-checks a size the DTO only claims to have narrowed', async () => {
    const { repo } = spyRepo();

    await expect(
      new ListPackagesService(repo, config).listPackages({
        size: 'HUGE',
      } as unknown as ListPackagesQueryDto),
    ).rejects.toThrow(InvalidLockerSizeError);
  });

  it('refuses a sort field that never went through the pipe', async () => {
    const { repo } = spyRepo();

    await expect(
      new ListPackagesService(repo, config).listPackages({
        sortBy: 'p.created_at; DROP TABLE package',
      } as unknown as ListPackagesQueryDto),
    ).rejects.toThrow(InvalidPackageSortError);
  });
});
