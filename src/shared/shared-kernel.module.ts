import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CLOCK } from './clock/clock.js';
import { SystemClock } from './clock/system-clock.js';
import { DomainExceptionFilter } from './errors/domain-exception.filter.js';
import { ID_GENERATOR } from './id/id-generator.js';
import { UuidGenerator } from './id/uuid-generator.js';
import { NumericPickupCodeGenerator } from './pickup-code/numeric-pickup-code-generator.js';
import { PICKUP_CODE_GENERATOR } from './pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from './pickup-code/pickup-code-hasher.js';

/**
 * Cross-cutting primitives available to every feature module: deterministic time
 * and ids, pickup-code generation/hashing, and the global domain-error filter.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: PICKUP_CODE_GENERATOR, useClass: NumericPickupCodeGenerator },
    PickupCodeHasher,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [CLOCK, ID_GENERATOR, PICKUP_CODE_GENERATOR, PickupCodeHasher],
})
export class SharedKernelModule {}
