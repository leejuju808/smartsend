import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import OpenAI from "https://deno.land/x/openai@v4/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const { record } = await req.json()

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const openai = new OpenAI(Deno.env.get("OPENAI_API_KEY")!)

  const text = record.body_text || record.snippet || ""

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Decide if this email is a real reply to a cold email. Answer only true or false." },
      { role: "user", content: text },
    ],
  })

  const isReply = response.choices[0].message.content?.toLowerCase().includes("true")

  if (isReply) {
    const fromEmail = record.from || record.from_email
    if (fromEmail) {
      await supabase
        .from("leads")
        .update({ replied: true })
        .eq("email", fromEmail.toLowerCase())
    }
  }

  return new Response("ok", { status: 200 })
})

