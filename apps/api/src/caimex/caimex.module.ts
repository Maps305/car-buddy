import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import caimexConfig from './caimex.config';
import { CaimexService } from './caimex.service';

@Module({
  imports: [ConfigModule.forFeature(caimexConfig)],
  providers: [CaimexService],
  exports: [CaimexService],
})
export class CaimexModule {}
