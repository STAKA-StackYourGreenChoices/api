import { ValidationPipe } from '@nestjs/common';
import { configureApp } from './configure-app';

describe('configureApp', () => {
  const makeApp = () => ({
    useGlobalPipes: jest.fn(),
    enableCors: jest.fn(),
    enableShutdownHooks: jest.fn(),
  });

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('installs a whitelisting validation pipe', () => {
    const app = makeApp();
    configureApp(app as never);
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
  });

  it('enables shutdown hooks so SIGTERM drains in-flight requests', () => {
    const app = makeApp();
    configureApp(app as never);
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
  });

  it('parses CORS_ORIGINS into a list and drops empty entries', () => {
    process.env.CORS_ORIGINS = 'https://a.example.com,,https://b.example.com';
    const app = makeApp();
    configureApp(app as never);
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://a.example.com', 'https://b.example.com'],
      }),
    );
  });

  it('sends an empty origin list when CORS_ORIGINS is unset', () => {
    const app = makeApp();
    configureApp(app as never);
    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: [] }),
    );
  });
});
