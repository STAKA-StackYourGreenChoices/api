/**
 * Emits openapi.json. The file is committed, and CI fails if regenerating it
 * dirties the working tree — so the spec can never drift from the code.
 * Run with `pnpm openapi:generate`.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Startup API')
    // Pinned, not read from package.json: otherwise every version bump shows up
    // as a spec change and the contract diff becomes noise.
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2) + '\n');

  await app.close();
  console.log('Wrote openapi.json');
}

void generate();
