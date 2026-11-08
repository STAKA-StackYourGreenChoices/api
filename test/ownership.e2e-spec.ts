import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrderStatus, Role } from '../generated/prisma';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { startTestDatabase, stopTestDatabase } from './setup-db';

const PASSWORD = 'Password123!';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

describe('Ownership claims (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let uploads: string;
  let shopper: { token: string; id: string };
  let admin: { token: string };
  let cardId: string;

  const http = () => request(app.getHttpServer());
  const register = async (email: string) => {
    const res = await http()
      .post('/auth/register')
      .send({ email, name: email.split('@')[0], password: PASSWORD })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as string,
    };
  };
  const upload = (token = shopper.token) =>
    http()
      .post(`/digital-cards/${cardId}/ownership/receipt`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', JPEG, 'receipt.jpg');
  const pendingClaimId = async () =>
    (
      await prisma.ownershipClaim.findFirstOrThrow({
        where: { status: 'PENDING' },
      })
    ).id;
  const rejectPending = async () =>
    http()
      .post(`/claims/${await pendingClaimId()}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Receipt is unreadable' })
      .expect(200);

  beforeAll(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'staka-e2e-uploads-'));
    process.env.UPLOADS_DIR = uploads;
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
    await rm(uploads, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.truncateAll();
    shopper = await register('shopper@example.com');
    const adminUser = await register('admin@example.com');
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: Role.ADMIN },
    });
    admin = adminUser;

    const brand = await prisma.brand.create({
      data: { name: 'Terra Threads' },
    });
    await prisma.product.create({
      data: {
        gtin: '08901234500019',
        sku: 'TT-TEE',
        name: 'Organic Tee',
        brandId: brand.id,
      },
    });
    const card = await http()
      .post('/digital-cards')
      .set('Authorization', `Bearer ${shopper.token}`)
      .send({ gtin: '8901234500019' })
      .expect(201);
    cardId = card.body.id;
    expect(card.body.ownership.status).toBe('UNVERIFIED');
  });

  it('verifies instantly from a paid order containing the SKU', async () => {
    await http()
      .post(`/digital-cards/${cardId}/ownership/order-match`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(404);

    await prisma.order.create({
      data: {
        userId: shopper.id,
        subtotal: 2500,
        status: OrderStatus.PAID,
        items: { create: [{ sku: 'TT-TEE', quantity: 1, unitPrice: 2500 }] },
      },
    });

    await http()
      .post(`/digital-cards/${cardId}/ownership/order-match`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'VERIFIED',
          method: 'ORDER_MATCH',
        });
      });
  });

  it('a receipt goes to the admin queue and approval verifies the card', async () => {
    await upload()
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'PENDING',
          receiptAttemptsLeft: 4,
        });
      });
    await upload().expect(409);

    const queue = await http()
      .get('/claims')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({
      receiptAttempt: 1,
      hasReceipt: true,
    });
    const claimId = queue.body.items[0].id as string;

    await http()
      .get(`/claims/${claimId}/receipt`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)
      .expect('Content-Type', 'image/jpeg')
      .expect('Content-Security-Policy', /sandbox/);

    await http()
      .post(`/claims/${claimId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    await http()
      .post(`/claims/${claimId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(409);

    await http()
      .get(`/digital-cards/${cardId}`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(({ body }) => {
        expect(body.ownership).toMatchObject({
          status: 'VERIFIED',
          method: 'RECEIPT',
        });
      });
  });

  it('allows 5 receipt uploads in total, then blocks the product', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await upload().expect(200);
      await rejectPending();
    }

    await upload().expect(403);
    await http()
      .get(`/digital-cards/${cardId}/ownership`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'BLOCKED',
          receiptAttemptsUsed: 5,
          receiptAttemptsLeft: 0,
          lastRejectionReason: 'Receipt is unreadable',
        });
      });
  });

  it('keeps receipts and the queue private', async () => {
    const other = await register('other@example.com');
    await upload(other.token).expect(404);
    await upload().expect(200);
    const claimId = await pendingClaimId();

    await http()
      .get('/claims')
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(403);
    await http()
      .get(`/claims/${claimId}/receipt`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
    await http()
      .get(`/claims/${claimId}/receipt`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(200);
  });

  it('only verified pieces can be shared, and a revoked link stops working', async () => {
    const share = () =>
      http()
        .post(`/digital-cards/${cardId}/share`)
        .set('Authorization', `Bearer ${shopper.token}`);
    await share().expect(409);

    await upload().expect(200);
    await http()
      .post(`/claims/${await pendingClaimId()}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const { body: link } = await share().expect(200);
    await http()
      .get(`/public/tags/${link.slug}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ownerFirstName: 'shopper',
          verifiedBy: 'RECEIPT',
        });
        expect(JSON.stringify(body)).not.toContain('@example.com');
      });

    await http()
      .delete(`/digital-cards/${cardId}/share`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .expect(204);
    await http().get(`/public/tags/${link.slug}`).expect(404);

    const { body: fresh } = await share().expect(200);
    expect(fresh.slug).not.toBe(link.slug);
  });

  it('rejects files that are not images or PDFs', () =>
    http()
      .post(`/digital-cards/${cardId}/ownership/receipt`)
      .set('Authorization', `Bearer ${shopper.token}`)
      .attach('file', Buffer.from('<svg onload=alert(1)>'), 'receipt.jpg')
      .expect(400));
});
