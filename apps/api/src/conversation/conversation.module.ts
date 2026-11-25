import { Module } from '@nestjs/common';
import { CaimexModule } from '../caimex/caimex.module';
import { ClaimsModule } from '../claims/claims.module';
import { CustomerDirectory } from '../customers/customer.directory';
import { ExtractionModule } from '../extraction/extraction.module';
import { LocalMediaStore, MediaStore } from '../media/media.store';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ConversationService } from './conversation.service';
import { SessionStore } from './session.store';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [WhatsappModule, ExtractionModule, CaimexModule, ClaimsModule],
  controllers: [WebhookController],
  providers: [
    ConversationService,
    SessionStore,
    CustomerDirectory,
    { provide: MediaStore, useClass: LocalMediaStore },
  ],
})
export class ConversationModule {}
