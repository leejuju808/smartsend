import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect("/api/oauth/microsoft/start");
}
