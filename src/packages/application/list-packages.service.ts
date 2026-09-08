import { Inject, Injectable } from '@nestjs/common';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  APP_CONFIG,
  type AppConfiguration,
} from '../../shared/config/configuration.js';
import {
  resolvePageRequest,
  toPage,
  type Page,
} from '../../shared/pagination/page.js';
import {
  PACKAGE_LISTING_REPOSITORY,
  type PackageListingRepository,
} from '../domain/package-listing.repository.js';
import { packageSortOf } from '../domain/package-sort.js';
import type { ListPackagesQueryDto } from '../interface/dto/list-packages-query.dto.js';
import { toPackageView, type PackageView } from './package.view.js';

/** The operator's search across every customer's parcels. */
@Injectable()
export class ListPackagesService {
  constructor(
    @Inject(PACKAGE_LISTING_REPOSITORY)
    private readonly packages: PackageListingRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
  ) {}

  async listPackages(
    query: ListPackagesQueryDto = {},
  ): Promise<Page<PackageView>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.packages.list({
      filter: {
        customerId: query.customerId,
        status: query.status,
        // `LockerSize.of` re-checks a size the DTO only claims to have narrowed.
        size: query.size ? LockerSize.of(query.size) : undefined,
        stationId: query.stationId,
        lockerId: query.lockerId,
        trackingRef: query.trackingRef,
      },
      sort: packageSortOf(query.sortBy, query.sortDir),
      page,
    });
    return toPage(
      rows.map((row) => toPackageView(row, this.config.currency)),
      total,
      page,
    );
  }
}
