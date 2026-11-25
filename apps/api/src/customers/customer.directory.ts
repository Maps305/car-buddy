import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface InsuredVehicle {
  registration: string;
  make: string;
  model: string;
  year?: number;
}

export interface Customer {
  phone: string;
  firstName: string;
  surname: string;
  policyNumber: string;
  coverType: 'COMPREHENSIVE' | 'FULL_THIRD_PARTY' | 'THIRD_PARTY';
  vehicles: InsuredVehicle[];
}

const digits = (phone: string) => phone.replace(/\D/g, '');

@Injectable()
export class CustomerDirectory implements OnModuleInit {
  private readonly logger = new Logger(CustomerDirectory.name);
  private customers = new Map<string, Customer>();

  async onModuleInit(): Promise<void> {
    const file = resolve(process.env.DEMO_CUSTOMERS_FILE ?? './data/demo-customers.json');
    const list = JSON.parse(await readFile(file, 'utf8')) as Customer[];
    this.customers = new Map(list.map((c) => [digits(c.phone), c]));
    this.logger.log(`Loaded ${list.length} demo customers from ${file}`);
  }

  findByPhone(phone: string): Customer | undefined {
    return this.customers.get(digits(phone));
  }
}
