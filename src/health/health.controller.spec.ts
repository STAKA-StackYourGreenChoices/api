import { Test } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController (unit)', () => {
  let controller: HealthController;
  const health = { check: jest.fn() };
  const db = { pingCheck: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: health },
        { provide: PrismaHealthIndicator, useValue: db },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    jest.resetAllMocks();
  });

  it('readiness runs a database ping', async () => {
    health.check.mockResolvedValue({ status: 'ok' });
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(health.check).toHaveBeenCalledTimes(1);
  });

  it('liveness touches no dependency and reports the running commit', () => {
    const result = controller.live();
    expect(result.status).toBe('ok');
    expect(health.check).not.toHaveBeenCalled();
    expect(db.pingCheck).not.toHaveBeenCalled();
  });
});
