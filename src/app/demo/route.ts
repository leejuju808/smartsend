import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  // Create a fake session token for demo mode
  const demoSession = {
    user: {
      id: "demo-user",
      email: "demo@smartsendhq.com",
      org_id: "00000000-0000-0000-0000-000000000001",
    },
  };

  // Store session in cookie
  const cookieStore = await cookies();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const response = NextResponse.redirect(new URL("/dashboard", baseUrl));
  
  // Set demo session cookie (expires in 24 hours)
  response.cookies.set("demo_session", JSON.stringify(demoSession), {
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
    httpOnly: false, // Allow client-side access for demo mode checks
    sameSite: "lax",
  });

  return response;
}

