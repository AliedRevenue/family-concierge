/**
 * Gmail Connector
 * Handles all Gmail API interactions
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: gmail_v1.Schema$MessagePart;
  raw?: string;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  data: string; // Base64 encoded
}

export class GmailConnector {
  private gmail: gmail_v1.Gmail;
  private auth: OAuth2Client;

  constructor(auth: OAuth2Client) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  /**
   * List messages matching query
   * Query syntax: https://support.google.com/mail/answer/7190
   */
  async listMessages(query: string, maxResults: number = 50): Promise<string[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    return response.data.messages?.map((m) => m.id!) || [];
  }

  /**
   * Get full message details
   */
  async getMessage(messageId: string): Promise<GmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      return response.data as GmailMessage;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get message headers
   */
  getHeader(message: GmailMessage, name: string): string | undefined {
    const header = message.payload.headers?.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value || undefined;
  }

  /**
   * Extract message body (text/plain or text/html)
   */
  getBody(message: GmailMessage): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};

    const extractBody = (part: gmail_v1.Schema$MessagePart) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        result.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        result.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }

      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    extractBody(message.payload);
    return result;
  }

  /**
   * Get attachments from message
   */
  async getAttachments(message: GmailMessage): Promise<GmailAttachment[]> {
    const attachments: GmailAttachment[] = [];

    const extractAttachments = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          data: '', // Will be fetched separately
        });
      }

      if (part.parts) {
        part.parts.forEach(extractAttachments);
      }
    };

    extractAttachments(message.payload);

    // Fetch attachment data
    for (const attachment of attachments) {
      const part = this.findPartByFilename(message.payload, attachment.filename);
      if (part?.body?.attachmentId) {
        const response = await this.gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: message.id!,
          id: part.body.attachmentId,
        });

        attachment.data = response.data.data || '';
      }
    }

    return attachments;
  }

  /**
   * Apply label to message
   */
  async addLabel(messageId: string, labelName: string): Promise<void> {
    // First, find or create the label
    const labelId = await this.getOrCreateLabel(labelName);

    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  }

  /**
   * Get or create a Gmail label
   */
  private async getOrCreateLabel(labelName: string): Promise<string> {
    const response = await this.gmail.users.labels.list({ userId: 'me' });
    const existingLabel = response.data.labels?.find((l) => l.name === labelName);

    if (existingLabel) {
      return existingLabel.id!;
    }

    // Create label
    const createResponse = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });

    return createResponse.data.id!;
  }

  /**
   * Forward a message to recipients
   * Includes original message as context
   */
  async forwardMessage(
    message: GmailMessage,
    forwardTo: string[],
    reason: string,
    subjectPrefix: string = '[FCA] ',
    includeOriginal: boolean = true
  ): Promise<void> {
    const originalSubject = this.getHeader(message, 'subject') || 'No Subject';
    const originalFrom = this.getHeader(message, 'from') || 'Unknown Sender';
    const originalDate = this.getHeader(message, 'date') || '';

    // Build forwarded message body
    const forwardedBody = this.buildForwardedBody(
      reason,
      originalFrom,
      originalDate,
      originalSubject,
      message
    );

    // Construct email
    const emailLines = [
      `To: ${forwardTo.join(', ')}`,
      `Subject: ${subjectPrefix}${originalSubject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      forwardedBody,
    ];

    // Encode as base64url
    const encodedMessage = Buffer.from(emailLines.join('\r\n'))
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

  /**
   * Build HTML body for forwarded message
   */
  private buildForwardedBody(
    reason: string,
    from: string,
    date: string,
    subject: string,
    message: GmailMessage
  ): string {
    const body = this.getBody(message);
    const originalContent = body.html || body.text || message.snippet;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .fca-header { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .fca-reason { color: #0066cc; font-weight: bold; margin-bottom: 10px; }
    .original-message { border-left: 3px solid #ccc; padding-left: 15px; margin-top: 20px; }
    .meta { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="fca-header">
    <div class="fca-reason">🤖 Family Concierge Agent Forwarded This Email</div>
    <div class="meta"><strong>Reason:</strong> ${reason}</div>
  </div>
  
  <div class="original-message">
    <div class="meta">
      <strong>From:</strong> ${from}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Subject:</strong> ${subject}
    </div>
    <hr>
    ${originalContent}
  </div>
  
  <hr style="margin-top: 30px;">
  <p style="color: #999; font-size: 0.85em;">
    This email was automatically forwarded by Family Concierge Agent because it matched your configured rules 
    but did not contain a calendar event. You can adjust forwarding settings in your agent configuration.
  </p>
</body>
</html>
`;
  }

  /**
   * Find part by filename
   */
  private findPartByFilename(
    part: gmail_v1.Schema$MessagePart,
    filename: string
  ): gmail_v1.Schema$MessagePart | undefined {
    if (part.filename === filename) {
      return part;
    }

    if (part.parts) {
      for (const subPart of part.parts) {
        const found = this.findPartByFilename(subPart, filename);
        if (found) return found;
      }
    }

    return undefined;
  }
}
