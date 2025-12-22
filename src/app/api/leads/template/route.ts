import { NextResponse } from "next/server";

export async function GET() {
  const csv = "email,first_name,last_name,company\njane@acme.com,Jane,Doe,Acme Inc\n";
  return new Response(csv, {
    headers: { 
      "Content-Type": "text/csv", 
      "Content-Disposition": 'attachment; filename="leads_template.csv"' 
    }
  });
}