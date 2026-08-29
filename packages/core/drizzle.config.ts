import type { Config } from 'drizzle-kit';

/** Migrations are generated and checked in: the map is the artifact, so the churn is recorded. */
export default {
  schema: './src/store/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
} satisfies Config;
