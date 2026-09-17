import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../generated/prisma';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const password = 'Password123!';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await prisma.truncateAll();
  });

  it('allows a user to access their own record but not another user record', async () => {
    const first = await register(app, `owner-${Date.now()}@example.com`);
    const second = await register(app, `other-${Date.now()}@example.com`);

    await request(app.getHttpServer())
      .get(`/users/${first.user.id}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${second.user.id}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(403);
  });

  it('allows a user to update their own record', async () => {
    const user = await register(app, `update-${Date.now()}@example.com`);

    await request(app.getHttpServer())
      .patch(`/users/${user.user.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Updated Name' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Updated Name');
      });
  });

  it('allows an admin to list, update, and soft-delete users', async () => {
    const adminEmail = `admin-${Date.now()}@example.com`;
    const admin = await register(app, adminEmail);
    const target = await register(app, `target-${Date.now()}@example.com`);
    await prisma.user.update({
      where: { id: admin.user.id },
      data: { role: Role.ADMIN },
    });

    // Use a fresh admin token because the original token was issued before promotion.
    const promotedAdmin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password })
      .expect(201);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${promotedAdmin.body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/users/${target.user.id}`)
      .set('Authorization', `Bearer ${promotedAdmin.body.accessToken}`)
      .send({ name: 'Admin Updated User' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/users/${target.user.id}`)
      .set('Authorization', `Bearer ${promotedAdmin.body.accessToken}`)
      .expect(200);

    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.user.id } }),
    ).resolves.toEqual(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });
});

async function register(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: 'E2E User', password })
    .expect(201);

  return response.body as { accessToken: string; user: { id: string } };
}
