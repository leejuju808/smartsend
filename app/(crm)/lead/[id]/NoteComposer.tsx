"use client";

import { useState } from "react";
import useSWRMutation from "swr/mutation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

async function postNote(url: string, { arg }: { arg: { body: string } }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error ?? "Failed to add note");
  }
  return json;
}

export default function NoteComposer({ leadId }: { leadId: string }) {
  const [value, setValue] = useState("");
  const { trigger, isMutating } = useSWRMutation(`/api/leads/${leadId}/notes`, postNote);

  const save = async () => {
    if (!value.trim()) {
      toast.error("Note cannot be empty");
      return;
    }
    try {
      await trigger({ body: value });
      toast.success("Note added");
      setValue("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add an internal note… Use @name to mention."
        rows={4}
      />
      <div className="flex justify-end">
        <Button onClick={save} disabled={isMutating}>
          Add note
        </Button>
      </div>
    </div>
  );
}


