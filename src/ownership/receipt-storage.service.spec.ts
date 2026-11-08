import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectReceiptType,
  MAX_RECEIPT_BYTES,
  ReceiptStorageService,
} from './receipt-storage.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
]);

describe('detectReceiptType', () => {
  it('recognises JPEG, PNG, WebP and PDF by their first bytes', () => {
    expect(detectReceiptType(JPEG)?.mime).toBe('image/jpeg');
    expect(detectReceiptType(PNG)?.mime).toBe('image/png');
    expect(detectReceiptType(WEBP)?.mime).toBe('image/webp');
    expect(detectReceiptType(PDF)?.mime).toBe('application/pdf');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(
      detectReceiptType(Buffer.from('<svg onload=alert(1)>')),
    ).toBeUndefined();
    expect(detectReceiptType(Buffer.from('<html>'))).toBeUndefined();
  });
});

describe('ReceiptStorageService', () => {
  let dir: string;
  let storage: ReceiptStorageService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'staka-receipts-'));
    storage = new ReceiptStorageService({
      get: () => dir,
    } as unknown as ConfigService);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('saves under a random name and reads it back', async () => {
    const saved = await storage.save(JPEG);

    expect(saved.mimeType).toBe('image/jpeg');
    expect(saved.path).toMatch(/^receipts\/[0-9a-f-]{36}\.jpg$/);
    expect(await readFile(join(dir, saved.path))).toEqual(JPEG);
    await expect(storage.open(saved.path)).resolves.toMatchObject({
      size: JPEG.length,
    });
  });

  it('refuses empty, oversized and unsupported files', async () => {
    await expect(storage.save(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      storage.save(Buffer.concat([JPEG, Buffer.alloc(MAX_RECEIPT_BYTES)])),
    ).rejects.toThrow(/5 MB/);
    await expect(storage.save(Buffer.from('hello'))).rejects.toThrow(/photo/);
  });

  it('never reads outside its folder', async () => {
    await expect(storage.open('../../etc/passwd')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
