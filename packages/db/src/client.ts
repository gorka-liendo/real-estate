import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./env.js";
import * as schema from "./schema/index.js";

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema });

/** Cierra el pool — necesario en tests y scripts para que el proceso termine. */
export async function closeDb() {
  await pool.end();
}
