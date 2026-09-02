import './instrument';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
