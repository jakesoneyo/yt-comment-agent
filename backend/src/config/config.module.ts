/** AppConfig를 전역 DI 토큰으로 제공. 경로는 CONFIG_PATH 환경변수, 기본은 레포 루트의 config.yaml. */
import { Global, Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { AppConfig, loadConfig } from './app-config';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig =>
        loadConfig(
          process.env.CONFIG_PATH ?? resolve(process.cwd(), '../config.yaml'),
        ),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
