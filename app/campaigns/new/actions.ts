"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(2),
  subject: z.string().min(2),
  body_template: z.string().min(10),
  daily_cap: z.coerce.number().min(1).max(1000),
  send_start: z.string().regex(/^\d{2}:\d{2}$/), // "HH:MM"
});

export async function createCampaign(formData: FormData) {
  const parsed = schema.parse({
    title: formData.get("title"),
    subject: formData.get("subject"),
    body_template: formData.get("body_template"),
    daily_cap: formData.get("daily_cap"),
    send_start: formData.get("send_start"),
  });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      title: parsed.title,
      subject: parsed.subject,
      body_template: parsed.body_template,
      daily_cap: parsed.daily_cap,
      send_start: parsed.send_start,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw error;

  // Redirect to Leads Upload step
  redirect(`/campaigns/${data.id}/leads/upload`);
}

