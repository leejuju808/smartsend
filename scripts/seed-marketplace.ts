#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function seedMarketplace() {
  console.log('🌱 Seeding marketplace with killer templates...')

  // Cold SaaS Sequence (3 steps)
  const saasSequence = {
    kind: "sequence",
    name: "SaaS Cold Outreach · 3-Step",
    description: "High-performing cold sequence for B2B SaaS (Day 0/3/7).",
    tags: ["saas", "cold", "b2b"],
    rating: 4.7,
    author: "SmartSend Team",
    payload: {
      name: "SaaS Cold Outreach",
      steps: [
        {
          subject: "Quick idea for {{company}}",
          body_text: "Hi {{first}}, noticed {{trigger}}…",
          delay_days: 0
        },
        {
          subject: "Worth a look for {{company}}?",
          body_text: "Circling back with a 30s Loom…",
          delay_days: 3
        },
        {
          subject: "Close the loop?",
          body_text: "Happy to close this if no fit; otherwise 10-min chat?",
          delay_days: 7
        }
      ]
    }
  }

  // Product Update Campaign
  const productCampaign = {
    kind: "campaign",
    name: "Product Update: Q3 Highlights",
    description: "Announce new features with clear CTA.",
    tags: ["newsletter", "product"],
    rating: 4.5,
    author: "SmartSend Team",
    payload: {
      name: "Q3 Highlights",
      subject: "We shipped 3 power features 🚀",
      body_text: "Short and sweet summary + CTA to changelog."
    }
  }

  try {
    // Insert SaaS sequence
    const { data: seq, error: seqError } = await supabase
      .from('marketplace_templates')
      .insert(saasSequence)
      .select()
      .single()
    
    if (seqError) throw seqError
    console.log('✅ SaaS sequence template created:', seq.id)

    // Insert product campaign
    const { data: camp, error: campError } = await supabase
      .from('marketplace_templates')
      .insert(productCampaign)
      .select()
      .single()
    
    if (campError) throw campError
    console.log('✅ Product campaign template created:', camp.id)

    console.log('🎉 Marketplace seeded successfully!')
    console.log('Check out /dashboard/marketplace to see your templates')

  } catch (error) {
    console.error('❌ Failed to seed marketplace:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedMarketplace()
} 