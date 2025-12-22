import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/googleOauth";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const url = buildGoogleAuthUrl({ state });
  return NextResponse.redirect(url);
}


