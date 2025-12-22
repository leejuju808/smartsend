import { NextResponse } from "next/server";
import { getClassifier } from "@/lib/ai/providers";
import type { ClassifyResult } from "@/lib/ai/providers/types";

// Gate with a simple header token
export async function POST(req: Request) {
  const token = req.headers.get('X-Internal-Token');
  if (!token || token !== process.env.INTERNAL_TOKEN) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
  }

  const { text, model } = await req.json();
  const provider = getClassifier({ model });

  let res: ClassifyResult;
  try {
    res = await provider.classify(String(text ?? '').slice(0,4000));
  } catch (e: any) {
    // fallback to heuristic
    const { HeuristicClassifier } = await import('@/lib/ai/providers/fallback');
    res = await new HeuristicClassifier().classify(text ?? '');
    res.raw = { error: String(e) };
  }
  return NextResponse.json(res);
}

