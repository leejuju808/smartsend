import type { Attachment } from "../mime";

export type SendArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromEmail: string;
  fromName?: string;
  accessToken: string;
  attachments?: Attachment[];
};

export interface EmailProvider {
  send(args: SendArgs): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}


