/**
 * Chat Handler
 * Handles natural language questions about family calendar and emails
 * Uses Claude API to interpret questions and format responses
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DatabaseClient } from '../database/client.js';
import type { GmailConnector } from './gmail-connector.js';
import type { AgentConfig } from '../types/index.js';

export interface ChatConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export interface ChatSource {
  type: 'event' | 'email' | 'newsletter';
  id: string;
  title: string;
  date?: string;
  gmailLink?: string;
}

export interface ChatAction {
  label: string;
  action?: string;
  url?: string;
  id?: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  actions: ChatAction[];
  tokens?: { input: number; output: number };
  error?: string;
}

interface QueryPlan {
  intent: 'find_event' | 'search_emails' | 'list_newsletters' | 'summarize' | 'general';
  entities: {
    activity?: string;
    person?: string;
    date?: string;
    dateRange?: { start: string; end: string };
    keywords?: string[];
  };
  searchLocal: boolean;
  searchGmail: boolean;
  gmailQuery?: string;
}

export class ChatHandler {
  private anthropic: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(
    private chatConfig: ChatConfig,
    private db: DatabaseClient,
    private gmail: GmailConnector,
    private agentConfig: AgentConfig
  ) {
    const apiKey = chatConfig.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for chat functionality');
    }

    this.anthropic = new Anthropic({ apiKey });
    this.model = chatConfig.model || 'claude-sonnet-4-20250514';
    this.maxTokens = chatConfig.maxTokens || 1024;
  }

  /**
   * Handle a natural language question
   */
  async handleQuestion(question: string, timezone?: string): Promise<ChatResponse> {
    try {
      // Step 1: Interpret the question
      const queryPlan = await this.interpretQuestion(question, timezone);

      // Step 2: Execute queries
      const results = await this.executeQueries(queryPlan);

      // Step 3: Format response
      const response = await this.formatResponse(question, queryPlan, results);

      return response;
    } catch (error) {
      console.error('[ChatHandler] Error:', error);
      return {
        answer: `I'm sorry, I encountered an error while processing your question. Please try again.`,
        sources: [],
        actions: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Use Claude to interpret the user's question
   */
  private async interpretQuestion(question: string, timezone?: string): Promise<QueryPlan> {
    const today = new Date().toISOString().split('T')[0];
    const familyMembers = this.agentConfig.packs
      .flatMap(p => p.config?.sources?.flatMap((s: any) => s.keywords || []) || [])
      .filter((k: string) => !k.includes(' ') && k.length > 2);

    const systemPrompt = `You are a family calendar assistant. Today is ${today}. Timezone: ${timezone || 'America/Los_Angeles'}.

Family members to look for: ${familyMembers.join(', ')}

Interpret the user's question and output ONLY valid JSON (no markdown, no explanation):
{
  "intent": "find_event" | "search_emails" | "list_newsletters" | "summarize" | "general",
  "entities": {
    "activity": "optional activity name like swim, soccer, piano",
    "person": "optional family member name",
    "date": "optional specific date in YYYY-MM-DD format",
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "keywords": ["optional", "search", "terms"]
  },
  "searchLocal": true,
  "searchGmail": false,
  "gmailQuery": "optional Gmail search query if needed"
}

Guidelines:
- "this Saturday" = next Saturday's date
- "next week" = dateRange from next Monday to Sunday
- "upcoming" or "coming up" = next 14 days
- For newsletters, set intent to "list_newsletters"
- Only set searchGmail: true if local data likely won't have the answer`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // Extract JSON from the response (handle potential markdown wrapping)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      return JSON.parse(jsonMatch[0]) as QueryPlan;
    } catch (parseError) {
      console.error('[ChatHandler] Failed to parse query plan:', text);
      // Fallback to a general search
      return {
        intent: 'general',
        entities: { keywords: question.split(' ').filter(w => w.length > 3) },
        searchLocal: true,
        searchGmail: false,
      };
    }
  }

  /**
   * Execute queries based on the query plan
   */
  private async executeQueries(plan: QueryPlan): Promise<any> {
    const results: any = {
      events: [],
      emails: [],
      newsletters: [],
    };

    if (plan.searchLocal) {
      // Search local events
      if (plan.intent === 'find_event' || plan.intent === 'summarize') {
        const allEvents = await this.db.getAllEvents() as any[];

        results.events = allEvents.filter((event: any) => {
          const eventIntent = typeof event.eventIntent === 'string'
            ? JSON.parse(event.eventIntent)
            : event.eventIntent;

          const title = (eventIntent?.title || '').toLowerCase();
          // Person might be in event metadata or title
          const person = (event.person || eventIntent?.title || '').toLowerCase();

          // Filter by activity
          if (plan.entities.activity) {
            if (!title.includes(plan.entities.activity.toLowerCase())) {
              return false;
            }
          }

          // Filter by person
          if (plan.entities.person) {
            if (!person.includes(plan.entities.person.toLowerCase())) {
              return false;
            }
          }

          // Filter by date
          if (plan.entities.date) {
            const eventDate = eventIntent?.startDateTime?.split('T')[0];
            if (eventDate !== plan.entities.date) {
              return false;
            }
          }

          // Filter by date range
          if (plan.entities.dateRange) {
            const eventDate = eventIntent?.startDateTime?.split('T')[0];
            if (!eventDate || eventDate < plan.entities.dateRange.start || eventDate > plan.entities.dateRange.end) {
              return false;
            }
          }

          return true;
        }).slice(0, 10);
      }

      // Search newsletters
      if (plan.intent === 'list_newsletters') {
        results.newsletters = await this.db.getNewsletters(10);
      }

      // Search pending emails
      if (plan.intent === 'search_emails' || plan.intent === 'general') {
        const pending = await this.db.getPendingApprovals('school');
        results.emails = pending.filter(email => {
          const subject = (email.subject || '').toLowerCase();
          const snippet = (email.snippet || '').toLowerCase();

          // Filter by keywords
          if (plan.entities.keywords && plan.entities.keywords.length > 0) {
            const hasKeyword = plan.entities.keywords.some(kw =>
              subject.includes(kw.toLowerCase()) || snippet.includes(kw.toLowerCase())
            );
            if (!hasKeyword) return false;
          }

          // Filter by person
          if (plan.entities.person) {
            if (!subject.includes(plan.entities.person.toLowerCase()) &&
                !snippet.includes(plan.entities.person.toLowerCase())) {
              return false;
            }
          }

          return true;
        }).slice(0, 10);
      }
    }

    // Search Gmail if needed
    if (plan.searchGmail && plan.gmailQuery) {
      try {
        const messageIds = await this.gmail.listMessages(plan.gmailQuery, 10);
        for (const msgId of messageIds.slice(0, 5)) {
          const message = await this.gmail.getMessage(msgId);
          if (message) {
            results.emails.push({
              id: msgId,
              subject: this.gmail.getHeader(message, 'subject'),
              from: this.gmail.getHeader(message, 'from'),
              date: this.gmail.getHeader(message, 'date'),
              snippet: message.snippet,
              fromGmail: true,
            });
          }
        }
      } catch (error) {
        console.error('[ChatHandler] Gmail search error:', error);
      }
    }

    return results;
  }

  /**
   * Use Claude to format a friendly response
   */
  private async formatResponse(
    question: string,
    plan: QueryPlan,
    results: any
  ): Promise<ChatResponse> {
    const systemPrompt = `You are a helpful family calendar assistant. Format a friendly, concise response to the user's question based on the data provided.

Guidelines:
- Be conversational but brief
- If no results found, say so helpfully
- Mention dates and times clearly
- If there are multiple results, summarize them
- Don't repeat the question back`;

    const dataContext = JSON.stringify({
      intent: plan.intent,
      events: results.events.map((e: any) => ({
        title: typeof e.eventIntent === 'string' ? JSON.parse(e.eventIntent).title : e.eventIntent?.title,
        date: typeof e.eventIntent === 'string' ? JSON.parse(e.eventIntent).startDateTime : e.eventIntent?.startDateTime,
        location: typeof e.eventIntent === 'string' ? JSON.parse(e.eventIntent).location : e.eventIntent?.location,
        person: e.person,
        status: e.status,
      })),
      emails: results.emails.map((e: any) => ({
        subject: e.subject,
        from: e.from_name || e.from_email || e.from,
        date: e.created_at || e.date,
        snippet: e.snippet?.substring(0, 100),
      })),
      newsletters: results.newsletters.map((n: any) => ({
        subject: n.subject,
        from: n.from_name || n.from_email,
        daysAgo: n.days_ago,
        isRead: n.is_read,
      })),
    }, null, 2);

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Question: ${question}\n\nData:\n${dataContext}` },
      ],
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text : '';

    // Build sources and actions
    const sources: ChatSource[] = [];
    const actions: ChatAction[] = [];

    // Add event sources
    for (const event of results.events.slice(0, 3)) {
      const eventIntent = typeof event.eventIntent === 'string'
        ? JSON.parse(event.eventIntent)
        : event.eventIntent;

      sources.push({
        type: 'event',
        id: event.id,
        title: eventIntent?.title || 'Event',
        date: eventIntent?.startDateTime,
        gmailLink: event.sourceMessageId
          ? `https://mail.google.com/mail/u/0/#inbox/${event.sourceMessageId}`
          : undefined,
      });
    }

    // Add email sources
    for (const email of results.emails.slice(0, 3)) {
      sources.push({
        type: 'email',
        id: email.id,
        title: email.subject || 'Email',
        date: email.created_at || email.date,
        gmailLink: email.message_id
          ? `https://mail.google.com/mail/u/0/#inbox/${email.message_id}`
          : undefined,
      });
    }

    // Add newsletter sources
    for (const newsletter of results.newsletters.slice(0, 3)) {
      sources.push({
        type: 'newsletter',
        id: newsletter.id,
        title: newsletter.subject || 'Newsletter',
        date: newsletter.created_at,
        gmailLink: newsletter.message_id
          ? `https://mail.google.com/mail/u/0/#inbox/${newsletter.message_id}`
          : undefined,
      });

      if (!newsletter.is_read) {
        actions.push({
          label: 'Mark as Read',
          action: 'markRead',
          id: newsletter.id,
        });
      }
    }

    return {
      answer,
      sources,
      actions,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}
