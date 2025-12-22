// Block 9900 - Shared helper to send email using sending account
// Routes to appropriate provider sender (Gmail / Outlook)

import { sendGmail } from "./sendGmail.ts";
import { sendOutlook } from "./sendOutlook.ts";

export async function sendWithAccount(
  account: any,
  params: { to: string; subject: string; htmlBody: string }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (account.provider === "gmail") {
      await sendGmail(account, params);
      return { success: true };
    }
    
    if (account.provider === "outlook") {
      await sendOutlook(account, params);
      return { success: true };
    }
    
    throw new Error(`Unsupported provider: ${account.provider}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}


































































