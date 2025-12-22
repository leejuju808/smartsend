// SMS Provider Integration for SmartSend
// Supports Twilio (primary) with extensibility for other providers

export interface SMSProviderConfig {
  provider: 'twilio' | 'nexmo' | 'telnyx';
  credentials: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    // For other providers
    apiKey?: string;
    apiSecret?: string;
  };
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  providerMessageId?: string;
}

export interface SMSRateLimit {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
}

/**
 * Send SMS via Twilio
 */
export async function sendSMSViaTwilio(
  to: string,
  message: string,
  fromNumber: string,
  accountSid: string,
  authToken: string
): Promise<SendSMSResult> {
  try {
    // Validate phone number format (E.164)
    const normalizedTo = normalizePhoneNumber(to);
    if (!normalizedTo) {
      return {
        success: false,
        error: 'Invalid phone number format',
      };
    }

    // Validate message length (SMS max 160 chars, longer messages become MMS)
    if (message.length > 1600) {
      return {
        success: false,
        error: 'Message too long (max 1600 characters)',
      };
    }

    // Call Twilio API
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append('To', normalizedTo);
    formData.append('From', fromNumber);
    formData.append('Body', message);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `Twilio API error: ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.sid,
      providerMessageId: data.sid,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error sending SMS',
    };
  }
}

/**
 * Send SMS via provider abstraction
 */
export async function sendSMS(
  to: string,
  message: string,
  config: SMSProviderConfig
): Promise<SendSMSResult> {
  const { provider, credentials } = config;

  switch (provider) {
    case 'twilio':
      if (!credentials.accountSid || !credentials.authToken || !credentials.phoneNumber) {
        return {
          success: false,
          error: 'Missing Twilio credentials (accountSid, authToken, phoneNumber)',
        };
      }
      return sendSMSViaTwilio(
        to,
        message,
        credentials.phoneNumber,
        credentials.accountSid,
        credentials.authToken
      );

    case 'nexmo':
      // TODO: Implement Nexmo provider
      return {
        success: false,
        error: 'Nexmo provider not yet implemented',
      };

    case 'telnyx':
      // TODO: Implement Telnyx provider
      return {
        success: false,
        error: 'Telnyx provider not yet implemented',
      };

    default:
      return {
        success: false,
        error: `Unknown SMS provider: ${provider}`,
      };
  }
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If it starts with +, assume it's already in E.164 format
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If it's 10 digits, assume US number and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // If it's 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // If it doesn't start with + and isn't a valid US format, return null
  return null;
}

/**
 * Validate SMS message content
 */
export function validateSMSMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (message.length > 1600) {
    return { valid: false, error: 'Message too long (max 1600 characters)' };
  }

  return { valid: true };
}

/**
 * Check if message should be sent based on time restrictions
 * V1 rules: No sending after 8pm or before 8am local time
 */
export function canSendSMSAtTime(
  phoneNumber: string,
  timezone?: string
): { allowed: boolean; reason?: string } {
  const now = new Date();
  
  // Default to UTC if no timezone provided
  const tz = timezone || 'America/New_York'; // Default to EST
  
  // Get local time for the phone number's timezone
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const hour = localTime.getHours();

  // No sending before 8am or after 8pm
  if (hour < 8) {
    return {
      allowed: false,
      reason: `Cannot send SMS before 8am local time (current: ${hour}:00)`,
    };
  }

  if (hour >= 20) {
    return {
      allowed: false,
      reason: `Cannot send SMS after 8pm local time (current: ${hour}:00)`,
    };
  }

  return { allowed: true };
}

/**
 * Detect SMS opt-out keywords
 */
export function detectOptOutKeywords(message: string): {
  isOptOut: boolean;
  keyword?: string;
} {
  const optOutKeywords = [
    'stop',
    'stopall',
    'cancel',
    'end',
    'quit',
    'unsubscribe',
    'optout',
    'opt out',
  ];

  const normalized = message.toLowerCase().trim();

  for (const keyword of optOutKeywords) {
    if (normalized === keyword || normalized.startsWith(keyword + ' ')) {
      return { isOptOut: true, keyword };
    }
  }

  return { isOptOut: false };
}

/**
 * Get SMS rate limits based on plan
 */
export function getSMSRateLimits(plan: 'starter' | 'growth' | 'domination'): SMSRateLimit {
  switch (plan) {
    case 'starter':
      return {
        maxPerMinute: 5,
        maxPerHour: 50,
        maxPerDay: 200,
      };
    case 'growth':
      return {
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 500,
      };
    case 'domination':
      return {
        maxPerMinute: 20,
        maxPerHour: 200,
        maxPerDay: 2000,
      };
    default:
      return {
        maxPerMinute: 1,
        maxPerHour: 10,
        maxPerDay: 50,
      };
  }
}




























































