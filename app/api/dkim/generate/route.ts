import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const selector = "smartsend";

  const txtRecord = `${selector}._domainkey.${domain}`;
  const publicTXT = publicKey
    .export({ type: "pkcs1", format: "pem" })
    .toString()
    .replace(/-----.*?-----/g, "")
    .replace(/\n/g, "");

  return NextResponse.json({
    selector,
    txtRecord,
    dkimValue: `v=DKIM1; k=rsa; p=${publicTXT}`,
    privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  });
}