/** 진입점: 전역 검증 파이프, CORS(대시보드 5173), Swagger(/docs). */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: 'http://localhost:5173' });

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('YT Comment Agent')
      .setVersion('0.1')
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((e) => {
  // config 누락 등 기동 실패를 스택 대신 한 줄로 보여준다
  console.error(`기동 실패: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
