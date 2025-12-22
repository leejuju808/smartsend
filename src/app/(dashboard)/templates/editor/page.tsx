"use client";

import { TemplateRewriter } from '@/components/TemplateRewriter';

export default function TemplateEditorPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Smart Template Rewriter</h1>
      <TemplateRewriter />
    </div>
  );
}
