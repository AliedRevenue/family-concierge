/**
 * Full initialization test - tests everything step by step
 */

import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  const steps: string[] = [];

  try {
    steps.push('Starting full initialization test');

    // Step 1: Environment
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const dbAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
    steps.push(`Env: dbUrl=${dbUrl ? 'set' : 'missing'}, auth=${dbAuthToken ? 'set' : 'missing'}`);

    // Step 2: Import and create DatabaseClient
    steps.push('Creating DatabaseClient...');
    const { DatabaseClient } = await import('../src/database/client.js');
    const db = new DatabaseClient(dbUrl, dbAuthToken);
    steps.push('DatabaseClient created');

    // Step 3: Test database connection
    steps.push('Testing DB connection...');
    const conn = db.getConnection();
    const testResult = await conn.execute('SELECT 1 as test');
    steps.push(`DB connected: ${JSON.stringify(testResult.rows[0])}`);

    // Step 4: ConfigLoader
    steps.push('Loading ConfigLoader...');
    const { ConfigLoader } = await import('../src/core/config-loader.js');
    steps.push('ConfigLoader imported');

    steps.push('Creating default config...');
    const config = ConfigLoader.createDefault();
    steps.push(`Config created: keys=${Object.keys(config).join(',')}`);

    // Step 5: DigestBuilder
    steps.push('Creating DigestBuilder...');
    const { DigestBuilder } = await import('../src/core/digest-builder.js');
    const digestBuilder = new DigestBuilder(db);
    steps.push('DigestBuilder created');

    // Step 6: WebServer
    steps.push('Creating WebServer...');
    const { WebServer } = await import('../src/web/web-server.js');

    const chatConfig = {
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 1024,
    };

    const webServer = new WebServer(
      db,
      digestBuilder,
      undefined,
      3000,
      undefined,
      config,
      chatConfig
    );
    steps.push('WebServer created');

    // Step 7: Get Express app
    steps.push('Getting Express app...');
    const app = webServer.getApp();
    steps.push(`Express app obtained: ${typeof app}`);

    res.status(200).json({
      status: 'ok',
      steps,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      steps,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8) : undefined
    });
  }
}
