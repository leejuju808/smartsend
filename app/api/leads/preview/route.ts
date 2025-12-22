import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";

// NOTE: install: npm i csv-parse

export const runtime = "nodejs"; // ensure Node runtime for buffer parsing

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvText = buffer.toString("utf-8");

  const records: any[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  });

  if (!records.length) {
    return NextResponse.json({ error: "CSV has no rows" }, { status: 400 });
  }

  const headers = Object.keys(records[0]);
  const sampleRows = records.slice(0, 5);

  return NextResponse.json({ headers, sampleRows });
}


































































