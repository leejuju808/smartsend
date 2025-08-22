import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { campaignId } = req.body as { campaignId: string }
  if (!campaignId) return res.status(400).json({ error: 'campaignId required' })

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaignId).single()
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

  const { data: assigned } = await supabase
    .from('campaign_contacts')
    .select('id, contacts(email)')
    .eq('campaign_id', campaignId)

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })

  for (const a of assigned || []) {
    const email = (a as any).contacts?.email as string | undefined
    if (!email) continue

    const pixelUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/track/open?cc=${(a as any).id}`
    const wrappedBody = `\n${campaign.body}\n<br><br>\n<img src="${pixelUrl}" width="1" height="1" style="display:none;" />\n`
    const bodyWithLinks = wrappedBody.replace(/https?:\/\/[^\s]+/g, (url) =>
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/track/click?cc=${(a as any).id}&url=${encodeURIComponent(url)}`
    )

    await transport.sendMail({
      from: `"SmartSendAI" <${process.env.SMTP_USER!}>`,
      to: email,
      subject: (campaign as any).subject,
      html: bodyWithLinks,
    })

    await supabase
      .from('campaign_contacts')
      .update({ sent_at: new Date().toISOString(), last_step_sent: 1 })
      .eq('id', (a as any).id)
  }

  res.status(200).json({ ok: true })
}

import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).end("Method not allowed");

	try {
		const { campaignId } = req.body as { campaignId?: string };

		if (!campaignId) return res.status(400).json({ error: "campaignId is required" });

		// Fetch campaign details
		const { data: campaign, error: cError } = await supabase
			.from("campaigns")
			.select("*")
			.eq("id", campaignId)
			.single();

		if (cError || !campaign) throw new Error("Campaign not found");

		// Fetch assigned contacts
		const { data: assigned, error: aError } = await supabase
			.from("campaign_contacts")
			.select("id, contact_id, contacts(email, name)")
			.eq("campaign_id", campaignId);

		if (aError) throw new Error("Error fetching contacts");

		// Setup Nodemailer transport (SMTP)
		const transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST!,
			port: parseInt(process.env.SMTP_PORT!),
			secure: false,
			auth: {
				user: process.env.SMTP_USER!,
				pass: process.env.SMTP_PASS!,
			},
		});

		// Send emails one by one
		for (const a of assigned || []) {
			// @ts-ignore - depending on Supabase relational setup
			const email = a.contacts?.email as string | undefined;
			// @ts-ignore
			const name = (a.contacts?.name as string | undefined) || undefined;
			if (!email) continue;

			await transporter.sendMail({
				from: `"SmartSendAI" <${process.env.SMTP_USER!}>`,
				to: email,
				subject: campaign.subject,
				text: campaign.body,
			});

			await supabase
				.from("campaign_contacts")
				.update({ sent_at: new Date().toISOString(), last_step_sent: 1 })
				.eq("id", a.id as string);
		}

		await supabase.from("campaigns").update({ status: "sent" }).eq("id", campaignId);

		return res.status(200).json({ success: true, message: "Campaign sent!" });
	} catch (err: any) {
		console.error("Send error:", err?.message || err);
		return res.status(500).json({ error: err?.message || "Unknown error" });
	}
}

