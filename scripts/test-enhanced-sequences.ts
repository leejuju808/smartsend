#!/usr/bin/env tsx

/**
 * Test script for the enhanced sequence system
 * 
 * This script demonstrates:
 * 1. Creating a sequence with multiple steps
 * 2. Enrolling contacts in the sequence
 * 3. Running the sequence scheduler
 * 4. Testing condition-based logic
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testEnhancedSequences() {
  console.log("🧪 Testing Enhanced Sequence System...\n");

  try {
    // 1. Create a test sequence
    console.log("1. Creating test sequence...");
    const { data: sequence, error: seqError } = await supabase
      .from("sequences")
      .insert({
        name: "Test Drip Campaign",
        user_id: "test-user-id", // Replace with actual user ID
        status: "active"
      })
      .select()
      .single();

    if (seqError) {
      console.error("Failed to create sequence:", seqError);
      return;
    }

    console.log(`✅ Created sequence: ${sequence.name} (ID: ${sequence.id})\n`);

    // 2. Add sequence steps with different conditions
    console.log("2. Adding sequence steps...");
    
    const steps = [
      {
        sequence_id: sequence.id,
        step_number: 1,
        subject: "Welcome to our service!",
        body: "Hi there! Thanks for signing up. We're excited to have you on board.",
        delay_days: 0,
        condition: "always"
      },
      {
        sequence_id: sequence.id,
        step_number: 2,
        subject: "Did you get our welcome email?",
        body: "Just checking in to see if you received our welcome message. Let us know if you have any questions!",
        delay_days: 3,
        condition: "opened"
      },
      {
        sequence_id: sequence.id,
        step_number: 3,
        subject: "Ready to get started?",
        body: "We'd love to help you get the most out of our service. Schedule a quick call with our team.",
        delay_days: 7,
        condition: "clicked"
      },
      {
        sequence_id: sequence.id,
        step_number: 4,
        subject: "Last chance to connect",
        body: "We haven't heard from you yet. This is our final attempt to reach out.",
        delay_days: 14,
        condition: "no_reply"
      }
    ];

    for (const step of steps) {
      const { data: createdStep, error: stepError } = await supabase
        .from("sequence_steps")
        .insert(step)
        .select()
        .single();

      if (stepError) {
        console.error(`Failed to create step ${step.step_number}:`, stepError);
        continue;
      }

      console.log(`✅ Added step ${step.step_number}: "${step.subject}" (${step.condition} condition, ${step.delay_days} day delay)`);
    }

    console.log("\n3. Enrolling test contacts...");
    
    // 3. Enroll test contacts
    const testEmails = [
      "test1@example.com",
      "test2@example.com", 
      "test3@example.com"
    ];

    for (const email of testEmails) {
      const { data: enrollment, error: enrollError } = await supabase
        .from("sequence_enrollments")
        .upsert({
          sequence_id: sequence.id,
          email: email,
          current_step: 0,
          last_sent: null
        }, {
          onConflict: "sequence_id,email"
        })
        .select()
        .single();

      if (enrollError) {
        console.error(`Failed to enroll ${email}:`, enrollError);
        continue;
      }

      console.log(`✅ Enrolled ${email} in sequence`);
    }

    // 4. Test the due_sequence_steps RPC function
    console.log("\n4. Testing due_sequence_steps RPC function...");
    
    const { data: dueSteps, error: rpcError } = await supabase.rpc("due_sequence_steps");
    
    if (rpcError) {
      console.error("Failed to call due_sequence_steps:", rpcError);
      return;
    }

    if (dueSteps && dueSteps.length > 0) {
      console.log(`✅ Found ${dueSteps.length} due steps:`);
      dueSteps.forEach(step => {
        console.log(`   - Step ${step.step_order}: "${step.subject}" for ${step.email}`);
      });
    } else {
      console.log("ℹ️ No due steps found (this is expected for new enrollments)");
    }

    // 5. Test the sequence runner
    console.log("\n5. Testing sequence runner...");
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/sequences/run`, {
      method: "POST"
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Sequence runner result:`, result);
    } else {
      console.error("❌ Sequence runner failed:", response.statusText);
    }

    console.log("\n🎉 Enhanced sequence system test completed!");
    console.log("\nNext steps:");
    console.log("1. Run the sequence runner again after delays to see progression");
    console.log("2. Add events (opens, clicks, replies) to test conditions");
    console.log("3. Check sequence_enrollments table to see current_step progression");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedSequences()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
} 