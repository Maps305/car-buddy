import { Module } from '@nestjs/common';
import { CaimexModule } from '../caimex/caimex.module';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [CaimexModule],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
