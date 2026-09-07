import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { LockerStation } from '../domain/locker-station.entity.js';
import type { StationStatus } from '../domain/station-status.js';
import type {
  ListStationsFilter,
  StationRepository,
} from '../domain/station.repository.js';

const STATION_SELECT = `id, name, location, status, created_at, updated_at`;

@Injectable()
export class MysqlStationRepository implements StationRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async save(station: LockerStation): Promise<void> {
    await this.pool.query(
      `INSERT INTO locker_station
         (id, name, location, status, created_at, updated_at)
       VALUES (:id, :name, :location, :status, :createdAt, :updatedAt)`,
      {
        id: station.id,
        name: station.name,
        location: station.location,
        status: station.status,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt,
      },
    );
  }

  async update(station: LockerStation): Promise<void> {
    await this.pool.query(
      `UPDATE locker_station
       SET name = :name, location = :location, status = :status,
           updated_at = :updatedAt
       WHERE id = :id`,
      {
        id: station.id,
        name: station.name,
        location: station.location,
        status: station.status,
        updatedAt: station.updatedAt,
      },
    );
  }

  async findById(id: string): Promise<LockerStation | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${STATION_SELECT} FROM locker_station WHERE id = :id LIMIT 1`,
      { id },
    );
    return rows.length ? this.toStation(rows[0]) : null;
  }

  async list(filter: ListStationsFilter = {}): Promise<LockerStation[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${STATION_SELECT}
       FROM locker_station
       WHERE (:includeDecommissioned OR status = 'ACTIVE')
       ORDER BY name ASC, id ASC`,
      { includeDecommissioned: filter.includeDecommissioned ?? false },
    );
    return rows.map((row) => this.toStation(row));
  }

  async countLiveLockers(stationId: string): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS live
       FROM locker
       WHERE station_id = :stationId AND status <> 'DECOMMISSIONED'`,
      { stationId },
    );
    return Number(rows[0].live);
  }

  private toStation(row: RowDataPacket): LockerStation {
    return LockerStation.fromPersistence({
      id: row.id as string,
      name: row.name as string,
      location: (row.location as string | null) ?? null,
      status: row.status as StationStatus,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    });
  }
}
