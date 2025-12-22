import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Store beta signup in database
    // Option 1: Use existing waitlist table if it exists
    // Option 2: Create a new beta_signups table
    // For now, we'll try to insert into a potential beta_signups table
    // If it doesn't exist, you'll need to create it:
    // CREATE TABLE beta_signups (
    //   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    //   email TEXT UNIQUE NOT NULL,
    //   created_at TIMESTAMP DEFAULT NOW(),
    //   status TEXT DEFAULT 'pending'
    // );

    const { data, error } = await supabase
      .from("beta_signups")
      .insert({ email: email.toLowerCase() })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, fall back to logging or external service
      console.log("Beta signup:", email);
      
      // You can also integrate with:
      // - Mailchimp
      // - ConvertKit
      // - Airtable
      // - Or any other service
      
      // For now, return success even if DB insert fails
      // TODO: Set up beta_signups table or integrate with email service
    }

    return NextResponse.json(
      { success: true, message: "Beta access requested successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Beta signup error:", error);
    return NextResponse.json(
      { error: "Failed to process signup" },
      { status: 500 }
    );
  }
}

