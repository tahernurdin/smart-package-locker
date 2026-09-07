import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Auth } from '../../shared/auth/auth.decorator.js';
import type { AuthUser } from '../../shared/auth/auth-user.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import {
  StorePackageService,
  type StoredPackage,
} from '../application/store-package.service.js';
import { StorePackageDto } from './dto/store-package.dto.js';

@Controller('packages')
export class PackagesController {
  constructor(private readonly storePackage: StorePackageService) {}

  @Post()
  @Auth(Role.Agent)
  @HttpCode(201)
  store(
    @Body() dto: StorePackageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StoredPackage> {
    return this.storePackage.storePackage({
      size: dto.size,
      customer: dto.customer,
      trackingRef: dto.trackingRef,
      agentId: user.sub,
    });
  }
}
