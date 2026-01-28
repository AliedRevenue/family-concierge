/**
 * Database connection test endpoint
 */

import { Request, Response } from 'express';
import { createClient } from '@libsql/client';

export default async function handler(req: Request, res: Response) {
  try {
    const dbUrl = process.env.TURSO_DATABASE_URL || '';
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl) {
      res.status(500).json({ error: 'TURSO_DATABASE_URL not set' });
      return;
    }

    // Debug: show URL info
    const urlInfo = {
      raw: dbUrl,
      length: dbUrl.length,
      startsWithLibsql: dbUrl.startsWith('libsql://'),
      trimmed: dbUrl.trim(),
    };

    console.log('URL info:', urlInfo);

    const client = createClient({
      url: dbUrl.trim(),
      authToken: authToken?.trim(),
    });

    // Try a simple query
    const result = await client.execute('SELECT 1 as test');

    res.status(200).json({
      status: 'ok',
      database: 'connected',
      testQuery: result.rows[0],
      urlInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      urlDebug: {
        raw: process.env.TURSO_DATABASE_URL,
        length: process.env.TURSO_DATABASE_URL?.length,
      }
    });
  }
}
