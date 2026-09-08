import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { Clock } from '../../shared/clock/clock.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import type { PickupCodeGenerator } from '../../shared/pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  LockerJustTakenError,
  NoSuitableLockerError,
  PackageAlreadyStoredError,
  PackageNotFoundError,
} from '../domain/errors.js';
import {
  StationDecommissionedError,
  StationNotFoundError,
} from '../../stations/domain/errors.js';
import { LockerStation } from '../../stations/domain/locker-station.entity.js';
import type { StationRepository } from '../../stations/domain/station.repository.js';
import { Package } from '../domain/package.entity.js';
import type {
  PackageRepository,
  ReserveLockerAndStoreParams,
} from '../domain/package.repository.js';
import { StorePackageService } from './store-package.service.js';

interface FreeLocker {
  id: string;
  code: string;
  size: LockerSize;
}

const free = (
  id: string,
  code: string,
  size: 'SMALL' | 'MEDIUM' | 'LARGE',
): FreeLocker => ({
  id,
  code,
  size: LockerSize.of(size),
});

class FakePackageRepo implements PackageRepository {
  readonly packages = new Map<string, Package>();
  freeLockers: FreeLocker[] = [];
  reserveFailures: Error[] = [];

  async save(pkg: Package): Promise<void> {
    this.packages.set(pkg.id, pkg);
  }
  async findById(id: string): Promise<Package | null> {
    return this.packages.get(id) ?? null;
  }
  async findActiveByLocker(): Promise<Package | null> {
    return null;
  }
  async reserveLockerAndStore(
    params: ReserveLockerAndStoreParams,
  ): Promise<{ lockerId: string; lockerCode: string } | null> {
    const failure = this.reserveFailures.shift();
    if (failure) throw failure;

    const candidate = [...this.freeLockers]
      .filter((l) => l.size.fits(params.requiredSize))
      .sort(
        (a, b) => a.size.rank - b.size.rank || a.code.localeCompare(b.code),
      )[0];
    if (!candidate) return null;

    this.packages.set(params.packageId, params.build(candidate.id));
    this.freeLockers = this.freeLockers.filter((l) => l.id !== candidate.id);
    return { lockerId: candidate.id, lockerCode: candidate.code };
  }
  async savePickupCode(): Promise<void> {}
  async saveRetrieval(): Promise<void> {}
}

const hasher = new PickupCodeHasher({
  pickupCodePepper: 'test-pepper',
} as AppConfiguration);
const clock: Clock = { now: () => new Date('2026-06-02T00:00:00.000Z') };
/** The station the agent is at — always explicit, there is no default. */
const STATION_ID = 'station-1';

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `id-${++n}` };
}

function fixedCode(code = '111111'): PickupCodeGenerator {
  return { generate: () => code };
}

function registeredPackage(size: 'SMALL' | 'MEDIUM' | 'LARGE'): Package {
  return Package.register({
    id: 'pkg-1',
    customerId: 'cust-1',
    size: LockerSize.of(size),
    now: new Date('2026-06-01T00:00:00Z'),
  });
}

const theStation = LockerStation.create({
  id: STATION_ID,
  name: 'North Depot',
  now: new Date('2026-01-01T00:00:00.000Z'),
});

function stationRepo(
  station: LockerStation | null = theStation,
): StationRepository {
  return { findById: async () => station } as unknown as StationRepository;
}

function service(
  repo: FakePackageRepo,
  code = '111111',
  stations: StationRepository = stationRepo(),
) {
  return new StorePackageService(
    repo,
    stations,
    fixedCode(code),
    hasher,
    idGen(),
    clock,
  );
}

describe('StorePackageService', () => {
  it('assigns the smallest locker that fits', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [
      free('m', 'M-01', 'MEDIUM'),
      free('s', 'S-01', 'SMALL'),
    ];

    const result = await service(repo).store({
      packageId: 'pkg-1',
      stationId: STATION_ID,
    });

    expect(result).toMatchObject({
      lockerId: 's',
      lockerCode: 'S-01',
      status: 'STORED',
    });
  });

  it('falls back to the next size up when smaller lockers are taken', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('m', 'M-01', 'MEDIUM')];

    const result = await service(repo).store({
      packageId: 'pkg-1',
      stationId: STATION_ID,
    });

    expect(result.lockerId).toBe('m');
  });

  it('throws NoSuitableLockerError when nothing fits', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('LARGE'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];

    await expect(
      service(repo).store({ packageId: 'pkg-1', stationId: STATION_ID }),
    ).rejects.toThrow(NoSuitableLockerError);
  });

  it('throws PackageNotFoundError for an unknown package', async () => {
    await expect(
      service(new FakePackageRepo()).store({
        packageId: 'nope',
        stationId: STATION_ID,
      }),
    ).rejects.toThrow(PackageNotFoundError);
  });

  it('rejects an unknown station rather than reporting no locker', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];

    await expect(
      service(repo, '111111', stationRepo(null)).store({
        packageId: 'pkg-1',
        stationId: STATION_ID,
      }),
    ).rejects.toThrow(StationNotFoundError);
    expect(repo.freeLockers).toHaveLength(1);
  });

  it('rejects a decommissioned station', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];
    const retired = theStation.decommission(new Date('2026-05-01T00:00:00Z'));

    await expect(
      service(repo, '111111', stationRepo(retired)).store({
        packageId: 'pkg-1',
        stationId: STATION_ID,
      }),
    ).rejects.toThrow(StationDecommissionedError);
    expect(repo.freeLockers).toHaveLength(1);
  });

  it('throws PackageAlreadyStoredError for a package that is already stored', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];
    await service(repo).store({ packageId: 'pkg-1', stationId: STATION_ID });

    await expect(
      service(repo).store({ packageId: 'pkg-1', stationId: STATION_ID }),
    ).rejects.toThrow(PackageAlreadyStoredError);
  });

  it('returns a 6-digit code and stores only its hash, with storedAt from the clock', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];

    const result = await service(repo, '482913').store({
      packageId: 'pkg-1',
      stationId: STATION_ID,
      agentId: 'agent-9',
    });

    expect(result.pickupCode).toBe('482913');
    const stored = repo.packages.get('pkg-1')!;
    expect(stored.pickupCodeHash).toBe(hasher.hash('482913', 'id-1'));
    expect(stored.pickupCodeHash).not.toContain('482913');
    expect(stored.storedAt.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(stored.assignment?.storedByAgent).toBe('agent-9');
  });

  it('retries a lost allocation race, then succeeds', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];
    repo.reserveFailures = [new LockerJustTakenError()];

    const result = await service(repo).store({
      packageId: 'pkg-1',
      stationId: STATION_ID,
    });
    expect(result.status).toBe('STORED');
  });

  it('gives up after repeated allocation races', async () => {
    const repo = new FakePackageRepo();
    await repo.save(registeredPackage('SMALL'));
    repo.freeLockers = [free('s', 'S-01', 'SMALL')];
    repo.reserveFailures = [
      new LockerJustTakenError(),
      new LockerJustTakenError(),
      new LockerJustTakenError(),
    ];

    await expect(
      service(repo).store({ packageId: 'pkg-1', stationId: STATION_ID }),
    ).rejects.toThrow(LockerJustTakenError);
  });
});
