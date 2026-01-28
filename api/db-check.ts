/**
 * Check database contents
 */

import { Request, Response } from 'express';
import { createClient } from '@libsql/client';

export default async function handler(req: Request, res: Response) {
  try {
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    const client = createClient({ url: dbUrl, authToken });

    // Check pending_approvals count
    const countResult = await client.execute(
      'SELECT COUNT(*) as count FROM pending_approvals'
    );

    // Get last 5 pending approvals with all classification fields
    const recentResult = await client.execute(
      'SELECT id, pack_id, subject, person, approved, item_type, obligation_date, classification_reasoning, created_at FROM pending_approvals ORDER BY created_at DESC LIMIT 5'
    );

    // Check discovery sessions
    const sessionsResult = await client.execute(
      'SELECT id, pack_id, emails_scanned, status, started_at FROM discovery_sessions ORDER BY started_at DESC LIMIT 5'
    );

    res.status(200).json({
      status: 'ok',
      pendingApprovals: {
        total: countResult.rows[0]?.count,
        recent: recentResult.rows,
      },
      discoverySessions: sessionsResult.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
