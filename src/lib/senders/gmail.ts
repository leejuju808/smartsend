// Gmail Sender Shim
// Placeholder for real Gmail API implementation

export type SendJob = {
  org_id: string;
  to_email: string;
  subject: string;
  body: string;
  from_email?: string;
};

export async function sendGmail(job: SendJob): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  // TODO: Implement with OAuth2 stored tokens per org + Gmail send endpoint
  // 
  // Implementation should:
  // 1. Fetch OAuth2 tokens for the org from your database
  // 2. Refresh token if needed
  // 3. Use Gmail API to send email
  // 4. Return message_id or error
  
  console.log("Gmail sender (placeholder) - would send to:", job.to_email);
  return { ok: true };
}
