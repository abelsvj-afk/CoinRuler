/**
 * Notifier module - TypeScript migration
 * Send notifications via SMS (Twilio), Discord webhooks, and email
 */

import axios from 'axios';

export type NotificationChannel = 'discord' | 'sms' | 'email';

export interface NotificationPayload {
  channel: NotificationChannel;
  to?: string;
  subject?: string;
  body: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

// Initialize Twilio client if credentials available
let twilioClient: any = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const Twilio = require('twilio');
    twilioClient = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  } catch (e: any) {
    console.warn(
      'Twilio package not installed or failed to initialize:',
      e?.message || e
    );
  }
}

/**
 * Send SMS notification via Twilio
 */
export async function sendSms(
  to: string,
  body: string
): Promise<NotificationResult> {
  const result: NotificationResult = {
    success: false,
    channel: 'sms',
    timestamp: new Date(),
  };

  if (!twilioClient) {
    console.log(`[SMS - dryrun] to=${to} body=${body}`);
    result.error = 'Twilio not configured';
    return result;
  }

  try {
    const from = process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER;
    if (!from) {
      throw new Error('TWILIO_FROM not set');
    }

    const msg = await twilioClient.messages.create({ body, from, to });
    result.success = true;
    result.messageId = msg.sid;
    return result;
  } catch (e: any) {
    console.error('sendSms failed:', e?.message || e);
    result.error = e?.message || 'SMS send failed';
    return result;
  }
}

/**
 * Send notification to Discord via webhook
 */
export async function sendDiscordWebhook(
  body: string | object
): Promise<NotificationResult> {
  const result: NotificationResult = {
    success: false,
    channel: 'discord',
    timestamp: new Date(),
  };

  const url =
    process.env.DISCORD_MONITOR_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;

  if (!url) {
    console.log('[DiscordWebhook - dryrun]', body);
    result.error = 'Discord webhook not configured';
    return result;
  }

  try {
    const content = typeof body === 'string' ? body : JSON.stringify(body);
    await axios.post(url, { content });
    result.success = true;
    return result;
  } catch (e: any) {
    console.error('sendDiscordWebhook failed:', e?.message || e);
    result.error = e?.message || 'Discord webhook failed';
    return result;
  }
}

/**
 * Send email notification (placeholder for future implementation)
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<NotificationResult> {
  const result: NotificationResult = {
    success: false,
    channel: 'email',
    timestamp: new Date(),
  };

  // Placeholder - implement with SendGrid, AWS SES, or nodemailer
  console.log(`[Email - dryrun] to=${to} subject=${subject} body=${body}`);
  result.error = 'Email not yet implemented';
  return result;
}

/**
 * Universal notification dispatcher
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<NotificationResult> {
  switch (payload.channel) {
    case 'sms':
      if (!payload.to) {
        return {
          success: false,
          channel: 'sms',
          error: 'Recipient (to) required for SMS',
          timestamp: new Date(),
        };
      }
      return sendSms(payload.to, payload.body);

    case 'discord':
      return sendDiscordWebhook(payload.body);

    case 'email':
      if (!payload.to) {
        return {
          success: false,
          channel: 'email',
          error: 'Recipient (to) required for email',
          timestamp: new Date(),
        };
      }
      return sendEmail(payload.to, payload.subject || 'Notification', payload.body);

    default:
      return {
        success: false,
        channel: payload.channel,
        error: 'Unknown notification channel',
        timestamp: new Date(),
      };
  }
}

/**
 * Send notifications to multiple channels
 */
export async function sendMultiChannelNotification(
  body: string,
  channels: NotificationChannel[] = ['discord']
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  for (const channel of channels) {
    const result = await sendNotification({ channel, body });
    results.push(result);
  }

  return results;
}
