import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Setting up Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Messaging Management System')
    .setDescription('System for managing messages')
    .setVersion('1.0')
    .addTag('Messages')
    .addApiKey({ type: 'apiKey', name: 'user-role', in: 'header' }, 'user-role')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`);
  Logger.log(
    `Swagger documentation is available on: http://localhost:${port}/api/docs`,
  );
}

bootstrap().catch((error) => {
  Logger.error('Error during bootstrap:', error);
});
