import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'
import * as schema from './schema.ts'

const client = postgres(config.databaseUrl, { max: 5, onnotice: () => {} })
export const db = drizzle(client, { schema })

export const pingDb = () => client`select 1`

export async function migrateDb() {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
}
