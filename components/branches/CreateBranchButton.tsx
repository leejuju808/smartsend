"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateBranchDialog } from "./CreateBranchDialog";

export function CreateBranchButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create Branch
      </button>
      <CreateBranchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}





















