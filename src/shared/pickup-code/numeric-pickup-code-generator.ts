import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PickupCodeGenerator } from './pickup-code-generator.js';

export const PICKUP_CODE_DIGITS = 6;

@Injectable()
export class NumericPickupCodeGenerator implements PickupCodeGenerator {
  generate(): string {
    return randomInt(0, 10 ** PICKUP_CODE_DIGITS)
      .toString()
      .padStart(PICKUP_CODE_DIGITS, '0');
  }
}
