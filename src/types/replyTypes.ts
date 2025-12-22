// Type definitions for reply detection system

export type ReplyType =
  | "Human Reply"
  | "Out of Office"
  | "Bounce / Delivery Failure"
  | "Automated System Message";

export interface ReplyDetectionResult {
  type: ReplyType;
  isHuman: boolean;
  confidence: number;
}

export interface ReplyLogEntry {
  id?: string;
  email_id?: string;
  campaign_id?: string;
  type: ReplyType;
  confidence: number;
  created_at?: string;
}

export interface EdgeFunctionRequest {
  email_id: string;
  subject: string;
  body: string;
  campaign_id: string;
}

