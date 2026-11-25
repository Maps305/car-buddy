import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { customers, policies, vehicles } from '../db/schema';

export interface InsuredVehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
}

export interface Customer {
  id: string;
  phone: string;
  firstName: string;
  surname: string;
  policy: { id: string; policyNumber: string; coverType: 'COMPREHENSIVE' | 'FULL_THIRD_PARTY' | 'THIRD_PARTY' };
  vehicles: InsuredVehicle[];
}

const digits = (phone: string) => phone.replace(/\D/g, '');

@Injectable()
export class CustomerDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByPhone(phone: string): Promise<Customer | undefined> {
    const [customer] = await this.db.select().from(customers).where(eq(customers.phone, digits(phone))).limit(1);
    if (!customer) return undefined;

    const [policy] = await this.db
      .select()
      .from(policies)
      .where(and(eq(policies.customerId, customer.id), eq(policies.active, true)))
      .orderBy(desc(policies.createdAt))
      .limit(1);
    if (!policy) return undefined;

    const insured = await this.db
      .select({
        id: vehicles.id,
        registration: vehicles.registration,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
      })
      .from(vehicles)
      .where(eq(vehicles.policyId, policy.id));

    return {
      id: customer.id,
      phone: customer.phone,
      firstName: customer.firstName,
      surname: customer.surname,
      policy: { id: policy.id, policyNumber: policy.policyNumber, coverType: policy.coverType },
      vehicles: insured,
    };
  }
}
