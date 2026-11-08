import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../generated/prisma';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const PASSWORD = 'Password123!';

describe('Catalog admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;

  const http = () => request(app.getHttpServer());

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
    const admin = await http()
      .post('/auth/register')
      .send({ email: 'admin@example.com', name: 'Admin', password: PASSWORD })
      .expect(201);
    await prisma.user.update({
      where: { id: admin.body.user.id },
      data: { role: Role.ADMIN },
    });
    adminToken = admin.body.accessToken;

    const user = await http()
      .post('/auth/register')
      .send({ email: 'user@example.com', name: 'User', password: PASSWORD })
      .expect(201);
    userToken = user.body.accessToken;
  });

  const createBrand = (name = 'GreenCo') =>
    http()
      .post('/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, description: 'Sustainable basics' })
      .expect(201);

  describe('brands', () => {
    it('lets an admin create a brand and rejects a duplicate name', async () => {
      await createBrand();
      await http()
        .post('/brands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'GreenCo' })
        .expect(409);
    });

    it('forbids non-admins from creating brands but lets them list', async () => {
      await http()
        .post('/brands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Nope' })
        .expect(403);
      await createBrand();
      await http()
        .get('/brands')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual([
            expect.objectContaining({ name: 'GreenCo', productCount: 0 }),
          ]);
        });
    });

    it('refuses to delete a brand that still has products', async () => {
      const brand = await createBrand();
      await http()
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          gtin: '0614141000418',
          sku: 'SKU-1',
          name: 'Tee',
          brandId: brand.body.id,
        })
        .expect(201);

      await http()
        .delete(`/brands/${brand.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  describe('products', () => {
    it('creates, finds by scan, updates and deletes a product', async () => {
      const brand = await createBrand();

      const created = await http()
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          gtin: '0614141000418',
          sku: 'SKU-1',
          name: 'Organic Tee',
          brandId: brand.body.id,
          sustainabilityInfo: {
            carbonScoreGrams: 2100,
            recyclabilityPercent: 80,
            verified: true,
            certifierName: 'GOTS',
          },
        })
        .expect(201);
      expect(created.body.gtin).toBe('00614141000418');
      expect(created.body.sustainabilityInfo.verifiedAt).toBeDefined();

      await http()
        .get('/products?search=organic')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.total).toBe(1);
          expect(body.items[0].id).toBe(created.body.id);
        });

      await http()
        .patch(`/products/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Organic Tee v2',
          sustainabilityInfo: {
            carbonScoreGrams: 2000,
            recyclabilityPercent: 85,
            verified: false,
            certifierName: 'ignored when unverified',
          },
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body.name).toBe('Organic Tee v2');
          expect(body.sustainabilityInfo.verified).toBe(false);
          expect(body.sustainabilityInfo.certifierName).toBeUndefined();
        });

      await http()
        .delete(`/products/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('rejects a duplicate GTIN even when written in a different length', async () => {
      const brand = await createBrand();
      const body = { sku: 'SKU-1', name: 'Tee', brandId: brand.body.id };
      await http()
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...body, gtin: '0614141000418' })
        .expect(201);
      await http()
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...body, sku: 'SKU-2', gtin: '614141000418' })
        .expect(409);
    });

    it('forbids non-admins from creating products', async () => {
      const brand = await createBrand();
      await http()
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          gtin: '0614141000418',
          sku: 'SKU-1',
          name: 'Tee',
          brandId: brand.body.id,
        })
        .expect(403);
    });
  });

  describe('CSV import', () => {
    const file = Buffer.from(
      [
        'gtin,sku,name,brandName,description,imageUrl,carbonScoreGrams,recyclabilityPercent,verified,certifierName',
        '0614141000418,SKU-1,Tee,NewBrand,,,2100,80,true,GOTS',
        '0614141000419,SKU-2,Bad,NewBrand,,,,,,',
      ].join('\n'),
    );

    it('previews without saving on a dry run', async () => {
      await http()
        .post('/products/import?dryRun=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', file, 'products.csv')
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            dryRun: true,
            created: 1,
            failed: 1,
            brandsCreated: ['NewBrand'],
          });
          expect(body.errors[0].row).toBe(3);
        });
      expect(await prisma.product.count()).toBe(0);
    });

    it('saves the valid rows and creates the new brand', async () => {
      await http()
        .post('/products/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', file, 'products.csv')
        .expect(200);

      const product = await prisma.product.findUniqueOrThrow({
        where: { gtin: '00614141000418' },
        include: { brand: true, sustainabilityInfo: true },
      });
      expect(product.brand.name).toBe('NewBrand');
      expect(product.sustainabilityInfo?.certifierName).toBe('GOTS');
    });

    it('rejects a missing file, a non-CSV file, and non-admins', async () => {
      await http()
        .post('/products/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      await http()
        .post('/products/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', file, 'products.xlsx')
        .expect(400);
      await http()
        .post('/products/import')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', file, 'products.csv')
        .expect(403);
    });

    it('serves the template to admins', () =>
      http()
        .get('/products/import/template')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect('Content-Type', /text\/csv/)
        .expect(({ text }) => {
          expect(text.split('\n')[0]).toMatch(/^gtin,sku,name,brandName/);
        }));
  });
});
