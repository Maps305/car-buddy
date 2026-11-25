import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConversationModule } from './conversation/conversation.module';
import { DbModule } from './db/db.module';
import { StaffModule } from './staff/staff.module';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, ConversationModule, StaffModule],
  controllers: [HealthController],
})
export class AppModule {}
