import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeGtin } from './gtin';
import { sustainabilityData } from './products.service';

export const IMPORT_COLUMNS = [
  'gtin',
  'sku',
  'name',
  'brandName',
  'description',
  'imageUrl',
  'carbonScoreGrams',
  'recyclabilityPercent',
  'verified',
  'certifierName',
] as const;

const REQUIRED_COLUMNS = ['gtin', 'sku', 'name', 'brandName'] as const;
const MAX_ROWS = 5000;

export const IMPORT_TEMPLATE =
  IMPORT_COLUMNS.join(',') +
  '\n' +
  '0614141000418,SKU-TEE-01,Organic Cotton Tee,GreenCo,Soft tee made from 100% organic cotton,https://example.com/tee.jpg,2100,80,true,Global Organic Textile Standard\n';

type Column = (typeof IMPORT_COLUMNS)[number];
type RawRow = Partial<Record<Column, string>>;

export class ImportRowErrorDto {
  @ApiProperty({
    description: 'Line number in the file (the header is line 1)',
  })
  row!: number;

  @ApiPropertyOptional() gtin?: string;
  @ApiProperty({ type: [String] }) messages!: string[];
}

export class ImportReportDto {
  @ApiProperty({ description: 'True when nothing was saved (preview only)' })
  dryRun!: boolean;

  @ApiProperty() totalRows!: number;
  @ApiProperty() created!: number;
  @ApiProperty() updated!: number;
  @ApiProperty() failed!: number;

  @ApiProperty({
    type: [String],
    description: 'Brands that did not exist and were (or would be) created',
  })
  brandsCreated!: string[];

  @ApiProperty({ type: [ImportRowErrorDto] }) errors!: ImportRowErrorDto[];
}

interface ValidRow {
  line: number;
  gtin: string;
  sku: string;
  name: string;
  brandName: string;
  description: string | null;
  imageUrl: string | null;
  sustainability: ReturnType<typeof sustainabilityData> | null;
}

/**
 * Bulk create/update of products from CSV, matched on GTIN.
 *
 * Every row is validated on its own. Valid rows are written in one
 * transaction; invalid rows are skipped and reported with their line number,
 * so an admin can fix just those lines and re-upload. Unknown brand names are
 * created on the fly.
 */
@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import(file: Buffer, dryRun: boolean): Promise<ImportReportDto> {
    const rows = this.parse(file);
    const errors: ImportRowErrorDto[] = [];
    const valid: ValidRow[] = [];
    const seenGtins = new Map<string, number>();
    const seenSkus = new Map<string, number>();

    rows.forEach((raw, index) => {
      const line = index + 2;
      const result = this.validateRow(raw);
      if ('messages' in result) {
        errors.push({
          row: line,
          gtin: raw.gtin?.trim() || undefined,
          messages: result.messages,
        });
        return;
      }

      const messages: string[] = [];
      const gtinLine = seenGtins.get(result.gtin);
      if (gtinLine) messages.push(`GTIN repeats line ${gtinLine} of this file`);
      const skuLine = seenSkus.get(result.sku);
      if (skuLine) messages.push(`SKU repeats line ${skuLine} of this file`);
      if (messages.length) {
        errors.push({ row: line, gtin: result.gtin, messages });
        return;
      }

      seenGtins.set(result.gtin, line);
      seenSkus.set(result.sku, line);
      valid.push({ ...result, line });
    });

    // One query each for the existing products and brands the file touches.
    const [byGtin, bySku, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: { gtin: { in: valid.map((row) => row.gtin) } },
        select: { id: true, gtin: true },
      }),
      this.prisma.product.findMany({
        where: { sku: { in: valid.map((row) => row.sku) } },
        select: { gtin: true, sku: true },
      }),
      this.prisma.brand.findMany({
        where: {
          name: { in: [...new Set(valid.map((row) => row.brandName))] },
        },
        select: { id: true, name: true },
      }),
    ]);
    const existingGtins = new Set(byGtin.map((product) => product.gtin));
    const skuOwner = new Map(
      bySku.map((product) => [product.sku, product.gtin]),
    );

    const writable = valid.filter((row) => {
      const owner = skuOwner.get(row.sku);
      if (owner && owner !== row.gtin) {
        errors.push({
          row: row.line,
          gtin: row.gtin,
          messages: [
            `SKU ${row.sku} already belongs to the product with GTIN ${owner}`,
          ],
        });
        return false;
      }
      return true;
    });

    const brandIds = new Map(brands.map((brand) => [brand.name, brand.id]));
    const brandsCreated = [
      ...new Set(
        writable
          .map((row) => row.brandName)
          .filter((name) => !brandIds.has(name)),
      ),
    ];
    const created = writable.filter(
      (row) => !existingGtins.has(row.gtin),
    ).length;
    errors.sort((a, b) => a.row - b.row);

    const report: ImportReportDto = {
      dryRun,
      totalRows: rows.length,
      created,
      updated: writable.length - created,
      failed: errors.length,
      brandsCreated,
      errors,
    };
    if (dryRun || writable.length === 0) return report;

    await this.prisma.$transaction(
      async (tx) => {
        for (const name of brandsCreated) {
          const brand = await tx.brand.create({
            data: { name },
            select: { id: true },
          });
          brandIds.set(name, brand.id);
        }

        for (const row of writable) {
          const fields = {
            sku: row.sku,
            name: row.name,
            description: row.description,
            imageUrl: row.imageUrl,
            brandId: brandIds.get(row.brandName)!,
          };
          const info = row.sustainability;
          await tx.product.upsert({
            where: { gtin: row.gtin },
            create: {
              gtin: row.gtin,
              ...fields,
              ...(info ? { sustainabilityInfo: { create: info } } : {}),
            },
            update: {
              ...fields,
              ...(info
                ? {
                    sustainabilityInfo: {
                      upsert: { create: info, update: info },
                    },
                  }
                : {}),
            },
          });
        }
      },
      { timeout: 60_000 },
    );

    return report;
  }

  private parse(file: Buffer): RawRow[] {
    let records: Record<string, string>[];
    try {
      records = parse(file, {
        columns: (header: string[]) => header.map((name) => name.trim()),
        bom: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      throw new BadRequestException(
        `Could not read the CSV: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (records.length === 0) {
      throw new BadRequestException('The CSV has no product rows');
    }
    if (records.length > MAX_ROWS) {
      throw new BadRequestException(
        `The CSV has ${records.length} rows; the limit is ${MAX_ROWS} per upload`,
      );
    }

    const headers = Object.keys(records[0]);
    const missing = REQUIRED_COLUMNS.filter(
      (column) => !headers.includes(column),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Missing required column(s): ${missing.join(', ')}. Download the template for the expected header.`,
      );
    }
    return records;
  }

  private validateRow(
    raw: RawRow,
  ): Omit<ValidRow, 'line'> | { messages: string[] } {
    const messages: string[] = [];
    const text = (column: Column) => raw[column]?.trim() ?? '';

    const gtinResult = normalizeGtin(text('gtin'));
    if (!gtinResult.ok) messages.push(`gtin: ${gtinResult.reason}`);

    const sku = text('sku');
    if (!sku) messages.push('sku is required');
    else if (sku.length > 64)
      messages.push('sku must be at most 64 characters');

    const name = text('name');
    if (!name) messages.push('name is required');
    else if (name.length > 200)
      messages.push('name must be at most 200 characters');

    const brandName = text('brandName');
    if (!brandName) messages.push('brandName is required');
    else if (brandName.length > 100)
      messages.push('brandName must be at most 100 characters');

    const description = text('description');
    if (description.length > 2000)
      messages.push('description must be at most 2000 characters');

    const imageUrl = text('imageUrl');
    if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) {
      messages.push('imageUrl must start with http:// or https://');
    }

    // Sustainability figures are all-or-nothing: either both numbers, or none.
    const carbon = text('carbonScoreGrams');
    const recyclability = text('recyclabilityPercent');
    let sustainability: ValidRow['sustainability'] = null;
    if (carbon || recyclability) {
      const carbonValue = Number(carbon);
      const recyclabilityValue = Number(recyclability);
      const verified = this.parseBoolean(text('verified'));
      if (!carbon || !Number.isInteger(carbonValue) || carbonValue < 0) {
        messages.push('carbonScoreGrams must be a whole number of 0 or more');
      }
      if (
        !recyclability ||
        !Number.isInteger(recyclabilityValue) ||
        recyclabilityValue < 0 ||
        recyclabilityValue > 100
      ) {
        messages.push(
          'recyclabilityPercent must be a whole number from 0 to 100',
        );
      }
      if (verified === null) {
        messages.push('verified must be true or false');
      }
      if (messages.length === 0 && verified !== null) {
        sustainability = sustainabilityData({
          carbonScoreGrams: carbonValue,
          recyclabilityPercent: recyclabilityValue,
          verified,
          certifierName: text('certifierName') || undefined,
        });
      }
    }

    if (messages.length || !gtinResult.ok) return { messages };
    return {
      gtin: gtinResult.gtin,
      sku,
      name,
      brandName,
      description: description || null,
      imageUrl: imageUrl || null,
      sustainability,
    };
  }

  /** Empty means "not verified"; anything unrecognised is an error. */
  private parseBoolean(value: string): boolean | null {
    const lower = value.toLowerCase();
    if (['', 'false', 'no', '0', 'n'].includes(lower)) return false;
    if (['true', 'yes', '1', 'y'].includes(lower)) return true;
    return null;
  }
}
