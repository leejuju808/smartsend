import { decrypt } from "@/lib/crypto";
import { buildUnsubHeaders } from "@/lib/unsub";

type OutlookProfile = {
  email: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
};

export async function outlookSend(params: {
  profile: OutlookProfile;
  to: string;
  subject: string;
  html: string;
  campaignId?: string | null;
}) {
  const token = decrypt(params.profile.access_token);

  // Build unsubscribe headers when campaign context is available
  const internetMessageHeaders: Array<{ name: string; value: string }> = [];
  if (params.campaignId) {
    const headers = buildUnsubHeaders(params.campaignId, params.to);
    const mailto = `mailto:${params.profile.email}?subject=Unsubscribe`;
    const combined = headers["List-Unsubscribe"]
      ? `<${mailto}>, ${headers["List-Unsubscribe"]}`
      : `<${mailto}>`;

    internetMessageHeaders.push({ name: "List-Unsubscribe", value: combined });

    if (headers["List-Unsubscribe-Post"]) {
      internetMessageHeaders.push({ name: "List-Unsubscribe-Post", value: headers["List-Unsubscribe-Post"] });
    }
  }

  // Use Microsoft Graph API directly with fetch
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: {
          contentType: "HTML",
          content: params.html
        },
        toRecipients: [{
          emailAddress: {
            address: params.to
          }
        }],
        from: {
          emailAddress: {
            address: params.profile.email
          }
        },
        ...(internetMessageHeaders.length > 0 && { internetMessageHeaders })
      },
      saveToSentItems: true
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error?.message || `Microsoft Graph API error: ${response.statusText}`);
  }
}

