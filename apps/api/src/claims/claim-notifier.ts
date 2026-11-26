import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { claimEvents, claims, customers, vehicles } from '../db/schema';
import { WhatsappApiError, WhatsappClient } from '../whatsapp/whatsapp.client';
import type { ClaimMessageContext } from './claim-messages';

const GRAPH_ERRORS: Record<number, string> = {
  131047: 'More than 24 hours since the customer last messaged, so WhatsApp only allows an approved template',
  131030: "The customer's number is not on the test number's allowed recipient list",
  131026: 'WhatsApp could not deliver to this number',
};

export function deliveryFailure(err: unknown): string {
  if (err instanceof WhatsappApiError) {
    try {
      const { error } = JSON.parse(err.body) as { error?: { code?: number; message?: string } };
      if (error?.code && GRAPH_ERRORS[error.code]) return GRAPH_ERRORS[error.code];
      if (error?.message) return error.message;
    } catch {
      return `WhatsApp API ${err.status}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class ClaimNotifier {
  private readonly logger = new Logger(ClaimNotifier.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly whatsapp: WhatsappClient,
  ) {}

  async notify(claimId: string, compose: (c: ClaimMessageContext) => string): Promise<boolean> {
    try {
      const [c] = await this.db
        .select({
          phone: customers.phone,
          firstName: customers.firstName,
          reference: claims.reference,
          registration: vehicles.registration,
        })
        .from(claims)
        .innerJoin(customers, eq(customers.id, claims.customerId))
        .innerJoin(vehicles, eq(vehicles.id, claims.vehicleId))
        .where(eq(claims.id, claimId))
        .limit(1);
      if (!c) return false;

      const message = compose(c);
      try {
        await this.whatsapp.sendText(c.phone, message);
      } catch (err) {
        const reason = deliveryFailure(err);
        this.logger.warn(`Could not message the customer about ${c.reference}: ${reason}`);
        await this.record(claimId, 'CUSTOMER_NOTIFY_FAILED', { message, reason });
        return false;
      }
      await this.record(claimId, 'CUSTOMER_NOTIFIED', { message });
      return true;
    } catch (err) {
      this.logger.error(`Notification for claim ${claimId} failed`, err instanceof Error ? err.stack : err);
      return false;
    }
  }

  private async record(claimId: string, type: string, data: Record<string, unknown>): Promise<void> {
    await this.db.insert(claimEvents).values({ claimId, type, actorType: 'SYSTEM', data });
  }
}
