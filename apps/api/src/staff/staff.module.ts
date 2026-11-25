import { Module } from '@nestjs/common';
import { ClaimsModule } from '../claims/claims.module';
import { LocalMediaStore, MediaStore } from '../media/media.store';
import { StaffAuthGuard, StaffAuthService } from './staff-auth';
import { StaffClaimsService } from './staff-claims.service';
import { StaffAuthController, StaffController } from './staff.controller';

@Module({
  imports: [ClaimsModule],
  controllers: [StaffAuthController, StaffController],
  providers: [StaffAuthService, StaffAuthGuard, StaffClaimsService, { provide: MediaStore, useClass: LocalMediaStore }],
})
export class StaffModule {}
