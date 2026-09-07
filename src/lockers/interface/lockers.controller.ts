import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../shared/auth/auth.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import { CreateLockerService } from '../application/create-locker.service.js';
import { DecommissionLockerService } from '../application/decommission-locker.service.js';
import { GetLockerService } from '../application/get-locker.service.js';
import { ListLockersService } from '../application/list-lockers.service.js';
import type { LockerView } from '../application/locker.view.js';
import { UpdateLockerService } from '../application/update-locker.service.js';
import { CreateLockerDto } from './dto/create-locker.dto.js';
import { ListLockersQueryDto } from './dto/list-lockers-query.dto.js';
import { UpdateLockerDto } from './dto/update-locker.dto.js';

@Controller('lockers')
@Auth(Role.Operator)
export class LockersController {
  constructor(
    private readonly createLocker: CreateLockerService,
    private readonly listLockers: ListLockersService,
    private readonly getLocker: GetLockerService,
    private readonly updateLocker: UpdateLockerService,
    private readonly decommissionLocker: DecommissionLockerService,
  ) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateLockerDto): Promise<LockerView> {
    return this.createLocker.createLocker(dto);
  }

  @Get()
  list(@Query() query: ListLockersQueryDto): Promise<LockerView[]> {
    return this.listLockers.listLockers(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LockerView> {
    return this.getLocker.getLocker(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLockerDto,
  ): Promise<LockerView> {
    return this.updateLocker.updateLocker({ id, ...dto });
  }

  /**
   * Decommission, not erase: `locker_assignment` rows reference this locker and
   * the storage history has to keep its referent. Returns the retired locker so
   * the client sees the resulting status rather than a bare 204.
   */
  @Delete(':id')
  @HttpCode(200)
  decommission(@Param('id', ParseUUIDPipe) id: string): Promise<LockerView> {
    return this.decommissionLocker.decommissionLocker(id);
  }
}
