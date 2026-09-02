import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /** Readiness: checks the database. Used by smoke tests and uptime monitors. */
  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Service and its dependencies are healthy.' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Liveness: deliberately dependency-free.
   *
   * The container HEALTHCHECK hits this. If it pinged the database, a 5-second
   * database blip would make Docker restart a perfectly healthy app and turn it
   * into a 2-minute outage.
   */
  @Get('live')
  @ApiOkResponse({ description: 'Process is alive.' })
  live() {
    return {
      status: 'ok',
      sha: process.env.GIT_SHA ?? 'dev',
      env: process.env.APP_ENV ?? 'development',
      uptime: Math.round(process.uptime()),
    };
  }
}
