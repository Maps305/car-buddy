import {
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { DB, type Database } from '../db/db.module';
import { staffUsers, type StaffRole } from '../db/schema';
import { verifyPassword } from './password';

export interface StaffPrincipal {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

type StaffRequest = Request & { staff?: StaffPrincipal };

const ROLES_KEY = 'staffRoles';
const TOKEN_TTL = '12h';

export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentStaff = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): StaffPrincipal => ctx.switchToHttp().getRequest<StaffRequest>().staff!,
);

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(secret);
}

@Injectable()
export class StaffAuthService {
  private readonly key = secretKey();

  constructor(@Inject(DB) private readonly db: Database) {}

  async login(email: string, password: string): Promise<{ token: string; user: StaffPrincipal }> {
    const [user] = await this.db
      .select()
      .from(staffUsers)
      .where(and(eq(staffUsers.email, email.trim().toLowerCase()), eq(staffUsers.active, true)))
      .limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const principal: StaffPrincipal = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = await new SignJWT({ name: user.name, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(this.key);
    return { token, user: principal };
  }

  async verify(token: string): Promise<StaffPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      return {
        id: payload.sub!,
        name: String(payload.name),
        email: String(payload.email),
        role: payload.role as StaffRole,
      };
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
  }
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<StaffRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    req.staff = await this.auth.verify(header.slice('Bearer '.length));

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(req.staff.role)) throw new ForbiddenException();
    return true;
  }
}
