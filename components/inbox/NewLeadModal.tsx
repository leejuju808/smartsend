// Block 20180 — New Lead Modal (Manual Capture)

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface TeamMember {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

interface NewLeadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (conversation: any) => void;
}

export function NewLeadModal({ open, onClose, onCreated }: NewLeadModalProps) {
  const [homeownerName, setHomeownerName] = useState("");
  const [homeownerEmail, setHomeownerEmail] = useState("");
  const [homeownerPhone, setHomeownerPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [estValue, setEstValue] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    async function loadMembers() {
      setLoadingMembers(true);
      try {
        const res = await fetch("/api/team/members");
        const json = await res.json();
        setMembers(json.members ?? []);
      } catch (err) {
        console.error("Failed to load team members", err);
      } finally {
        setLoadingMembers(false);
      }
    }
    loadMembers();
  }, [open]);

  function reset() {
    setHomeownerName("");
    setHomeownerEmail("");
    setHomeownerPhone("");
    setPropertyAddress("");
    setInitialNote("");
    setEstValue("");
    setAssignedTo("unassigned");
  }

  async function handleCreate() {
    if (
      !homeownerName.trim() &&
      !homeownerEmail.trim() &&
      !homeownerPhone.trim()
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inbox/manual-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_name: homeownerName || null,
          homeowner_email: homeownerEmail || null,
          homeowner_phone: homeownerPhone || null,
          property_address: propertyAddress || null,
          initial_note: initialNote || null,
          estimated_job_value: estValue ? Number(estValue) : null,
          lead_stage: "new",
          assigned_to_user_id:
            assignedTo === "unassigned" ? null : assignedTo,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create lead");
      }

      if (json?.conversation && onCreated) {
        onCreated(json.conversation);
        reset();
        onClose();
      }
    } catch (error: any) {
      console.error("Error creating lead:", error);
      alert(error.message || "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add new lead (phone / walk-in)" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Homeowner name
            </label>
            <input
              type="text"
              value={homeownerName}
              onChange={(e) => setHomeownerName(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="John Smith"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Homeowner phone
            </label>
            <input
              type="tel"
              value={homeownerPhone}
              onChange={(e) => setHomeownerPhone(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="(555) 123-4567"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Homeowner email
            </label>
            <input
              type="email"
              value={homeownerEmail}
              onChange={(e) => setHomeownerEmail(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Property address
            </label>
            <input
              type="text"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="123 Main St, City"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Estimated job value ($)
            </label>
            <input
              type="number"
              min={0}
              value={estValue}
              onChange={(e) => setEstValue(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="e.g. 12000"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Assigned to
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white"
            >
              <option value="unassigned">
                {loadingMembers ? "Loading team…" : "Unassigned"}
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email || m.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Initial note (what did they say?)
          </label>
          <textarea
            value={initialNote}
            onChange={(e) => setInitialNote(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-2 py-1 text-xs resize-none"
            placeholder="Leak in master bedroom, storm damage last week, prefers afternoons, etc."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-full border border-gray-300 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create lead"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

















































