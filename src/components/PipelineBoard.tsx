"use client";

// Block 21845 — SmartSend Roofing Pipeline Board v1
// This is the main pipeline board component for roofing companies
// It uses the new RoofingPipelineBoard component for the kanban view

import { RoofingPipelineBoard } from "./pipeline/RoofingPipelineBoard";

export default function PipelineBoard() {
  return <RoofingPipelineBoard />;
}