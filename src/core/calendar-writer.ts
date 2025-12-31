/**
 * Calendar Writer
 * Handles all Google Calendar API interactions
 */

import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { EventIntent } from '../types/index.js';

export class CalendarWriter {
  private calendar: calendar_v3.Calendar;
  private auth: OAuth2Client;

  constructor(auth: OAuth2Client) {
    this.auth = auth;
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    calendarId: string,
    event: EventIntent
  ): Promise<calendar_v3.Schema$Event> {
    const eventResource: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: event.startDateTime.split('T')[0] }
        : { dateTime: event.startDateTime, timeZone: event.timezone },
      end: event.allDay
        ? { date: event.endDateTime.split('T')[0] }
        : { dateTime: event.endDateTime, timeZone: event.timezone },
      attendees: event.guests?.map((email) => ({ email })),
      reminders: event.reminders
        ? {
            useDefault: false,
            overrides: event.reminders.map((minutes) => ({
              method: 'popup',
              minutes,
            })),
          }
        : undefined,
      colorId: event.color,
    };

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: eventResource,
    });

    return response.data;
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    calendarId: string,
    eventId: string,
    event: EventIntent
  ): Promise<calendar_v3.Schema$Event> {
    const eventResource: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.allDay
        ? { date: event.startDateTime.split('T')[0] }
        : { dateTime: event.startDateTime, timeZone: event.timezone },
      end: event.allDay
        ? { date: event.endDateTime.split('T')[0] }
        : { dateTime: event.endDateTime, timeZone: event.timezone },
      attendees: event.guests?.map((email) => ({ email })),
      reminders: event.reminders
        ? {
            useDefault: false,
            overrides: event.reminders.map((minutes) => ({
              method: 'popup',
              minutes,
            })),
          }
        : undefined,
      colorId: event.color,
    };

    const response = await this.calendar.events.update({
      calendarId,
      eventId,
      requestBody: eventResource,
    });

    return response.data;
  }

  /**
   * Get event by ID
   */
  async getEvent(calendarId: string, eventId: string): Promise<calendar_v3.Schema$Event | null> {
    try {
      const response = await this.calendar.events.get({
        calendarId,
        eventId,
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if event has been manually edited
   * Compares current calendar event with our stored intent
   */
  async detectManualEdits(
    calendarId: string,
    eventId: string,
    originalIntent: EventIntent
  ): Promise<Record<string, { before: unknown; after: unknown }> | null> {
    const current = await this.getEvent(calendarId, eventId);
    if (!current) return null;

    const changes: Record<string, { before: unknown; after: unknown }> = {};

    // Compare title
    if (current.summary !== originalIntent.title) {
      changes.title = { before: originalIntent.title, after: current.summary };
    }

    // Compare start time
    const currentStart = current.start?.dateTime || current.start?.date;
    if (currentStart !== originalIntent.startDateTime) {
      changes.startDateTime = { before: originalIntent.startDateTime, after: currentStart };
    }

    // Compare end time
    const currentEnd = current.end?.dateTime || current.end?.date;
    if (currentEnd !== originalIntent.endDateTime) {
      changes.endDateTime = { before: originalIntent.endDateTime, after: currentEnd };
    }

    // Compare location
    if (current.location !== originalIntent.location) {
      changes.location = { before: originalIntent.location, after: current.location };
    }

    // Compare description
    if (current.description !== originalIntent.description) {
      changes.description = { before: originalIntent.description, after: current.description };
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Delete event
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  /**
   * List events in date range
   */
  async listEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): Promise<calendar_v3.Schema$Event[]> {
    const response = await this.calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  }
}
