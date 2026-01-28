/**
 * Discover endpoint - triggers email scanning
 * Can be called manually or via Vercel cron
 */

import { Request, Response } from 'express';
import { google } from 'googleapis';
import type { Pack } from '../src/types/index.js';

export default async function handler(req: Request, res: Response) {
  const startTime = Date.now();
  const results: string[] = [];

  try {
    results.push('Starting discovery...');

    // Check for required environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
    const dbUrl = process.env.TURSO_DATABASE_URL?.trim();
    const dbAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

    // Validate required credentials
    const missing: string[] = [];
    if (!clientId) missing.push('GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
    if (!refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');
    if (!dbUrl) missing.push('TURSO_DATABASE_URL');

    if (missing.length > 0) {
      res.status(500).json({
        status: 'error',
        error: 'Missing required environment variables',
        missing,
        hint: 'GOOGLE_REFRESH_TOKEN must be obtained via OAuth flow locally, then added to Vercel env vars',
      });
      return;
    }

    results.push('Environment variables validated');

    // Create OAuth client with refresh token
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    results.push('OAuth client created');

    // Import Gmail connector dynamically
    const { GmailConnector } = await import('../src/core/gmail-connector.js');
    const gmail = new GmailConnector(oauth2Client);
    results.push('Gmail connector created');

    // Create a simple DB adapter for discovery
    const { DatabaseClient } = await import('../src/database/client.js');
    const dbClient = new DatabaseClient(dbUrl!, dbAuthToken);
    results.push('Database client created');

    // Load embedded config
    const { embeddedConfig } = await import('../config/agent-config-embedded.js');
    results.push('Config loaded');

    // Import packs
    const { SchoolPack, ActivitiesPack } = await import('../src/packs/index.js');
    const packs: Record<string, Pack> = {
      school: SchoolPack,
      activities: ActivitiesPack,
    };

    // Parameters from query string
    const packId = (req.query.packId as string) || 'school';
    const lookbackDays = parseInt(req.query.lookbackDays as string) || 21;

    results.push(`Running discovery for pack: ${packId}, lookback: ${lookbackDays} days`);

    // Get pack definition
    const pack = packs[packId];
    if (!pack) {
      res.status(400).json({
        status: 'error',
        error: `Unknown pack: ${packId}`,
        availablePacks: Object.keys(packs),
      });
      return;
    }

    // Get user config for this pack
    const packConfig = embeddedConfig.packs.find((p: { packId: string }) => p.packId === packId);
    const userConfig = packConfig?.config;

    results.push(`Pack found: ${pack.name}`);
    results.push(`User config sources: ${userConfig?.sources?.length || 0}`);

    // Import and create logger
    const { Logger } = await import('../src/utils/logger.js');
    const logger = new Logger(dbClient);

    // Import discovery engine dynamically
    const { DiscoveryEngine } = await import('../src/core/discovery-engine.js');

    // Create discovery engine
    const discoveryEngine = new DiscoveryEngine(gmail, dbClient, logger, anthropicKey);

    // Run discovery
    results.push('Starting email scan...');
    const session = await discoveryEngine.runDiscovery(pack, lookbackDays, userConfig);

    const duration = Date.now() - startTime;

    res.status(200).json({
      status: 'ok',
      sessionId: session.id,
      packId: session.packId,
      emailsScanned: session.emailsScanned,
      evidenceFound: session.output?.evidence?.length || 0,
      stats: session.output?.stats,
      duration: `${duration}ms`,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Discovery error:', error);

    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      results,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  }
}
