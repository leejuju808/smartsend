"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VariablesSidebar } from "./VariablesSidebar";
import { RoofingSnippetsLibrary } from "./RoofingSnippetsLibrary";
import { AIRewriteModal } from "./AIRewriteModal";
import { StepLibrary } from "./StepLibrary";
import { HTMLPreview } from "./HTMLPreview";
import { RoofingPresets } from "./RoofingPresets";

interface EnhancedStepEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  className?: string;
}

export function EnhancedStepEditor({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  className,
}: EnhancedStepEditorProps) {
  const [selectedText, setSelectedText] = useState("");
  const [rewriteModalOpen, setRewriteModalOpen] = useState(false);
  const [showVariablesSidebar, setShowVariablesSidebar] = useState(true);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (text: string, target: "subject" | "body") => {
    const ref = target === "subject" ? subjectRef : bodyRef;
    const element = ref.current;
    if (!element) return;

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const currentValue = element.value;
    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);

    if (target === "subject") {
      onSubjectChange(newValue);
    } else {
      onBodyChange(newValue);
    }

    // Restore cursor position
    setTimeout(() => {
      element.focus();
      element.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const handleInsertVariable = (variable: string) => {
    // Determine which field is focused
    const activeElement = document.activeElement;
    if (activeElement === subjectRef.current) {
      insertAtCursor(variable, "subject");
    } else if (activeElement === bodyRef.current) {
      insertAtCursor(variable, "body");
    } else {
      // Default to body if nothing focused
      insertAtCursor(variable, "body");
    }
  };

  const handleInsertSnippet = (snippet: string) => {
    insertAtCursor(snippet, "body");
  };

  const handleInsertTemplate = (template: { subject: string | null; body: string }) => {
    if (template.subject) {
      onSubjectChange(template.subject);
    }
    onBodyChange(template.body);
  };

  const handleLoadPreset = (preset: { subject: string; body: string }) => {
    onSubjectChange(preset.subject);
    onBodyChange(preset.body);
  };

  const handleRewrite = () => {
    const activeElement = document.activeElement;
    let text = "";

    if (activeElement === subjectRef.current) {
      text = subjectRef.current.value.substring(
        subjectRef.current.selectionStart || 0,
        subjectRef.current.selectionEnd || 0
      );
    } else if (activeElement === bodyRef.current) {
      text = bodyRef.current.value.substring(
        bodyRef.current.selectionStart || 0,
        bodyRef.current.selectionEnd || 0
      );
    }

    if (!text.trim()) {
      // If no selection, use the entire body
      text = body;
    }

    setSelectedText(text);
    setRewriteModalOpen(true);
  };

  const handleRewriteComplete = (rewrittenText: string) => {
    const activeElement = document.activeElement;
    if (activeElement === subjectRef.current) {
      const start = subjectRef.current.selectionStart || 0;
      const end = subjectRef.current.selectionEnd || 0;
      const currentValue = subjectRef.current.value;
      const newValue = currentValue.substring(0, start) + rewrittenText + currentValue.substring(end);
      onSubjectChange(newValue);
    } else {
      const start = bodyRef.current?.selectionStart || 0;
      const end = bodyRef.current?.selectionEnd || 0;
      const currentValue = bodyRef.current?.value || "";
      const newValue = currentValue.substring(0, start) + rewrittenText + currentValue.substring(end);
      onBodyChange(newValue);
    }
  };

  return (
    <div className={`flex gap-4 ${className}`}>
      {/* Variables Sidebar */}
      {showVariablesSidebar && (
        <VariablesSidebar onInsertVariable={handleInsertVariable} />
      )}

      {/* Main Editor Area */}
      <div className="flex-1 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVariablesSidebar(!showVariablesSidebar)}
            >
              {showVariablesSidebar ? "Hide" : "Show"} Variables
            </Button>
            <RoofingSnippetsLibrary onInsertSnippet={handleInsertSnippet} />
            <Button variant="outline" size="sm" onClick={handleRewrite}>
              Rewrite with AI
            </Button>
          </div>
          <StepLibrary
            onInsertTemplate={handleInsertTemplate}
            currentSubject={subject}
            currentBody={body}
          />
        </div>

        {/* Roofing Presets */}
        <RoofingPresets onLoadPreset={handleLoadPreset} />

        {/* Editor Tabs */}
        <Tabs defaultValue="edit" className="w-full">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                ref={subjectRef}
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Email subject line"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                ref={bodyRef}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                placeholder="Email body content"
                rows={12}
                className="mt-1 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use variables like {"{first_name}"}, {"{city}"}, etc. Click variables in the sidebar to insert.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <HTMLPreview subject={subject} body={body} />
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Rewrite Modal */}
      <AIRewriteModal
        open={rewriteModalOpen}
        onOpenChange={setRewriteModalOpen}
        selectedText={selectedText}
        onRewrite={handleRewriteComplete}
      />
    </div>
  );
}




























































