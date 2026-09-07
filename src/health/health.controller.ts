import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthService,
  type LivenessStatus,
  type ReadinessStatus,
} from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): LivenessStatus {
    return this.health.liveness();
  }

  /** A degraded instance must answer 503, or a load balancer keeps feeding it. */
  @Get('ready')
  async ready(): Promise<ReadinessStatus> {
    const status = await this.health.readiness();
    if (status.db === 'down') {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
