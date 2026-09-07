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
import { CreateStationService } from '../application/create-station.service.js';
import { DecommissionStationService } from '../application/decommission-station.service.js';
import { GetStationService } from '../application/get-station.service.js';
import { ListStationsService } from '../application/list-stations.service.js';
import { UpdateStationService } from '../application/update-station.service.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import type { StationStatus } from '../domain/station-status.js';
import { CreateStationDto } from './dto/create-station.dto.js';
import { ListStationsQueryDto } from './dto/list-stations-query.dto.js';
import { UpdateStationDto } from './dto/update-station.dto.js';

export interface StationView {
  id: string;
  name: string;
  location: string | null;
  status: StationStatus;
  createdAt: string;
  updatedAt: string;
}

function toView(station: LockerStation): StationView {
  return {
    id: station.id,
    name: station.name,
    location: station.location,
    status: station.status,
    createdAt: station.createdAt.toISOString(),
    updatedAt: station.updatedAt.toISOString(),
  };
}

@Controller('stations')
@Auth(Role.Operator)
export class StationsController {
  constructor(
    private readonly createStation: CreateStationService,
    private readonly listStations: ListStationsService,
    private readonly getStation: GetStationService,
    private readonly updateStation: UpdateStationService,
    private readonly decommissionStation: DecommissionStationService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateStationDto): Promise<StationView> {
    return toView(await this.createStation.createStation(dto));
  }

  @Get()
  async list(@Query() query: ListStationsQueryDto): Promise<StationView[]> {
    const stations = await this.listStations.listStations({
      includeDecommissioned: query.includeDecommissioned,
    });
    return stations.map(toView);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<StationView> {
    return toView(await this.getStation.getStation(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStationDto,
  ): Promise<StationView> {
    return toView(await this.updateStation.updateStation({ id, ...dto }));
  }

  /**
   * Decommission, not erase: the row is referenced by its lockers and their
   * assignment history. Returns the retired station so the client sees the
   * resulting status rather than a bare 204.
   */
  @Delete(':id')
  @HttpCode(200)
  async decommission(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StationView> {
    return toView(await this.decommissionStation.decommissionStation(id));
  }
}
