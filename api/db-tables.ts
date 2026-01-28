/**
 * Check what tables exist in the database
 */

import { Request, Response } from 'express';
import { createClient } from '@libsql/client';

export default async function handler(req: Request, res: Response) {
  try {
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    const client = createClient({ url: dbUrl, authToken });

    // Check what tables exist
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );

    // Check schema_migrations specifically
    let migrationsResult = null;
    try {
      migrationsResult = await client.execute(
        "SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
      );
    } catch (e) {
      migrationsResult = { error: 'Table does not exist' };
    }

    res.status(200).json({
      status: 'ok',
      tables: tablesResult.rows.map(r => r.name),
      migrations: migrationsResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
