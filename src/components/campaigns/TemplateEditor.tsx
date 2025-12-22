"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SmartTemplateRewriter } from "@/components/templates/SmartTemplateRewriter";
import { SmartTemplateVariants } from "@/components/templates/SmartTemplateVariants";
import { SaveAsTemplateButton } from "@/components/templates/SaveAsTemplateButton";
import { TemplateLibraryDrawer } from "@/components/templates/TemplateLibraryDrawer";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type TemplateEditorProps = {
  initialSubject: string;
  initialBody: string;
  onChange?: (val: { subject: string; body: string }) => void;
  currentUserId?: string | null;
};

export function TemplateEditor({
  initialSubject,
  initialBody,
  onChange,
  currentUserId: propCurrentUserId,
}: TemplateEditorProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    propCurrentUserId || null
  );
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!propCurrentUserId) {
      // Fetch current user ID if not provided
      supabase.auth.getUser().then(({ data: { user } }) => {
        setCurrentUserId(user?.id || null);
      });
    }
  }, [propCurrentUserId, supabase]);

  const propagate = (next: { subject?: string; body?: string }) => {
    const newSubject = next.subject ?? subject;
    const newBody = next.body ?? body;
    setSubject(newSubject);
    setBody(newBody);
    onChange?.({ subject: newSubject, body: newBody });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-200">
          Subject
        </label>
        <Input
          className="h-8 text-[12px]"
          value={subject}
          onChange={(e) => propagate({ subject: e.target.value })}
          placeholder="Quick question about {{company}}'s outbound…"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-medium text-slate-200">
            Email body
          </label>
          <div className="flex items-center gap-2">
            <SaveAsTemplateButton subject={subject} body={body} />
            <TemplateLibraryDrawer
              currentUserId={currentUserId}
              onInsert={(tpl) =>
                propagate({
                  subject: tpl.subject,
                  body: tpl.body,
                })
              }
            />
            <SmartTemplateRewriter
              subject={subject}
              body={body}
              onRewrite={propagate}
            />
          </div>
        </div>
        <Textarea
          className="min-h-[220px] text-[12px] font-mono"
          value={body}
          onChange={(e) => propagate({ body: e.target.value })}
          placeholder={`Hey {{first_name}},\n\nI saw {{company}} is...`}
        />
      </div>

      {/* 🔥 New: Variant generator */}
      <SmartTemplateVariants
        subject={subject}
        body={body}
        onUseVariant={(variant) =>
          propagate({
            subject: variant.subject,
            body: variant.body,
          })
        }
      />
    </div>
  );
}

