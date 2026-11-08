import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IMPORT_TEMPLATE,
  ProductImportService,
} from './product-import.service';

const HEADER =
  'gtin,sku,name,brandName,description,imageUrl,carbonScoreGrams,recyclabilityPercent,verified,certifierName';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'));

describe('ProductImportService (unit)', () => {
  const tx = {
    brand: { create: jest.fn() },
    product: { upsert: jest.fn() },
  };
  const prisma = {
    product: { findMany: jest.fn() },
    brand: { findMany: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  let service: ProductImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.brand.findMany.mockResolvedValue([]);
    tx.brand.create.mockImplementation(({ data }: { data: { name: string } }) =>
      Promise.resolve({ id: `brand-${data.name}` }),
    );
    service = new ProductImportService(prisma as unknown as PrismaService);
  });

  it('creates new products and brands, storing 14-digit GTINs', async () => {
    const report = await service.import(
      csv('0614141000418,SKU-1,Tee,GreenCo,,,2100,80,yes,GOTS'),
      false,
    );

    expect(report).toMatchObject({
      dryRun: false,
      totalRows: 1,
      created: 1,
      updated: 0,
      failed: 0,
      brandsCreated: ['GreenCo'],
    });
    expect(tx.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gtin: '00614141000418' },
        create: expect.objectContaining({
          sku: 'SKU-1',
          brandId: 'brand-GreenCo',
          sustainabilityInfo: {
            create: expect.objectContaining({
              verified: true,
              certifierName: 'GOTS',
              verifiedAt: expect.any(Date),
            }),
          },
        }),
      }),
    );
  });

  it('counts a known GTIN as an update and reuses the existing brand', async () => {
    prisma.product.findMany
      .mockResolvedValueOnce([{ id: 'p1', gtin: '00614141000418' }])
      .mockResolvedValueOnce([{ gtin: '00614141000418', sku: 'SKU-1' }]);
    prisma.brand.findMany.mockResolvedValue([{ id: 'b1', name: 'GreenCo' }]);

    const report = await service.import(
      csv('0614141000418,SKU-1,Tee v2,GreenCo,,,,,,'),
      false,
    );

    expect(report).toMatchObject({ created: 0, updated: 1, brandsCreated: [] });
    expect(tx.brand.create).not.toHaveBeenCalled();
    expect(tx.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ name: 'Tee v2', brandId: 'b1' }),
      }),
    );
  });

  it('saves valid rows and reports each bad row with its line number', async () => {
    const report = await service.import(
      csv(
        '0614141000418,SKU-1,Tee,GreenCo,,,,,,',
        '0614141000419,SKU-2,Bad check digit,GreenCo,,,,,,',
        '4006381333931,,,GreenCo,,ftp://x,,,,',
        '4006381333931,SKU-4,Repeat ok,GreenCo,,,10,101,maybe,',
      ),
      false,
    );

    expect(report.created).toBe(1);
    expect(report.failed).toBe(3);
    expect(report.errors.map((error) => error.row)).toEqual([3, 4, 5]);
    expect(report.errors[0].messages[0]).toMatch(/check digit/);
    expect(report.errors[1].messages).toEqual(
      expect.arrayContaining([
        'sku is required',
        'name is required',
        'imageUrl must start with http:// or https://',
      ]),
    );
    expect(report.errors[2].messages).toEqual(
      expect.arrayContaining([
        'recyclabilityPercent must be a whole number from 0 to 100',
        'verified must be true or false',
      ]),
    );
    expect(tx.product.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a GTIN or SKU repeated within the same file', async () => {
    const report = await service.import(
      csv(
        '0614141000418,SKU-1,Tee,GreenCo,,,,,,',
        '614141000418,SKU-2,Same GTIN as UPC-A,GreenCo,,,,,,',
        '4006381333931,SKU-1,Same SKU,GreenCo,,,,,,',
      ),
      true,
    );

    expect(report.errors).toEqual([
      expect.objectContaining({
        row: 3,
        messages: ['GTIN repeats line 2 of this file'],
      }),
      expect.objectContaining({
        row: 4,
        messages: ['SKU repeats line 2 of this file'],
      }),
    ]);
  });

  it('rejects a SKU that already belongs to a different product', async () => {
    prisma.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ gtin: '04006381333931', sku: 'SKU-1' }]);

    const report = await service.import(
      csv('0614141000418,SKU-1,Tee,GreenCo,,,,,,'),
      false,
    );

    expect(report.failed).toBe(1);
    expect(report.errors[0].messages[0]).toMatch(/already belongs/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing on a dry run but reports what would happen', async () => {
    const report = await service.import(
      csv('0614141000418,SKU-1,Tee,GreenCo,,,,,,'),
      true,
    );

    expect(report).toMatchObject({
      dryRun: true,
      created: 1,
      brandsCreated: ['GreenCo'],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a file missing required columns', async () => {
    await expect(
      service.import(Buffer.from('gtin,name\n0614141000418,Tee'), false),
    ).rejects.toThrow(/Missing required column\(s\): sku, brandName/);
  });

  it('rejects an empty file and unreadable CSV', async () => {
    await expect(
      service.import(Buffer.from(HEADER), false),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.import(Buffer.from('gtin,sku\n"unterminated,x'), false),
    ).rejects.toThrow(/Could not read the CSV/);
  });

  it('accepts its own template, including a UTF-8 BOM from Excel', async () => {
    const report = await service.import(
      Buffer.from('﻿' + IMPORT_TEMPLATE),
      true,
    );

    expect(report).toMatchObject({ totalRows: 1, created: 1, failed: 0 });
  });
});
