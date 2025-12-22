/**
 * Utility function to run reply detection on an email
 * 
 * @param emailText - The email content to analyze
 * @param leadId - The UUID of the lead to update
 * @returns Promise with the detection result
 */
export async function runReplyDetection(emailText: string, leadId: string) {
  const res = await fetch("/api/reply-detection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailText, leadId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Reply detection failed");
  }

  return res.json();
}












