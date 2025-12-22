#!/usr/bin/env tsx

import { adminClient } from '../src/lib/supabase/adminClient';

const sampleTemplates = [
  {
    title: "Cold Outreach Introduction",
    body: `Hi {{first_name}},

I hope this email finds you well. I came across {{company}} and was impressed by your work in {{industry}}.

I believe we could potentially collaborate on {{specific_opportunity}} that would benefit both our organizations.

Would you be interested in a brief 15-minute call to explore this further?

Best regards,
{{sender_name}}
{{sender_title}}
{{company_name}}`,
    variables: ['first_name', 'company', 'industry', 'specific_opportunity', 'sender_name', 'sender_title', 'company_name'],
    tags: ['cold-outreach', 'introduction', 'collaboration'],
    visibility: 'public'
  },
  {
    title: "Follow-up After Meeting",
    body: `Hi {{first_name}},

It was great meeting with you today to discuss {{topic}}. I really enjoyed our conversation about {{specific_point}}.

As we discussed, I'll {{action_item}} and get back to you by {{deadline}}.

In the meantime, please don't hesitate to reach out if you have any questions.

Looking forward to {{next_step}}.

Best regards,
{{sender_name}}`,
    variables: ['first_name', 'topic', 'specific_point', 'action_item', 'deadline', 'sender_name', 'next_step'],
    tags: ['follow-up', 'meeting', 'action-items'],
    visibility: 'public'
  },
  {
    title: "Sales Pitch - SaaS Solution",
    body: `Hi {{first_name}},

I noticed that {{company}} is {{current_situation}}, and I think I have a solution that could help.

{{product_name}} has helped companies like yours {{benefit}} by {{how_it_works}}.

Would you be interested in seeing a quick demo of how this could work for {{company}}?

I'm happy to show you a 10-minute walkthrough at your convenience.

Best regards,
{{sender_name}}
{{company_name}}`,
    variables: ['first_name', 'company', 'current_situation', 'product_name', 'benefit', 'how_it_works', 'sender_name', 'company_name'],
    tags: ['sales', 'saas', 'demo'],
    visibility: 'public'
  },
  {
    title: "Networking Event Follow-up",
    body: `Hi {{first_name}},

It was a pleasure meeting you at {{event_name}} yesterday. I really enjoyed our conversation about {{topic}}.

I found your insights on {{specific_insight}} particularly valuable, especially regarding {{context}}.

I'd love to stay connected and potentially collaborate in the future. Would you be open to {{suggested_next_step}}?

Best regards,
{{sender_name}}
{{company_name}}`,
    variables: ['first_name', 'event_name', 'topic', 'specific_insight', 'context', 'suggested_next_step', 'sender_name', 'company_name'],
    tags: ['networking', 'follow-up', 'collaboration'],
    visibility: 'public'
  },
  {
    title: "Customer Onboarding Welcome",
    body: `Hi {{first_name}},

Welcome to {{company_name}}! We're excited to have you on board.

Your account is now set up and ready to go. Here are your next steps:

1. {{step_one}}
2. {{step_two}}
3. {{step_three}}

If you have any questions or need help getting started, our team is here to help. You can reach us at {{support_email}}.

We're looking forward to seeing what you'll accomplish with {{product_name}}!

Best regards,
The {{company_name}} Team`,
    variables: ['first_name', 'company_name', 'step_one', 'step_two', 'step_three', 'support_email', 'product_name'],
    tags: ['onboarding', 'welcome', 'getting-started'],
    visibility: 'public'
  }
];

async function seedTemplates() {
  const supabase = adminClient();
  
  // Get a user ID to use as owner (you'll need to replace this with an actual user ID)
  const { data: users } = await supabase.auth.admin.listUsers();
  if (!users.users.length) {
    console.error('No users found. Please create a user first.');
    return;
  }
  
  const ownerId = users.users[0].id;
  console.log(`Using user ${ownerId} as template owner`);

  for (const template of sampleTemplates) {
    const { data, error } = await supabase
      .from('templates')
      .insert({
        ...template,
        owner_id: ownerId
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating template "${template.title}":`, error);
    } else {
      console.log(`✅ Created template: ${template.title} (ID: ${data.id})`);
    }
  }

  console.log('\n🎉 Sample templates seeded successfully!');
}

seedTemplates().catch(console.error); 