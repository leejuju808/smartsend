import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { jobId: string } }) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/template-rewriter?jobId=${params.jobId}`,
  );
  const payload = await res.json();
  return NextResponse.json(payload, { status: res.ok ? 200 : 400 });
}




