import crypto from 'crypto';

const SECRET = process.env.UNSUB_SECRET || "dev_unsub_secret_change_me";

export function makeUnsubToken(email: string) {
  const data = `${email}:${Date.now()}:${SECRET}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function parseUnsubToken(token: string): string | null {
  try {
    // For now, we'll need to store the email-token mapping in the database
    // This is a simplified version - in production you'd want to use JWT
    // or store the mapping in a secure way
    return null; // This will be handled by the database lookup
  } catch { 
    return null; 
  }
} 