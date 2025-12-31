/**
 * OAuth Server - Automatic OAuth flow with web callback
 * 
 * Starts a temporary Express server to handle OAuth callbacks,
 * automatically opens the browser, captures the authorization code,
 * and exchanges it for tokens.
 */

import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { writeFileSync } from 'fs';
import { exec } from 'child_process';
import { Server } from 'http';

interface OAuthServerOptions {
  oauth2Client: OAuth2Client;
  authUrl: string;
  tokenPath: string;
  port: number;
}

/**
 * Start OAuth authorization flow with automatic browser redirect
 */
export async function startOAuthServer(options: OAuthServerOptions): Promise<OAuth2Client> {
  const { oauth2Client, authUrl, tokenPath, port } = options;

  return new Promise((resolve, reject) => {
    const app = express();
    let server: Server;

    // Success page HTML
    const successPage = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 500px;
            }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #2d3748;
              margin-bottom: 1rem;
            }
            p {
              color: #718096;
              line-height: 1.6;
            }
            .close-note {
              margin-top: 2rem;
              padding-top: 2rem;
              border-top: 1px solid #e2e8f0;
              font-size: 0.9rem;
              color: #a0aec0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Authorization Successful!</h1>
            <p>
              Family Concierge Agent has been successfully authorized to access your Gmail and Calendar.
            </p>
            <p>
              You can close this window and return to your terminal.
            </p>
            <div class="close-note">
              The agent will now continue running...
            </div>
          </div>
        </body>
      </html>
    `;

    // Error page HTML
    const errorPage = (error: string) => `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 500px;
            }
            .error-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #c53030;
              margin-bottom: 1rem;
            }
            p {
              color: #718096;
              line-height: 1.6;
            }
            .error-details {
              background: #fff5f5;
              border: 1px solid #feb2b2;
              border-radius: 0.5rem;
              padding: 1rem;
              margin-top: 1.5rem;
              font-family: monospace;
              font-size: 0.9rem;
              color: #c53030;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Authorization Failed</h1>
            <p>
              There was an error during the authorization process.
            </p>
            <div class="error-details">
              ${error}
            </div>
            <p style="margin-top: 1.5rem;">
              Please check your terminal for more details and try again.
            </p>
          </div>
        </body>
      </html>
    `;

    // OAuth callback route
    app.get('/oauth/callback', async (req, res) => {
      const { code, error } = req.query;

      if (error) {
        console.error(`\n❌ OAuth error: ${error}`);
        res.send(errorPage(error as string));
        server.close();
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      if (!code || typeof code !== 'string') {
        console.error('\n❌ No authorization code received');
        res.send(errorPage('No authorization code received'));
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      try {
        console.log('✅ Authorization code received, exchanging for tokens...');

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Save tokens
        writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log(`✅ Tokens saved to ${tokenPath}`);

        // Send success page
        res.send(successPage);

        // Close server after a short delay
        setTimeout(() => {
          server.close();
          console.log('✅ OAuth server stopped\n');
          resolve(oauth2Client);
        }, 1000);
      } catch (err) {
        console.error('\n❌ Error exchanging code for tokens:', err);
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        res.send(errorPage(errorMsg));
        server.close();
        reject(err);
      }
    });

    // Start server
    server = app.listen(port, () => {
      console.log(`\n🌐 OAuth server started on http://localhost:${port}`);
      console.log('📖 Opening browser for authorization...\n');

      // Auto-open browser
      openBrowser(authUrl);
    });

    // Handle server errors
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${port} is already in use.`);
        console.error('Please close the application using that port or change GOOGLE_REDIRECT_URI in .env\n');
      } else {
        console.error('\n❌ OAuth server error:', err);
      }
      reject(err);
    });
  });
}

/**
 * Open URL in default browser (cross-platform)
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "" "${url}"`;
      break;
    default: // Linux/Unix
      command = `xdg-open "${url}"`;
      break;
  }

  exec(command, (error) => {
    if (error) {
      console.error('❌ Could not auto-open browser. Please open this URL manually:');
      console.error(`\n${url}\n`);
    }
  });
}
