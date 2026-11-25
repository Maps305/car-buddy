import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/staff/password';

interface SeedCustomer {
  phone: string;
  firstName: string;
  surname: string;
  email?: string;
  policyNumber: string;
  coverType: 'COMPREHENSIVE' | 'FULL_THIRD_PARTY' | 'THIRD_PARTY';
  vehicles: {
    registration: string;
    make: string;
    model: string;
    year?: number;
    odometerKm?: number;
    lastServiceKm?: number;
    serviceIntervalKm?: number;
  }[];
}

function assertNoDuplicates(seed: SeedCustomer[]) {
  const seen = new Map<string, string>();
  for (const c of seed) {
    const keys = [`policy ${c.policyNumber}`, ...c.vehicles.map((v) => `vehicle ${v.registration.toUpperCase()}`)];
    for (const key of keys) {
      const owner = seen.get(key);
      if (owner && owner !== c.phone) throw new Error(`${key} is listed under both ${owner} and ${c.phone}`);
      seen.set(key, c.phone);
    }
  }
}

interface SeedStaff {
  name: string;
  email: string;
  role: 'PROCESSOR' | 'ASSESSOR' | 'ADMIN';
}

async function seedStaff(db: ReturnType<typeof drizzle<typeof schema>>) {
  const file = resolve(process.env.DEMO_STAFF_FILE ?? './data/demo-staff.json');
  const staff = JSON.parse(await readFile(file, 'utf8')) as SeedStaff[];
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set SEED_STAFF_PASSWORD (8+ characters) to seed staff accounts');
  for (const s of staff) {
    const email = s.email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    await db
      .insert(schema.staffUsers)
      .values({ name: s.name, email, role: s.role, passwordHash })
      .onConflictDoUpdate({ target: schema.staffUsers.email, set: { name: s.name, role: s.role, passwordHash, active: true } });
    console.log(`Seeded staff ${s.name} <${email}> as ${s.role}`);
  }
}

async function main() {
  const file = resolve(process.argv[2] ?? process.env.DEMO_CUSTOMERS_FILE ?? './data/demo-customers.json');
  const seed = JSON.parse(await readFile(file, 'utf8')) as SeedCustomer[];
  assertNoDuplicates(seed);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  await db.transaction(async (tx) => {
    for (const c of seed) {
      const phone = c.phone.replace(/\D/g, '');
      const [customer] = await tx
        .insert(schema.customers)
        .values({ phone, firstName: c.firstName, surname: c.surname, email: c.email })
        .onConflictDoUpdate({
          target: schema.customers.phone,
          set: { firstName: c.firstName, surname: c.surname, email: c.email },
        })
        .returning();

      const [existingPolicy] = await tx
        .select({ customerId: schema.policies.customerId })
        .from(schema.policies)
        .where(eq(schema.policies.policyNumber, c.policyNumber));
      if (existingPolicy && existingPolicy.customerId !== customer.id) {
        throw new Error(`Policy ${c.policyNumber} already belongs to another customer; give ${phone} its own policy number`);
      }

      const [policy] = await tx
        .insert(schema.policies)
        .values({ customerId: customer.id, policyNumber: c.policyNumber, coverType: c.coverType })
        .onConflictDoUpdate({
          target: schema.policies.policyNumber,
          set: { customerId: customer.id, coverType: c.coverType, active: true },
        })
        .returning();

      for (const v of c.vehicles) {
        const [existingVehicle] = await tx
          .select({ customerId: schema.vehicles.customerId })
          .from(schema.vehicles)
          .where(eq(schema.vehicles.registration, v.registration.toUpperCase()));
        if (existingVehicle && existingVehicle.customerId !== customer.id) {
          throw new Error(`Vehicle ${v.registration} already belongs to another customer`);
        }
        const values = { customerId: customer.id, policyId: policy.id, ...v, registration: v.registration.toUpperCase() };
        await tx.insert(schema.vehicles).values(values).onConflictDoUpdate({ target: schema.vehicles.registration, set: values });
      }
      console.log(`Seeded ${c.firstName} ${c.surname} (${phone}) with ${c.vehicles.length} vehicle(s)`);
    }
  });

  await seedStaff(db);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
