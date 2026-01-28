/**
 * Step-by-step initialization test
 */

import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  const steps: string[] = [];

  try {
    steps.push('Starting');

    // Step 1: Environment
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const dbAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
    steps.push(`Env loaded: dbUrl=${dbUrl.substring(0, 20)}...`);

    // Step 2: Import DatabaseClient
    steps.push('Importing DatabaseClient...');
    const { DatabaseClient } = await import('../src/database/client.js');
    steps.push('DatabaseClient imported');

    // Step 3: Create DatabaseClient
    steps.push('Creating DatabaseClient...');
    const db = new DatabaseClient(dbUrl, dbAuthToken);
    steps.push('DatabaseClient created');

    // Step 4: Import MigrationRunner
    steps.push('Importing MigrationRunner...');
    const { MigrationRunner } = await import('../src/database/migrate.js');
    steps.push('MigrationRunner imported');

    // Step 5: Run migrations
    steps.push('Running migrations...');
    const migrationRunner = new MigrationRunner(db.getConnection());
    await migrationRunner.migrate();
    migrationRunner.close();
    steps.push('Migrations complete');

    // Step 6: Import ConfigLoader
    steps.push('Importing ConfigLoader...');
    const { ConfigLoader } = await import('../src/core/config-loader.js');
    steps.push('ConfigLoader imported');

    // Step 7: Load config
    steps.push('Loading config...');
    const config = ConfigLoader.createDefault();
    steps.push(`Config loaded: timezone=${config.settings.timezone}`);

    res.status(200).json({
      status: 'ok',
      steps
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      steps,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined
    });
  }
}
