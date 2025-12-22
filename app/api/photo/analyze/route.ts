// Block 18500 — SmartSend Photo Intelligence v1
// POST /api/photo/analyze
// Analyzes homeowner photos and extracts all critical roofing details

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { analyzePhotoWithAI } from "@/lib/ai/photoIntelligence";
import { prepareAppointmentFromPhoto } from "@/lib/ai/appointmentPrep";
import { analyzeInboxPhotoWithAI } from "@/src/lib/ai/inboxPhotoIntelligence";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contactId, attachmentId, imageUrl } = body;

    if (!contactId || (!attachmentId && !imageUrl)) {
      return NextResponse.json(
        { error: "contactId and either attachmentId or imageUrl are required" },
        { status: 400 }
      );
    }

    // Get contact and workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get image URL
    let finalImageUrl = imageUrl;
    if (attachmentId && !imageUrl) {
      const { data: attachment, error: attachError } = await supabase
        .from("attachments")
        .select("storage_path, file_type")
        .eq("id", attachmentId)
        .single();

      if (attachError || !attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }

      if (!attachment.file_type.startsWith("image/")) {
        return NextResponse.json({ error: "File is not an image" }, { status: 400 });
      }

      const { data: urlData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, 3600);

      if (!urlData?.signedUrl) {
        return NextResponse.json({ error: "Failed to generate image URL" }, { status: 500 });
      }

      finalImageUrl = urlData.signedUrl;
    }

    // Analyze photo with AI
    const analysis = await analyzePhotoWithAI(finalImageUrl);

    // Get existing photo intelligence for this attachment (if any)
    const { data: existingIntel } = await supabase
      .from("photo_intelligence")
      .select("*")
      .eq("attachment_id", attachmentId || "")
      .maybeSingle();

    // Prepare photo intelligence record
    const photoIntelData: any = {
      contact_id: contactId,
      workspace_id: contact.workspace_id,
      attachment_id: attachmentId || null,
      photo_type: analysis.photoType,
      photo_location: analysis.photoLocation,
      storm_damage_detected: analysis.stormDamageDetected,
      hail_marks_detected: analysis.hailMarksDetected,
      hail_bruising_detected: analysis.hailBruisingDetected,
      circular_impact_marks: analysis.circularImpactMarks,
      granule_loss_patches: analysis.granuleLossPatches,
      wind_torn_shingles: analysis.windTornShingles,
      loose_shingles: analysis.looseShingles,
      uplifted_shingle_edges: analysis.upliftedShingleEdges,
      storm_opportunity_score: analysis.stormOpportunityScore,
      leak_detected: analysis.leakDetected,
      water_intrusion_detected: analysis.waterIntrusionDetected,
      ceiling_stains: analysis.ceilingStains,
      brown_water_rings: analysis.brownWaterRings,
      yellow_discoloration: analysis.yellowDiscoloration,
      bubbling_paint: analysis.bubblingPaint,
      sagging_drywall: analysis.saggingDrywall,
      mold_patterns: analysis.moldPatterns,
      is_emergency: analysis.isEmergency,
      material_type: analysis.materialType,
      shingle_type: analysis.shingleType,
      metal_type: analysis.metalType,
      tile_type: analysis.tileType,
      flat_type: analysis.flatType,
      skylight_type: analysis.skylightType,
      vent_types: analysis.ventTypes,
      chimney_configuration: analysis.chimneyConfiguration,
      granule_loss: analysis.granuleLoss,
      cracking: analysis.cracking,
      curling: analysis.curling,
      blistering: analysis.blistering,
      algae_moss: analysis.algaeMoss,
      nail_pops: analysis.nailPops,
      exposed_underlayment: analysis.exposedUnderlayment,
      roof_age_estimate: analysis.roofAgeEstimate,
      gutter_damage_detected: analysis.gutterDamageDetected,
      bent_gutters: analysis.bentGutters,
      sagging_gutters: analysis.saggingGutters,
      pulled_back_flashings: analysis.pulledBackFlashings,
      damaged_drip_edge: analysis.damagedDripEdge,
      interior_damage_detected: analysis.interiorDamageDetected,
      wall_stains: analysis.wallStains,
      ceiling_cracks: analysis.ceilingCracks,
      mold_colonies: analysis.moldColonies,
      active_leak_path: analysis.activeLeakPath,
      insulation_moisture: analysis.insulationMoisture,
      labeled_interior_leak_evidence: analysis.labeledInteriorLeakEvidence,
      severity_score: analysis.severityScore,
      severity_category: analysis.severityCategory,
      insurance_indicators_count: analysis.insuranceIndicatorsCount,
      hail_bruising_pattern: analysis.hailBruisingPattern,
      shingle_fractures: analysis.shingleFractures,
      broken_tiles: analysis.brokenTiles,
      dented_metal_vents: analysis.dentedMetalVents,
      compromised_ridge_caps: analysis.compromisedRidgeCaps,
      interior_water_damage: analysis.interiorWaterDamage,
      mold_formations: analysis.moldFormations,
      insurance_strong_candidate: analysis.insuranceStrongCandidate,
      upsell_opportunities: analysis.upsellOpportunities,
      cracked_skylight: analysis.crackedSkylight,
      gutter_sag: analysis.gutterSag,
      pipe_boot_crack: analysis.pipeBootCrack,
      moss_detected: analysis.mossDetected,
      photo_quality_score: analysis.photoQualityScore,
      is_blurry: analysis.isBlurry,
      is_too_dark: analysis.isTooDark,
      is_too_close: analysis.isTooClose,
      is_too_far: analysis.isTooFar,
      has_angle_issues: analysis.hasAngleIssues,
      quality_feedback: analysis.qualityFeedback,
      analysis_model: analysis.analysisMetadata.model,
      analysis_version: 'v1',
      analysis_metadata: analysis.analysisMetadata,
      analyzed_at: new Date().toISOString(),
    };

    // Upsert photo intelligence
    const { data: photoIntelligence, error: intelError } = await supabase
      .from("photo_intelligence")
      .upsert(photoIntelData, {
        onConflict: existingIntel ? 'id' : undefined,
      })
      .select()
      .single();

    if (intelError) {
      console.error("Error saving photo intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to save photo intelligence" },
        { status: 500 }
      );
    }

    // Create photo material tags
    if (analysis.materialType) {
      await supabase
        .from("photo_material_tags")
        .upsert({
          contact_id: contactId,
          workspace_id: contact.workspace_id,
          photo_intelligence_id: photoIntelligence.id,
          tag: analysis.materialType,
          tag_category: 'material',
          confidence: analysis.confidence,
          source: 'photo_analysis',
        }, {
          onConflict: 'contact_id,photo_intelligence_id,tag',
        });
    }

    // Add damage tags
    if (analysis.stormDamageDetected) {
      await supabase
        .from("photo_material_tags")
        .upsert({
          contact_id: contactId,
          workspace_id: contact.workspace_id,
          photo_intelligence_id: photoIntelligence.id,
          tag: 'storm_damage',
          tag_category: 'damage',
          confidence: analysis.confidence,
          source: 'photo_analysis',
        }, {
          onConflict: 'contact_id,photo_intelligence_id,tag',
        });
    }

    if (analysis.leakDetected) {
      await supabase
        .from("photo_material_tags")
        .upsert({
          contact_id: contactId,
          workspace_id: contact.workspace_id,
          photo_intelligence_id: photoIntelligence.id,
          tag: 'leak_damage',
          tag_category: 'damage',
          confidence: analysis.confidence,
          source: 'photo_analysis',
        }, {
          onConflict: 'contact_id,photo_intelligence_id,tag',
        });
    }

    // Add upsell opportunity tags
    for (const upsell of analysis.upsellOpportunities) {
      await supabase
        .from("photo_material_tags")
        .upsert({
          contact_id: contactId,
          workspace_id: contact.workspace_id,
          photo_intelligence_id: photoIntelligence.id,
          tag: upsell,
          tag_category: 'upsell',
          confidence: analysis.confidence,
          source: 'photo_analysis',
        }, {
          onConflict: 'contact_id,photo_intelligence_id,tag',
        });
    }

    // Log photo event
    await supabase
      .from("photo_events")
      .insert({
        contact_id: contactId,
        workspace_id: contact.workspace_id,
        photo_intelligence_id: photoIntelligence.id,
        attachment_id: attachmentId || null,
        event_type: 'photo_analyzed',
        event_data: {
          severity_score: analysis.severityScore,
          insurance_strong_candidate: analysis.insuranceStrongCandidate,
          is_emergency: analysis.isEmergency,
        },
      });

    // Sync with material intelligence if material detected
    if (analysis.materialType) {
      const { data: existingMaterialIntel } = await supabase
        .from("material_intelligence")
        .select("*")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (existingMaterialIntel) {
        // Update material intelligence with photo data
        await supabase
          .from("material_intelligence")
          .update({
            detected_from_photo: true,
            photo_confidence: analysis.confidence,
            material_type: analysis.materialType || existingMaterialIntel.material_type,
            shingle_type: analysis.shingleType || existingMaterialIntel.shingle_type,
            metal_type: analysis.metalType || existingMaterialIntel.metal_type,
            tile_type: analysis.tileType || existingMaterialIntel.tile_type,
            flat_type: analysis.flatType || existingMaterialIntel.flat_type,
            granule_loss_detected: analysis.granuleLoss || existingMaterialIntel.granule_loss_detected,
            hail_impact_marks: analysis.hailMarksDetected || existingMaterialIntel.hail_impact_marks,
            wind_uplift_detected: analysis.windTornShingles || existingMaterialIntel.wind_uplift_detected,
            moss_buildup_detected: analysis.algaeMoss || existingMaterialIntel.moss_buildup_detected,
            last_analyzed_at: new Date().toISOString(),
          })
          .eq("id", existingMaterialIntel.id);
      } else {
        // Create new material intelligence record
        await supabase
          .from("material_intelligence")
          .insert({
            contact_id: contactId,
            workspace_id: contact.workspace_id,
            detected_from_photo: true,
            photo_confidence: analysis.confidence,
            material_type: analysis.materialType,
            shingle_type: analysis.shingleType,
            metal_type: analysis.metalType,
            tile_type: analysis.tileType,
            flat_type: analysis.flatType,
            granule_loss_detected: analysis.granuleLoss,
            hail_impact_marks: analysis.hailMarksDetected,
            wind_uplift_detected: analysis.windTornShingles,
            moss_buildup_detected: analysis.algaeMoss,
            last_analyzed_at: new Date().toISOString(),
          });
      }
    }

    // Generate appointment prep recommendations
    const appointmentPrep = prepareAppointmentFromPhoto(analysis);
    
    // Update photo_damage_scores with appointment prep info
    await supabase
      .from("photo_damage_scores")
      .update({
        recommended_appointment_slot: appointmentPrep.suggestedTimeSlots[0] || null,
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId)
      .then(() => {
        // If no existing record, it will be created by the trigger
      })
      .catch(() => {
        // Ignore errors - scores will be calculated by trigger
      });

    // Log appointment prep event
    await supabase
      .from("photo_events")
      .insert({
        contact_id: contactId,
        workspace_id: contact.workspace_id,
        photo_intelligence_id: photoIntelligence.id,
        attachment_id: attachmentId || null,
        event_type: 'appointment_prepped',
        event_data: {
          tools_needed: appointmentPrep.toolsNeeded,
          estimated_duration: appointmentPrep.estimatedDuration,
          recommended_rep_type: appointmentPrep.recommendedRepType,
          urgency_level: appointmentPrep.urgencyLevel,
          suggested_slots: appointmentPrep.suggestedTimeSlots,
        },
      });

    // Trigger auto-task generation (non-blocking)
    generateAutoTasks(contactId, contact.workspace_id, analysis, photoIntelligence.id, appointmentPrep).catch(
      (error) => console.error("Error generating auto-tasks:", error)
    );

    // Block 19940: Also create inbox photo analysis report if attachment is linked to a thread
    if (attachmentId) {
      try {
        // Check if this attachment is linked to an inbox message
        const { data: messageAttachments } = await supabase
          .from("message_attachments")
          .select("message_id, thread_id")
          .eq("attachment_id", attachmentId)
          .limit(1)
          .maybeSingle();

        if (messageAttachments?.thread_id) {
          // Use the enhanced inbox photo analysis
          const inboxAnalysis = await analyzeInboxPhotoWithAI(finalImageUrl);

          // Create image_analysis_reports record
          await supabase
            .from("image_analysis_reports")
            .insert({
              thread_id: messageAttachments.thread_id,
              contact_id: contactId,
              workspace_id: contact.workspace_id,
              attachment_id: attachmentId,
              message_id: messageAttachments.message_id || null,
              damage_type: inboxAnalysis.damageType,
              damage_types: inboxAnalysis.damageTypes,
              severity: inboxAnalysis.severity,
              severity_label: inboxAnalysis.severityLabel,
              severity_description: inboxAnalysis.severityDescription,
              material_detected: inboxAnalysis.materialDetected,
              material_confidence: inboxAnalysis.materialConfidence,
              slope_estimation: inboxAnalysis.slopeEstimation,
              roof_condition_notes: inboxAnalysis.roofConditionNotes,
              condition_summary: inboxAnalysis.conditionSummary,
              insurance_likelihood: inboxAnalysis.insuranceLikelihood,
              insurance_indicators: inboxAnalysis.insuranceIndicators,
              recommended_next_step: inboxAnalysis.recommendedNextStep,
              recommended_action_type: inboxAnalysis.recommendedActionType,
              potential_job_type: inboxAnalysis.potentialJobType,
              job_type_confidence: inboxAnalysis.jobTypeConfidence,
              value_range_min: inboxAnalysis.valueRangeMin,
              value_range_max: inboxAnalysis.valueRangeMax,
              value_range_type: inboxAnalysis.valueRangeType,
              value_range_formatted: inboxAnalysis.valueRangeFormatted,
              analysis_model: inboxAnalysis.analysisModel,
              analysis_version: inboxAnalysis.analysisVersion,
              analysis_metadata: inboxAnalysis.analysisMetadata,
            })
            .catch((err) => {
              console.error("Error creating inbox photo analysis report:", err);
            });

          // Block 19950: Automatically trigger roof measurement analysis for exterior roof photos
          if (analysis.photoType === 'exterior_roof' || analysis.photoLocation === 'exterior') {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            fetch(`${baseUrl}/api/roof-measurements/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                threadId: messageAttachments.thread_id,
                attachmentId: attachmentId,
                imageUrl: finalImageUrl,
                contactId: contactId,
              }),
            }).catch((err) => {
              console.error("Error triggering roof measurement analysis:", err);
            });
          }
        }
      } catch (inboxError) {
        console.error("Error creating inbox photo analysis:", inboxError);
        // Don't fail the main request if inbox analysis fails
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      photoIntelligence,
      appointmentPrep,
    });
  } catch (error: any) {
    console.error("Error analyzing photo:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Auto-task generation based on photo analysis
async function generateAutoTasks(
  contactId: string,
  workspaceId: string,
  analysis: any,
  photoIntelligenceId: string,
  appointmentPrep?: any
) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return;

  const tasks: Array<{ title: string; description: string; taskType: string; priority: string; dueAt: string }> = [];

  // Leak Photo Tasks
  if (analysis.leakDetected || analysis.isEmergency) {
    tasks.push({
      title: "Contact homeowner immediately - Leak detected",
      description: `Photo analysis detected ${analysis.leakDetected ? 'leak' : 'emergency'} damage. ${analysis.interiorDamageDetected ? 'Interior damage also detected.' : ''}`,
      taskType: "high_urgency_issue",
      priority: "high",
      dueAt: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
    });
  }

  // Storm Damage Tasks
  if (analysis.stormDamageDetected && analysis.stormOpportunityScore >= 60) {
    tasks.push({
      title: "Send storm inspection message",
      description: `Storm damage detected with opportunity score of ${analysis.stormOpportunityScore}. Consider adding to insurance pipeline.`,
      taskType: "follow_up_needed",
      priority: "high",
      dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    });
  }

  // Insurance Pipeline Tasks
  if (analysis.insuranceStrongCandidate) {
    tasks.push({
      title: "Add to insurance pipeline",
      description: `Photo shows ${analysis.insuranceIndicatorsCount} insurance indicators. Strong candidate for insurance claim.`,
      taskType: "follow_up_needed",
      priority: "high",
      dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
    });
  }

  // Material-specific tasks
  if (analysis.materialType === 'metal') {
    tasks.push({
      title: "Bring metal inspection tools",
      description: "Photo indicates metal roof. Ensure rep brings appropriate tools and PPE.",
      taskType: "book_inspection",
      priority: "medium",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    });
  }

  if (analysis.materialType === 'tile') {
    tasks.push({
      title: "Bring tile-safe footwear",
      description: "Photo indicates tile roof. Ensure rep uses tile-safe footwear.",
      taskType: "book_inspection",
      priority: "medium",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Interior Damage Tasks
  if (analysis.interiorDamageDetected) {
    tasks.push({
      title: "Ask for attic access",
      description: "Interior damage detected. Request attic access for full inspection.",
      taskType: "answer_question",
      priority: "high",
      dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
    });

    tasks.push({
      title: "Bring moisture meter",
      description: "Interior damage detected. Bring moisture meter to assess extent.",
      taskType: "book_inspection",
      priority: "medium",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Photo Quality Tasks
  if (analysis.qualityFeedback) {
    tasks.push({
      title: "Request better photo",
      description: `Photo quality issue: ${analysis.qualityFeedback}`,
      taskType: "answer_question",
      priority: "low",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Appointment Prep Tasks
  if (appointmentPrep) {
    if (appointmentPrep.toolsNeeded.length > 0) {
      tasks.push({
        title: `Prepare tools for inspection: ${appointmentPrep.toolsNeeded.slice(0, 3).join(', ')}`,
        description: `Required tools: ${appointmentPrep.toolsNeeded.join(', ')}\nEstimated duration: ${appointmentPrep.estimatedDuration} minutes\n${appointmentPrep.recommendedRepType ? `Recommended rep: ${appointmentPrep.recommendedRepType}` : ''}`,
        taskType: "book_inspection",
        priority: appointmentPrep.urgencyLevel === 'emergency' ? 'high' : 'medium',
        dueAt: appointmentPrep.suggestedTimeSlots[0] || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (appointmentPrep.urgencyLevel === 'emergency' && appointmentPrep.suggestedTimeSlots.length > 0) {
      tasks.push({
        title: "Offer emergency appointment slot",
        description: `Emergency detected. Suggested time slots:\n${appointmentPrep.suggestedTimeSlots.map((slot: string) => new Date(slot).toLocaleString()).join('\n')}`,
        taskType: "high_urgency_issue",
        priority: "high",
        dueAt: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour
      });
    }
  }

  // Create tasks
  for (const task of tasks) {
    try {
      await supabase
        .from("tasks_v3")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          user_id: user.id,
          task_type: task.taskType,
          priority: task.priority,
          status: 'open',
          title: task.title,
          description: task.description,
          due_at: task.dueAt,
          auto_generated: true,
          metadata: {
            source: 'photo_intelligence',
            photo_intelligence_id: photoIntelligenceId,
          },
          created_by: user.id,
        });
    } catch (error) {
      console.error("Error creating auto-task:", error);
    }
  }

  // Log task creation event
  if (tasks.length > 0) {
    await supabase
      .from("photo_events")
      .insert({
        contact_id: contactId,
        workspace_id: workspaceId,
        photo_intelligence_id: photoIntelligenceId,
        event_type: 'task_created',
        event_data: {
          tasks_created: tasks.length,
          task_types: tasks.map(t => t.taskType),
        },
      });
  }
}

