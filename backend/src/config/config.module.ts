/** AppConfig를 전역 DI 토큰으로 제공. 경로는 CONFIG_PATH 환경변수, 기본은 레포 루트의 config.yaml. */
import { Global, Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { AppConfig, loadConfig } from './app-config';

export const APP_CONFIG = 'APP_CONFIG';

/** config.yaml 경로. 프로필 폴더·스크린샷 경로를 이 파일 위치 기준으로 해석하므로 공개한다. */
export function configPath(): string {
  return process.env.CONFIG_PATH ?? resolve(process.cwd(), '../config.yaml');
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(configPath()),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
