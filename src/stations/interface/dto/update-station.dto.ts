import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Both fields are optional: send only what changes. `location` accepts an
 * explicit `null` to clear it, which is why it isn't a plain `@IsOptional()`
 * (that would also skip validation for `null` and make the two indistinguishable).
 */
export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;
}
