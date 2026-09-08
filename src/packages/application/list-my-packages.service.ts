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
import type { ListMyPackagesQueryDto } from '../interface/dto/list-my-packages-query.dto.js';
import { toPackageView, type PackageView } from './package.view.js';

/**
 * A customer's own parcels. `customerId` is the authenticated subject the
 * controller passes in — it is a parameter, never a field on the query, so
 * there is no request shape in which a caller can name someone else's id and
 * enumerate their parcels.
 */
@Injectable()
export class ListMyPackagesService {
  constructor(
    @Inject(PACKAGE_LISTING_REPOSITORY)
    private readonly packages: PackageListingRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
  ) {}

  async listMyPackages(
    customerId: string,
    query: ListMyPackagesQueryDto = {},
  ): Promise<Page<PackageView>> {
    const page = resolvePageRequest(query);
    const { rows, total } = await this.packages.list({
      filter: {
        customerId,
        status: query.status,
        // `LockerSize.of` re-checks a size the DTO only claims to have narrowed.
        size: query.size ? LockerSize.of(query.size) : undefined,
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
