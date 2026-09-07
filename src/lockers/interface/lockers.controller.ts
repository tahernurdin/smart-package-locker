import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Auth } from '../../shared/auth/auth.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import { CreateLockerService } from '../application/create-locker.service.js';
import {
  ListLockersService,
  type LockerView,
} from '../application/list-lockers.service.js';
import { CreateLockerDto } from './dto/create-locker.dto.js';

interface CreatedLockerView {
  id: string;
  code: string;
  size: string;
  status: string;
}

@Controller('lockers')
@Auth(Role.Operator)
export class LockersController {
  constructor(
    private readonly createLocker: CreateLockerService,
    private readonly listLockers: ListLockersService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateLockerDto): Promise<CreatedLockerView> {
    const locker = await this.createLocker.createLocker(dto);
    return {
      id: locker.id,
      code: locker.code,
      size: locker.size.code,
      status: locker.status,
    };
  }

  @Get()
  list(): Promise<LockerView[]> {
    return this.listLockers.listLockers();
  }
}
