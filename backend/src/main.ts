/** 진입점: 전역 검증 파이프, CORS(대시보드 5173), 스크린샷 정적 서빙, Swagger(/docs). */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configPath } from './config/config.module';

// .env를 직접 로드(Node 내장). Prisma가 우연히 읽어주는 동작에 기대지 않기 위함
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: 'http://localhost:5173' });

  // 실패 스크린샷은 config.yaml 위치 기준 screenshots/{logId}.png (CommentLog.screenshotPath와 같은 기준)
  app.useStaticAssets(resolve(dirname(resolve(configPath())), 'screenshots'), {
    prefix: '/screenshots/',
  });

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
