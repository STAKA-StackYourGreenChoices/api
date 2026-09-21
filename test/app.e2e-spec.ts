import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const USER = {
  id: '00000000-0000-4000-8000-0000000000bb',
  email: 'e2e@example.com',
  name: 'E2E User',
};

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  it('GET / returns the greeting', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'));

  it('GET /health/live is up without touching the database', () =>
    request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      }));

  it('GET /health reports ok with the database reachable', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
      }));

  it('POST /orders creates an order and returns the computed total', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: USER.id,
        items: [{ sku: 'SKU-A', quantity: 2, unitPrice: 1000 }],
        discount: 500,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.subtotal).toBe(2000);
        expect(body.total).toBe(1500);
        expect(body.items).toHaveLength(1);
      }));

  it('POST /orders rejects an unknown field', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: USER.id,
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 1 }],
        sneaky: true,
      })
      .expect(400));

  it('POST /orders rejects an empty item list', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({ userId: USER.id, items: [] })
      .expect(400));

  it('POST /orders rejects a negative discount', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: USER.id,
        items: [{ sku: 'SKU-A', quantity: 1, unitPrice: 100 }],
        discount: -1,
      })
      .expect(400));

  it('GET /orders/:id returns 400 for a non-UUID id', () =>
    request(app.getHttpServer()).get('/orders/not-a-uuid').expect(400));

  it('GET /orders/:id returns 404 for an unknown order', () =>
    request(app.getHttpServer())
      .get('/orders/00000000-0000-4000-8000-0000000000ff')
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

    it('GET /products/gtin/:gtin returns 200 with product details', () =>
      request(app.getHttpServer())
        .get('/products/gtin/00614141000418')
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe('prod-e2e');
          expect(body.gtin).toBe('00614141000418');
        }));

    it('GET /products/gtin/:gtin returns 404 for unknown GTIN', () =>
      request(app.getHttpServer())
        .get('/products/gtin/00000000000000')
        .expect(404));

    it('GET /products/sku/:sku returns 200 with product details', () =>
      request(app.getHttpServer())
        .get('/products/sku/SKU-E2E-01')
        .expect(200)
        .expect(({ body }) => {
          expect(body.id).toBe('prod-e2e');
          expect(body.sku).toBe('SKU-E2E-01');
        }));

    it('GET /products/sku/:sku returns 404 for unknown SKU', () =>
      request(app.getHttpServer())
        .get('/products/sku/UNKNOWN-SKU')
        .expect(404));
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

    it('POST /digital-cards creates a digital card and returns 201', () =>
      request(app.getHttpServer())
        .post('/digital-cards')
        .send({ userId: USER.id, gtin: '00614141000418' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.id).toBeDefined();
          expect(body.user.id).toBe(USER.id);
          expect(body.product.gtin).toBe('00614141000418');
        }));

    it('POST /digital-cards returns 400 for invalid userId (non-UUID)', () =>
      request(app.getHttpServer())
        .post('/digital-cards')
        .send({ userId: 'not-a-uuid', gtin: '00614141000418' })
        .expect(400));

    it('POST /digital-cards returns 404 for unknown GTIN', () =>
      request(app.getHttpServer())
        .post('/digital-cards')
        .send({ userId: USER.id, gtin: '99999999999999' })
        .expect(404));

    it('GET /digital-cards/:id returns 400 for a non-UUID id', () =>
      request(app.getHttpServer())
        .get('/digital-cards/not-a-uuid')
        .expect(400));

    it('GET /digital-cards/:id returns 404 for an unknown card', () =>
      request(app.getHttpServer())
        .get('/digital-cards/00000000-0000-4000-8000-000000000099')
        .expect(404));

    it('GET /digital-cards/user/:userId returns 200 with cards array', () =>
      request(app.getHttpServer())
        .get(`/digital-cards/user/${USER.id}`)
        .expect(200)
        .expect(({ body }) => {
          expect(Array.isArray(body)).toBe(true);
        }));

    it('GET /digital-cards/user/:userId returns 400 for non-UUID userId', () =>
      request(app.getHttpServer())
        .get('/digital-cards/user/not-a-uuid')
        .expect(400));
  });
});
