import { InvalidLockerSizeError } from '../../lockers/domain/errors.js';
import type { LockerSizeCode } from '../../lockers/domain/locker-size.js';
import type {
  ListStorageRateVersionsFilter,
  StorageRateCatalog,
} from '../domain/storage-rate.catalog.js';
import { ListStorageRatesService } from './list-storage-rates.service.js';

function build() {
  const seen: (ListStorageRateVersionsFilter | undefined)[] = [];
  const catalog = {
    listVersions: async (filter?: ListStorageRateVersionsFilter) => {
      seen.push(filter);
      return [];
    },
  } as unknown as StorageRateCatalog;
  return { seen, service: new ListStorageRatesService(catalog) };
}

describe('ListStorageRatesService', () => {
  it('asks for every size when none is named', async () => {
    const { service, seen } = build();

    await service.listStorageRates({});

    expect(seen).toEqual([{ size: undefined }]);
  });

  it('narrows to the named size', async () => {
    const { service, seen } = build();

    await service.listStorageRates({ sizeCode: 'MEDIUM' });

    expect(seen[0]?.size?.code).toBe('MEDIUM');
  });

  it('re-checks the size in the domain', async () => {
    const { service } = build();

    await expect(
      service.listStorageRates({ sizeCode: 'HUGE' as LockerSizeCode }),
    ).rejects.toThrow(InvalidLockerSizeError);
  });
});
