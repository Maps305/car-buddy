import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
const POOL = Symbol('PG_POOL');

@Injectable()
class PoolCloser implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: () => {
        if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
        return new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 5) });
      },
    },
    { provide: DB, inject: [POOL], useFactory: (pool: Pool): Database => drizzle(pool, { schema }) },
    PoolCloser,
  ],
  exports: [DB],
})
export class DbModule {}
