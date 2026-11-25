import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import whatsappConfig from './whatsapp.config';
import { WhatsappClient } from './whatsapp.client';

@Module({
  imports: [ConfigModule.forFeature(whatsappConfig)],
  providers: [WhatsappClient],
  exports: [WhatsappClient, ConfigModule],
})
export class WhatsappModule {}
