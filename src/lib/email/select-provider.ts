import GmailProvider from "./gmail";
import OutlookProvider from "./outlook";
import type { EmailProvider } from "./providers";

export function getProvider(name: string): EmailProvider {
  if (name === "gmail") return new GmailProvider();
  if (name === "outlook") return new OutlookProvider();
  throw new Error(`Unknown provider: ${name}`);
}


