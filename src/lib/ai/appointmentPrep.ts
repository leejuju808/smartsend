// Block 18500 — SmartSend Photo Intelligence v1
// Auto-Appointment Prep Logic
// Determines tools needed, appointment duration, rep assignment, weather-safe times

import { PhotoIntelligenceResult } from "./photoIntelligence";

export interface AppointmentPrepResult {
  toolsNeeded: string[];
  estimatedDuration: number; // minutes
  recommendedRepType: string | null; // 'metal_specialist', 'tile_specialist', 'general', etc.
  weatherSafe: boolean;
  daylightRequired: boolean;
  urgencyLevel: 'emergency' | 'urgent' | 'normal' | 'routine';
  suggestedTimeSlots: string[]; // ISO date strings
  travelTimeEstimate: number; // minutes
  notes: string[];
}

export function prepareAppointmentFromPhoto(
  photoAnalysis: PhotoIntelligenceResult,
  contactAddress?: string
): AppointmentPrepResult {
  const toolsNeeded: string[] = [];
  const notes: string[] = [];
  let estimatedDuration = 60; // Base 1 hour
  let recommendedRepType: string | null = null;
  let weatherSafe = true;
  let daylightRequired = true;
  let urgencyLevel: 'emergency' | 'urgent' | 'normal' | 'routine' = 'normal';
  const suggestedTimeSlots: string[] = [];
  let travelTimeEstimate = 30; // Default 30 minutes

  // Determine urgency
  if (photoAnalysis.isEmergency || photoAnalysis.leakDetected) {
    urgencyLevel = 'emergency';
    estimatedDuration = 90; // Longer for emergency
  } else if (photoAnalysis.severityScore >= 80) {
    urgencyLevel = 'urgent';
    estimatedDuration = 75;
  } else if (photoAnalysis.severityScore >= 40) {
    urgencyLevel = 'normal';
  } else {
    urgencyLevel = 'routine';
    estimatedDuration = 45;
  }

  // Material-specific prep
  if (photoAnalysis.materialType === 'metal') {
    recommendedRepType = 'metal_specialist';
    toolsNeeded.push('Metal inspection tools');
    toolsNeeded.push('Metal-safe ladder');
    toolsNeeded.push('Metal roof boots');
    notes.push('Metal roof detected - ensure rep has metal roof experience');
    estimatedDuration += 15; // Extra time for metal
  } else if (photoAnalysis.materialType === 'tile') {
    recommendedRepType = 'tile_specialist';
    toolsNeeded.push('Tile-safe footwear');
    toolsNeeded.push('Tile inspection tools');
    notes.push('Tile roof detected - use tile-safe footwear to prevent damage');
    estimatedDuration += 20; // Extra time for tile
  } else if (photoAnalysis.materialType === 'flat_tpo' || photoAnalysis.materialType === 'flat_epdm') {
    recommendedRepType = 'flat_roof_specialist';
    toolsNeeded.push('Flat roof inspection tools');
    toolsNeeded.push('Moisture meter');
    notes.push('Flat roof detected - bring moisture meter for leak detection');
    estimatedDuration += 10;
  }

  // Leak-specific prep
  if (photoAnalysis.leakDetected || photoAnalysis.waterIntrusionDetected) {
    toolsNeeded.push('Moisture meter');
    toolsNeeded.push('Thermal camera (if available)');
    toolsNeeded.push('Leak detection tools');
    notes.push('Leak detected - prioritize moisture detection');
    if (photoAnalysis.interiorDamageDetected) {
      toolsNeeded.push('Attic access equipment');
      notes.push('Interior damage detected - request attic access');
      estimatedDuration += 30; // Extra time for interior inspection
    }
  }

  // Storm damage prep
  if (photoAnalysis.stormDamageDetected) {
    toolsNeeded.push('Hail damage assessment tools');
    toolsNeeded.push('Measuring tape');
    toolsNeeded.push('Camera for documentation');
    notes.push('Storm damage detected - document thoroughly for insurance');
    estimatedDuration += 20; // Extra time for documentation
  }

  // Gutter/flashing prep
  if (photoAnalysis.gutterDamageDetected) {
    toolsNeeded.push('Gutter inspection tools');
    toolsNeeded.push('Ladder extension');
    notes.push('Gutter damage detected - ensure safe ladder access');
    estimatedDuration += 15;
  }

  // Skylight prep
  if (photoAnalysis.crackedSkylight || photoAnalysis.skylightType) {
    toolsNeeded.push('Skylight inspection tools');
    notes.push('Skylight detected - check for leaks and damage');
    estimatedDuration += 10;
  }

  // Chimney prep
  if (photoAnalysis.chimneyConfiguration) {
    toolsNeeded.push('Chimney flashing inspection tools');
    notes.push('Chimney detected - inspect flashing and sealant');
    estimatedDuration += 10;
  }

  // Weather considerations
  if (photoAnalysis.leakDetected || photoAnalysis.waterIntrusionDetected) {
    weatherSafe = false; // Don't schedule during rain
    notes.push('Leak detected - avoid scheduling during rain');
  }

  // Always require daylight for roof inspections
  daylightRequired = true;

  // Generate suggested time slots
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9 AM

  if (urgencyLevel === 'emergency') {
    // Emergency: offer slots today and tomorrow morning
    const todayAfternoon = new Date(now);
    todayAfternoon.setHours(14, 0, 0, 0); // 2 PM today
    if (todayAfternoon > now) {
      suggestedTimeSlots.push(todayAfternoon.toISOString());
    }
    suggestedTimeSlots.push(tomorrow.toISOString());
    const tomorrowAfternoon = new Date(tomorrow);
    tomorrowAfternoon.setHours(14, 0, 0, 0);
    suggestedTimeSlots.push(tomorrowAfternoon.toISOString());
  } else if (urgencyLevel === 'urgent') {
    // Urgent: offer tomorrow and day after
    suggestedTimeSlots.push(tomorrow.toISOString());
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(9, 0, 0, 0);
    suggestedTimeSlots.push(dayAfter.toISOString());
  } else {
    // Normal/Routine: offer this week
    for (let i = 1; i <= 3; i++) {
      const slot = new Date(tomorrow);
      slot.setDate(slot.getDate() + i);
      slot.setHours(9, 0, 0, 0);
      suggestedTimeSlots.push(slot.toISOString());
    }
  }

  // Add PPE to tools
  toolsNeeded.push('Safety harness');
  toolsNeeded.push('Hard hat');
  toolsNeeded.push('Safety glasses');

  return {
    toolsNeeded: [...new Set(toolsNeeded)], // Remove duplicates
    estimatedDuration,
    recommendedRepType,
    weatherSafe,
    daylightRequired,
    urgencyLevel,
    suggestedTimeSlots,
    travelTimeEstimate,
    notes,
  };
}





















































