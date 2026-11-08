import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const password = 'Password123!';

describe('Auth (e2e)', () => {
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

  it('registers and logs in a user', async () => {
    const email = `auth-${Date.now()}@example.com`;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'Auth User', password })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
        expect(body.refreshToken).toEqual(expect.any(String));
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
        expect(body.refreshToken).toEqual(expect.any(String));
      });
  });

  it('requires a valid access token for protected routes', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('allows the public registration and login routes without an access token', async () => {
    const email = `public-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'Public User', password })
      .expect(201);
  });

  it('rejects a non-admin from the admin-only users list', async () => {
    const user = await register(app, `user-${Date.now()}@example.com`);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
  });

  it('returns 401 for an invalid token on an admin route', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('answers forgot-password identically for known and unknown emails, never returning the token', async () => {
    const email = `reset-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'Reset User', password })
      .expect(201);

    const known = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);
    const unknown = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(200);

    expect(known.body).toEqual(unknown.body);
    expect(known.body).not.toHaveProperty('resetToken');
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordResetToken).toEqual(expect.any(String));
  });
});

async function register(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: 'E2E User', password })
    .expect(201);

  return response.body as { accessToken: string; user: { id: string } };
}
