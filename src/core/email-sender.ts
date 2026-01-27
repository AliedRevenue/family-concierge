/**
 * Email Sender
 * Sends emails via Gmail API (multipart HTML + text)
 */

import type { gmail_v1 } from 'googleapis';
import type { Digest } from '../types/index.js';

export interface EmailMessage {
  to: string;
  subject: string;
  textContent: string;
  htmlContent: string;
}

export class EmailSender {
  constructor(private gmail: gmail_v1.Gmail) {}

  /**
   * Send a digest email to one or multiple recipients
   */
  async sendDigest(digest: Digest, recipients: string | string[], textContent: string, htmlContent: string): Promise<void> {
    const startDate = new Date(digest.period.startDate).toLocaleDateString();
    const endDate = new Date(digest.period.endDate).toLocaleDateString();
    const subject = `Family Ops Digest: ${startDate} - ${endDate}`;

    // Handle both single string and array of strings
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];

    // Send to each recipient
    for (const recipient of recipientList) {
      await this.sendEmail({
        to: recipient,
        subject,
        textContent,
        htmlContent,
      });
      console.log(`✓ Digest sent to ${recipient}`);
    }
  }

  /**
   * Send approval notification email
   */
  async sendApprovalNotification(recipient: string, eventTitle: string, approvalUrl: string): Promise<void> {
    const subject = `Action Required: Approve "${eventTitle}"`;
    const textContent = `
A new calendar event needs your approval:

Event: ${eventTitle}

Click to approve: ${approvalUrl}

This link expires in 2 hours.

---
Family Ops
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 500px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f9fafb;
      border-radius: 8px;
      padding: 30px;
      border: 2px solid #2563eb;
    }
    h2 {
      color: #2563eb;
      margin-top: 0;
    }
    .event-title {
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0;
      padding: 15px;
      background-color: white;
      border-radius: 6px;
    }
    .approve-btn {
      display: inline-block;
      margin-top: 20px;
      padding: 12px 24px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>⚠️  Action Required</h2>
    <p>A new calendar event needs your approval:</p>
    <div class="event-title">${eventTitle}</div>
    <a href="${approvalUrl}" class="approve-btn">Approve Event</a>
    <div class="footer">
      <p>This link expires in 2 hours.</p>
      <p>Family Ops - Keeping your family organized</p>
    </div>
  </div>
</body>
</html>
`.trim();

    await this.sendEmail({
      to: recipient,
      subject,
      textContent,
      htmlContent,
    });
  }

  /**
   * Send a custom email to one or multiple recipients
   * Used for upcoming digests and other custom notifications
   */
  async sendCustomEmail(
    recipients: string | string[],
    subject: string,
    textContent: string,
    htmlContent: string
  ): Promise<void> {
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];

    for (const recipient of recipientList) {
      await this.sendEmail({
        to: recipient,
        subject,
        textContent,
        htmlContent,
      });
      console.log(`✓ Email sent to ${recipient}`);
    }
  }

  /**
   * Send error alert email
   */
  async sendErrorAlert(recipient: string, errorMessage: string, context: string): Promise<void> {
    const subject = `Family Ops Error Alert`;
    const textContent = `
An error occurred in Family Ops:

${errorMessage}

Context: ${context}

Please check the logs for more details.

---
Family Ops
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 500px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #fef2f2;
      border-radius: 8px;
      padding: 30px;
      border: 2px solid #dc2626;
    }
    h2 {
      color: #dc2626;
      margin-top: 0;
    }
    .error-box {
      background-color: white;
      padding: 15px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      margin: 20px 0;
      overflow-x: auto;
    }
    .context {
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>❌ Error Alert</h2>
    <p>An error occurred in Family Ops:</p>
    <div class="error-box">${errorMessage}</div>
    <p class="context"><strong>Context:</strong> ${context}</p>
    <p>Please check the logs for more details.</p>
  </div>
</body>
</html>
`.trim();

    await this.sendEmail({
      to: recipient,
      subject,
      textContent,
      htmlContent,
    });
  }

  /**
   * Send a multipart (text + HTML) email via Gmail API
   */
  private async sendEmail(message: EmailMessage): Promise<void> {
    const { to, subject, textContent, htmlContent } = message;

    // Build multipart/alternative message
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      textContent,
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlContent,
      '',
      `--${boundary}--`,
    ];

    const rawMessage = messageParts.join('\r\n');
    
    // Encode in base64url format (required by Gmail API)
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
  }
}
