import type { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import { POST as appWebhookPOST } from "@/app/api/webhook/route";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const raw = await buffer(req);

    const headers = new Headers();
    const sig = req.headers["stripe-signature"];
    if (typeof sig === "string") headers.set("stripe-signature", sig);
    headers.set("content-type", "text/plain");

    const proxyRequest = new Request(req.url ?? "https://internal/stripe-webhook", {
      method: "POST",
      headers,
      body: raw.toString("utf8"),
    });

    const nextResponse = await appWebhookPOST(proxyRequest as unknown as Request);

    nextResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await nextResponse.text();
    return res.status(nextResponse.status).send(text);
  } catch (err: any) {
    console.error("Webhook proxy error:", err?.message || err);
    return res.status(500).send("Webhook proxy failed");
  }
}

