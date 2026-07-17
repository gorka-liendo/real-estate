import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema });
