import { IsUUID } from 'class-validator';

export class StorePackageDto {
  /**
   * The station the agent is dropping the parcel at. Required: allocation never
   * crosses stations, and there is no implicit default one.
   */
  @IsUUID()
  stationId!: string;
}
