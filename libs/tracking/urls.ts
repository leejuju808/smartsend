import { randomBytes } from "crypto";

export function makeToken() {
  return randomBytes(9).toString("base64url");
}

export function buildTrackedUrl(trackingHost: string, token: string) {
  return `https://${trackingHost}/${token}`;
}




