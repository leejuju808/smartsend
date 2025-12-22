export type Provider = "gmail" | "outlook";

export type SendArgs = {
  orgId: string;
  to: string;
  subject: string;
  body: string;
  thread?: { // optional threading hints
    messageId?: string;    // last inbound message-id (for Gmail headers)
    provider?: Provider;   // lock provider if known
  };
};

