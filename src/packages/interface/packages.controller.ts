import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../shared/auth/auth.decorator.js';
import type { AuthUser } from '../../shared/auth/auth-user.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import type { Page } from '../../shared/pagination/page.js';
import { ListMyPackagesService } from '../application/list-my-packages.service.js';
import { ListPackagesService } from '../application/list-packages.service.js';
import type { PackageView } from '../application/package.view.js';
import {
  RegisterPackageService,
  type RegisteredPackage,
} from '../application/register-package.service.js';
import {
  ReissuePickupCodeService,
  type ReissuedPickupCode,
} from '../application/reissue-pickup-code.service.js';
import {
  RetrievePackageService,
  type RetrievedPackage,
} from '../application/retrieve-package.service.js';
import {
  StorePackageService,
  type StoredPackage,
} from '../application/store-package.service.js';
import { ListMyPackagesQueryDto } from './dto/list-my-packages-query.dto.js';
import { ListPackagesQueryDto } from './dto/list-packages-query.dto.js';
import { RegisterPackageDto } from './dto/register-package.dto.js';
import { RetrievePackageDto } from './dto/retrieve-package.dto.js';
import { StorePackageDto } from './dto/store-package.dto.js';

@Controller('packages')
export class PackagesController {
  constructor(
    private readonly registerPackage: RegisterPackageService,
    private readonly reissuePickupCode: ReissuePickupCodeService,
    private readonly storePackage: StorePackageService,
    private readonly retrievePackage: RetrievePackageService,
    private readonly listMyPackages: ListMyPackagesService,
    private readonly listPackages: ListPackagesService,
  ) {}

  /**
   * The caller's own parcels. Whose they are comes from the token, never the
   * query — hence a separate route from the operator's search rather than a
   * `customerId` filter the customer could point elsewhere.
   *
   * A literal path segment, so it must stay declared above any future
   * `@Get(':id')` or Nest will match "mine" as an id.
   */
  @Get('mine')
  @Auth(Role.Customer)
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMyPackagesQueryDto,
  ): Promise<Page<PackageView>> {
    return this.listMyPackages.listMyPackages(user.sub, query);
  }

  /** Paged: `{ items, total, limit, offset }`, across every customer. */
  @Get()
  @Auth(Role.Operator)
  list(@Query() query: ListPackagesQueryDto): Promise<Page<PackageView>> {
    return this.listPackages.listPackages(query);
  }

  @Post()
  @Auth(Role.Agent)
  @HttpCode(201)
  register(@Body() dto: RegisterPackageDto): Promise<RegisteredPackage> {
    return this.registerPackage.register(dto);
  }

  /**
   * A new pickup code for the caller's own parcel — the answer to a lost SMS,
   * and the only endpoint that hands out a code after the drop. The old one
   * stops working the moment this returns, and the locker's failed-attempt
   * block is lifted with it, since those guesses were against a code that no
   * longer exists.
   */
  @Post(':id/pickup-code')
  @Auth(Role.Customer)
  @HttpCode(200)
  reissue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ReissuedPickupCode> {
    return this.reissuePickupCode.reissue(user.sub, id);
  }

  @Post(':id/store')
  @Auth(Role.Agent)
  @HttpCode(200)
  store(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StorePackageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StoredPackage> {
    return this.storePackage.store({
      packageId: id,
      stationId: dto.stationId,
      agentId: user.sub,
    });
  }

  /**
   * The keypad on the cabinet, not the phone in the customer's pocket. The
   * person collecting a parcel is not logged in — they present a locker id and
   * a pickup code, and the code is what proves the parcel is theirs.
   *
   * The token belongs to the station, so this is not "an unauthenticated
   * endpoint": the hardware is known, and a code cannot be ground down from
   * anywhere on the internet. But it says nothing about *who* is at the door,
   * which is why nothing here reads `@CurrentUser()`.
   */
  @Post('retrieve')
  @Auth(Role.Station)
  @HttpCode(200)
  retrieve(@Body() dto: RetrievePackageDto): Promise<RetrievedPackage> {
    return this.retrievePackage.retrieve(dto);
  }
}
