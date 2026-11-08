import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const PASSWORD = 'password';
const USER = {
  id: '00000000-0000-4000-8000-0000000000bb',
  email: 'e2e@example.com',
  name: 'E2E User',
  password: bcrypt.hashSync(PASSWORD, 10),
};

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    await startTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts exactly — otherwise E2E passes while production 500s.
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
    await prisma.user.create({ data: USER });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: USER.email, password: PASSWORD })
      .expect(201);
    accessToken = login.body.accessToken;
  });

  it('GET / returns the greeting', () =>
    request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect('Hello World!'));

  it('GET /health/live is up without touching the database', () =>
    request(app.getHttpServer())
      .get('/health/live')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      }));

  it('GET /health reports ok with the database reachable', () =>
    request(app.getHttpServer())
      .get('/health')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
      }));

  it('POST /orders creates an order and returns the computed total', () =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ sku: 'SKU-A', quantity: 2, unitPrice: 1000 }],
        discount: 500,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.userId).toBe(USER.id);
        expect(body.subtotal).toBe(2000);
        expect(body.total).toBe(1500);
        expect(body.items).toHaveLength(1);
      }));

  it('POST /orders rejects an unknown field', () =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 1 }],
        sneaky: true,
      })
      .expect(400));

  it('POST /orders refuses a userId in the body, so orders cannot be placed for someone else', () =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        userId: '00000000-0000-4000-8000-0000000000cc',
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 1 }],
      })
      .expect(400));

  it('POST /orders rejects an empty item list', () =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [] })
      .expect(400));

  it('POST /orders rejects a negative discount', () =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 100 }],
        discount: -1,
      })
      .expect(400));

  it('GET /orders/:id returns 400 for a non-UUID id', () =>
    request(app.getHttpServer())
      .get('/orders/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400));

  it('GET /orders/:id returns 404 for an unknown order', () =>
    request(app.getHttpServer())
      .get('/orders/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404));

  describe('Products (e2e)', () => {
    beforeEach(async () => {
      const brand = await prisma.brand.create({
        data: { id: 'brand-e2e', name: 'Brand E2E' },
      });
      await prisma.product.create({
        data: {
          id: 'prod-e2e',
          gtin: '00614141000418',
          sku: 'SKU-E2E-01',
          name: 'E2E Product',
          brandId: brand.id,
        },
      });
    });

    it('GET /products/gtin/:gtin finds a 14-digit GTIN', () =>
      request(app.getHttpServer())
        .get('/products/gtin/00614141000418')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe('prod-e2e');
          expect(body.gtin).toBe('00614141000418');
        }));

    it('GET /products/gtin/:gtin finds the same product from a 13-digit EAN scan', () =>
      request(app.getHttpServer())
        .get('/products/gtin/0614141000418')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe('prod-e2e');
        }));

    it('GET /products/gtin/:gtin returns 400 for a bad check digit', () =>
      request(app.getHttpServer())
        .get('/products/gtin/0614141000419')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400));

    it('GET /products/gtin/:gtin returns 404 for a valid but unknown GTIN', () =>
      request(app.getHttpServer())
        .get('/products/gtin/4006381333931')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404));

    it('GET /products/sku/:sku returns 200 with product details', () =>
      request(app.getHttpServer())
        .get('/products/sku/SKU-E2E-01')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe('prod-e2e');
          expect(body.sku).toBe('SKU-E2E-01');
        }));

    it('GET /products/sku/:sku returns 404 for unknown SKU', () =>
      request(app.getHttpServer())
        .get('/products/sku/UNKNOWN-SKU')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404));

    it('requires a signed-in user', () =>
      request(app.getHttpServer())
        .get('/products/gtin/00614141000418')
        .expect(401));
  });

  describe('Digital Cards (e2e)', () => {
    beforeEach(async () => {
      const brand = await prisma.brand.create({
        data: { id: 'brand-card-e2e', name: 'Card Brand' },
      });
      await prisma.product.create({
        data: {
          id: 'prod-card-e2e',
          gtin: '00614141000418',
          sku: 'SKU-CARD-E2E',
          name: 'Card Product',
          brandId: brand.id,
        },
      });
    });

    const createCard = (token: string, gtin = '0614141000418') =>
      request(app.getHttpServer())
        .post('/digital-cards')
        .set('Authorization', `Bearer ${token}`)
        .send({ gtin });

    const registerOther = async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'other@example.com',
          name: 'Other',
          password: 'Password123!',
        })
        .expect(201);
      return response.body as { accessToken: string; user: { id: string } };
    };

    it('POST /digital-cards creates a card for the signed-in user (201), without their email', () =>
      createCard(accessToken)
        .expect(201)
        .expect(({ body }) => {
          expect(body.id).toBeDefined();
          expect(body.user).toEqual({ id: USER.id, name: USER.name });
          expect(body.product.gtin).toBe('00614141000418');
        }));

    it('POST /digital-cards returns the existing card (200) on a repeat scan', async () => {
      const first = await createCard(accessToken).expect(201);
      const second = await createCard(accessToken, '00614141000418').expect(
        200,
      );

      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.digitalCard.count()).toBe(1);
    });

    it('POST /digital-cards refuses a userId in the body', () =>
      request(app.getHttpServer())
        .post('/digital-cards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId: USER.id, gtin: '0614141000418' })
        .expect(400));

    it('POST /digital-cards returns 400 for an invalid GTIN and 404 for an unknown one', async () => {
      await createCard(accessToken, '0614141000419').expect(400);
      await createCard(accessToken, '4006381333931').expect(404);
    });

    it('GET /digital-cards/mine lists only my cards', async () => {
      const other = await registerOther();
      await createCard(accessToken).expect(201);
      await createCard(other.accessToken).expect(201);

      await request(app.getHttpServer())
        .get('/digital-cards/mine')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(1);
          expect(body[0].user.id).toBe(USER.id);
        });
    });

    it("GET /digital-cards/:id returns 404 for another user's card", async () => {
      const other = await registerOther();
      const card = await createCard(other.accessToken).expect(201);

      await request(app.getHttpServer())
        .get(`/digital-cards/${card.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/digital-cards/${card.body.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);
    });

    it('GET /digital-cards/:id returns 400 for a non-UUID id', () =>
      request(app.getHttpServer())
        .get('/digital-cards/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400));

    it('GET /digital-cards/user/:userId is admin-only', () =>
      request(app.getHttpServer())
        .get(`/digital-cards/user/${USER.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403));
  });
});
