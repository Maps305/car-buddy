import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentStaff, Roles, StaffAuthGuard, StaffAuthService, type StaffPrincipal } from './staff-auth';
import { parseStatuses, STAFF_ACTIONS, StaffClaimsService, type StaffAction } from './staff-claims.service';

const loginBody = z.object({ email: z.email(), password: z.string().min(1).max(200) });

@Controller('staff')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const parsed = loginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter your email and password');
    return this.auth.login(parsed.data.email, parsed.data.password);
  }
}

@Controller('staff')
@UseGuards(StaffAuthGuard)
export class StaffController {
  constructor(private readonly claims: StaffClaimsService) {}

  @Get('me')
  me(@CurrentStaff() staff: StaffPrincipal) {
    return staff;
  }

  @Get('assessors')
  @Roles('PROCESSOR', 'ADMIN')
  assessors() {
    return this.claims.assessors();
  }

  @Get('claims')
  queue(@CurrentStaff() staff: StaffPrincipal, @Query('status') status?: string, @Query('mine') mine?: string) {
    return this.claims.queue(staff, parseStatuses(status), mine === 'true');
  }

  @Get('claims/:id')
  async detail(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const detail = await this.claims.detail(staff, id);
    await this.claims.markSeen(staff, id);
    return detail;
  }

  @Get('claims/:id/documents/:documentId/file')
  async file(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    const { data, mimeType } = await this.claims.documentFile(staff, id, documentId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  }

  @Post('claims/:id/actions/:action')
  @HttpCode(200)
  act(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    if (!(STAFF_ACTIONS as readonly string[]).includes(action)) throw new NotFoundException(`Unknown action ${action}`);
    return this.claims.act(staff, id, action as StaffAction, body);
  }
}
