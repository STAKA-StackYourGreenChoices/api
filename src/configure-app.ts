import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Everything that shapes request handling lives here, NOT in main.ts.
 *
 * `Test.createTestingModule(...).createNestApplication()` does not pick up
 * globals configured in main.ts. Sharing this function between main.ts and the
 * E2E bootstrap is what stops the E2E suite from testing a different
 * application than the one that gets deployed.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown properties outright rather than silently stripping them,
      // so a client sending a typo'd field learns about it.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  // Required for graceful Docker stops: without it SIGTERM never reaches Nest's
  // shutdown hooks and in-flight requests are killed rather than drained.
  app.enableShutdownHooks();

  return app;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Startup API')
    .setVersion(process.env.npm_package_version ?? '0.0.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
