import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { swaggerMultipartLogoRequestInterceptor } from './common/utils/swagger-multipart-formdata.util';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 5001;
  const prefix = configService.get<string>('app.apiPrefix') || 'api/v1';

  // * Security middleware
  app.enableCors({
    origin: true, // For dev, this allows all origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.use(cookieParser());

  // * Enable global validation
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away fields that aren't in the DTO
      forbidNonWhitelisted: true, // Throws an error if unknown fields are sent
      transform: true, // Automatically transforms payloads to DTO instances
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Essence Lab API')
    .setDescription(
      `API documentation for Essence Lab Backend. This documentation provides detailed information about all available endpoints, authentication methods, and data models used in the Essence Lab system.`,
    )
    .setVersion('1.0.0')
    .addBearerAuth() // * For JWT headers
    .addCookieAuth('refreshToken') // * Matches your cookie-parser setup
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Enhanced Swagger UI configuration
  SwaggerModule.setup('api-doc', app, document, {
    explorer: true,
    swaggerOptions: {
      showRequestDuration: true,
      persistAuthorization: true,
      defaultModelRendering: 'example',
      // ADD THIS to ensure your nested objects are expanded by default:
      defaultModelExpandDepth: 5,
      defaultModelsExpandDepth: 3,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      // * Add multipart form-data support
      requestInterceptor: swaggerMultipartLogoRequestInterceptor,
    },
  });

  // * ======= ROOT ENDPOINT =======
  app.getHttpAdapter().get('/', (req: Request, res: Response) => {
    res.send('Essence Lab Server');
  });

  // Enable shutdown hooks
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}/${prefix}`);
  logger.log(`Swagger UI is running on: http://localhost:${port}/api-doc`);
  await app.listen(port);
}
// bootstrap();
bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Error starting server', err);
  process.exit(1);
});
