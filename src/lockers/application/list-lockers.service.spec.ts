import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../../shared/pagination/page.js';
import {
  InvalidLockerSizeError,
  InvalidLockerSortError,
} from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type {
  ListLockersQuery,
  LockerOccupancy,
  LockerOccupancyPage,
  LockerRepository,
} from '../domain/locker.repository.js';
import type { ListLockersQueryDto } from '../interface/dto/list-lockers-query.dto.js';
import { ListLockersService } from './list-lockers.service.js';

function locker(code: string, size: 'SMALL' | 'MEDIUM' | 'LARGE'): Locker {
  return Locker.create({
    id: `id-${code}`,
    stationId: 'station-1',
    code,
    size: LockerSize.of(size),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

const station = { id: 'station-1', name: 'HQ Bank', location: 'Lobby' };

/** Records the query it was asked, answering with `page`. */
function spyRepo(page: LockerOccupancyPage = { rows: [], total: 0 }): {
  repo: LockerRepository;
  received: () => ListLockersQuery | undefined;
} {
  let seen: ListLockersQuery | undefined;
  const repo = {
    listWithOccupancy: async (query: ListLockersQuery) => {
      seen = query;
      return page;
    },
  } as unknown as LockerRepository;
  return { repo, received: () => seen };
}

describe('ListLockersService', () => {
  it('derives FREE / OCCUPIED and flattens the station onto each row', async () => {
    const rows: LockerOccupancy[] = [
      { locker: locker('A-01', 'SMALL'), activePackageId: 'pkg-7', station },
      { locker: locker('B-01', 'LARGE'), activePackageId: null, station },
    ];
    const { repo } = spyRepo({ rows, total: 2 });

    const page = await new ListLockersService(repo).listLockers();

    expect(page.items).toEqual([
      {
        id: 'id-A-01',
        code: 'A-01',
        size: 'SMALL',
        status: 'IN_SERVICE',
        availability: 'OCCUPIED',
        activePackageId: 'pkg-7',
        stationId: 'station-1',
        stationName: 'HQ Bank',
        location: 'Lobby',
      },
      {
        id: 'id-B-01',
        code: 'B-01',
        size: 'LARGE',
        status: 'IN_SERVICE',
        availability: 'FREE',
        activePackageId: null,
        stationId: 'station-1',
        stationName: 'HQ Bank',
        location: 'Lobby',
      },
    ]);
  });

  it('wraps the rows in the page envelope, reporting the total behind it', async () => {
    const rows: LockerOccupancy[] = [
      { locker: locker('A-01', 'SMALL'), activePackageId: null, station },
    ];
    const { repo } = spyRepo({ rows, total: 412 });

    const page = await new ListLockersService(repo).listLockers({
      limit: 1,
      offset: 40,
    });

    expect(page).toEqual({
      items: [expect.objectContaining({ code: 'A-01' })],
      total: 412,
      limit: 1,
      offset: 40,
    });
  });

  it('defaults the window and the sort when the query asks for neither', async () => {
    const { repo, received } = spyRepo();

    await new ListLockersService(repo).listLockers();

    expect(received()).toEqual({
      filter: {
        stationId: undefined,
        size: undefined,
        status: undefined,
        availability: undefined,
        includeDecommissioned: undefined,
      },
      sort: { field: 'code', direction: 'asc' },
      page: { limit: DEFAULT_PAGE_LIMIT, offset: 0 },
    });
  });

  // The DTO's @Max(200) only binds callers that came through the HTTP pipe.
  it('clamps a limit past the ceiling rather than passing it to the repository', async () => {
    const { repo, received } = spyRepo();

    await new ListLockersService(repo).listLockers({
      limit: 100_000,
      offset: -1,
    });

    expect(received()?.page).toEqual({ limit: MAX_PAGE_LIMIT, offset: 0 });
  });

  it('passes the filters through, as domain values', async () => {
    const { repo, received } = spyRepo();

    await new ListLockersService(repo).listLockers({
      stationId: 'station-9',
      size: 'MEDIUM',
      status: 'OUT_OF_SERVICE',
      availability: 'FREE',
      includeDecommissioned: true,
    });

    expect(received()?.filter).toEqual({
      stationId: 'station-9',
      size: LockerSize.of('MEDIUM'),
      status: 'OUT_OF_SERVICE',
      availability: 'FREE',
      includeDecommissioned: true,
    });
  });

  it('passes the requested sort through', async () => {
    const { repo, received } = spyRepo();

    await new ListLockersService(repo).listLockers({
      sortBy: 'station',
      sortDir: 'desc',
    });

    expect(received()?.sort).toEqual({ field: 'station', direction: 'desc' });
  });

  it('re-checks a size the DTO only claims to have narrowed', async () => {
    const { repo } = spyRepo();

    await expect(
      new ListLockersService(repo).listLockers({
        size: 'HUGE',
      } as unknown as ListLockersQueryDto),
    ).rejects.toThrow(InvalidLockerSizeError);
  });

  it('refuses a sort field that never went through the pipe', async () => {
    const { repo } = spyRepo();

    await expect(
      new ListLockersService(repo).listLockers({
        sortBy: 'l.code; DROP TABLE locker',
      } as unknown as ListLockersQueryDto),
    ).rejects.toThrow(InvalidLockerSortError);
  });
});
