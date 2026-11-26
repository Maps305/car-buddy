import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ClaimNotifier } from './claim-notifier';
import { ClaimsService } from './claims.service';

@Module({
  imports: [WhatsappModule],
  providers: [ClaimsService, ClaimNotifier],
  exports: [ClaimsService, ClaimNotifier],
})
export class ClaimsModule {}
