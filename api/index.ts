/**
 * Vercel Serverless Entry Point
 * Uses dynamic imports for better compatibility
 */

import { Request, Response } from 'express';

// Singleton instances for serverless warm starts
let db: any = null;
let webServerInstance: any = null;
let initialized = false;

async function initialize() {
  if (initialized && db && webServerInstance) {
    return { db, webServerInstance };
  }

  console.log('🚀 Initializing serverless function...');

  // Initialize database with Turso (trim to handle newlines from env vars)
  const dbUrl = (process.env.TURSO_DATABASE_URL || './data/fca.db').trim();
  const dbAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();

  console.log('📦 Connecting to database...');
  const { DatabaseClient } = await import('../src/database/client.js');
  db = new DatabaseClient(dbUrl, dbAuthToken);

  // Load configuration - use embedded config for serverless
  let config;
  try {
    const { embeddedConfig } = await import('../config/agent-config-embedded.js');
    config = embeddedConfig;
    console.log('📋 Config loaded from embedded module');
  } catch (error) {
    console.warn('⚠️ Using default config:', error);
    const { ConfigLoader } = await import('../src/core/config-loader.js');
    config = ConfigLoader.createDefault();
  }

  // Create digest builder
  const { DigestBuilder } = await import('../src/core/digest-builder.js');
  const digestBuilder = new DigestBuilder(db);

  // Chat configuration
  const chatConfig = {
    enabled: !!process.env.ANTHROPIC_API_KEY,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1024,
  };

  // Create web server
  const { WebServer } = await import('../src/web/web-server.js');
  webServerInstance = new WebServer(
    db,
    digestBuilder,
    undefined, // No email sender in serverless
    3000,
    undefined, // No gmail connector
    config,
    chatConfig
  );

  initialized = true;
  console.log('✅ Serverless initialization complete');

  return { db, webServerInstance };
}

// Main handler
export default async function handler(req: Request, res: Response) {
  // Health check - no initialization needed
  if (req.url === '/health') {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  try {
    const { webServerInstance } = await initialize();

    // Get the internal Express app from WebServer and forward request
    const internalApp = webServerInstance.getApp();
    internalApp(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
