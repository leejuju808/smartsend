// app/dashboard/contacts/_components/ContactsClient.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

type ContactRow = {
  id: string;
  workspace_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  created_at: string;
};

interface Props {
  contacts: ContactRow[];
}

type NewContactForm = {
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
};

function formatTimeAgo(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

export default function ContactsClient({ contacts }: Props) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [isCreating, startTransition] = useTransition();
  const [form, setForm] = useState<NewContactForm>({
    email: "",
    firstName: "",
    lastName: "",
    city: "",
    state: "",
  });

  function updateField<K extends keyof NewContactForm>(
    key: K,
    value: NewContactForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!form.email.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/contacts/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email.trim(),
            firstName: form.firstName.trim() || null,
            lastName: form.lastName.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
          }),
        });

        if (!res.ok) {
          console.error("Failed to create contact", await res.text());
          return;
        }

        setForm({
          email: "",
          firstName: "",
          lastName: "",
          city: "",
          state: "",
        });
        setShowNew(false);
        router.refresh();
      } catch (err) {
        console.error("Error creating contact", err);
      }
    });
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Homeowners and decision makers SmartSend can email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-full bg-primary px-4 py-[6px] text-xs font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow"
        >
          New contact
        </button>
      </header>

      <section className="relative flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Your contacts</h2>
          <span className="text-xs text-muted-foreground">
            {contacts.length} total
          </span>
        </div>

        <div className="h-[calc(100vh-260px)] overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <p className="text-sm text-muted-foreground">
                No contacts yet. Add a contact or enroll a list into a campaign
                to start sending.
              </p>
            </div>
          ) : (
            <div className="min-w-full text-sm">
              <div className="grid grid-cols-4 gap-2 border-b px-4 py-2 text-[11px] font-medium text-muted-foreground">
                <div className="col-span-2">Contact</div>
                <div>Location</div>
                <div className="text-right">Added</div>
              </div>

              <div className="divide-y">
                {contacts.map((c) => {
                  const name =
                    (c.first_name || "") +
                    (c.last_name ? ` ${c.last_name}` : "");
                  const displayName = name.trim() || c.email;

                  return (
                    <article
                      key={c.id}
                      className="grid grid-cols-4 gap-2 px-4 py-2 text-xs hover:bg-muted/60"
                    >
                      <div className="col-span-2 flex flex-col gap-[2px]">
                        <span className="font-medium">{displayName}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {c.email}
                        </span>
                        {c.source && (
                          <span className="text-[10px] text-muted-foreground">
                            Source: {c.source}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-[2px] text-[11px] text-muted-foreground">
                        {c.city || c.state ? (
                          <>
                            <span>
                              {c.city}
                              {c.city && c.state ? ", " : ""}
                              {c.state}
                            </span>
                          </>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end text-[11px] text-muted-foreground">
                        {formatTimeAgo(c.created_at)}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* New contact drawer */}
        {showNew && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">New contact</h2>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Add a single homeowner or decision maker. For imports, you'll
                use CSV or bulk enroll later.
              </p>

              <div className="mt-4 flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                    placeholder="homeowner@example.com"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    disabled={isCreating}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">
                      First name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      value={form.firstName}
                      onChange={(e) =>
                        updateField("firstName", e.target.value)
                      }
                      disabled={isCreating}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">
                      Last name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      value={form.lastName}
                      onChange={(e) =>
                        updateField("lastName", e.target.value)
                      }
                      disabled={isCreating}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">City</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">State</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      value={form.state}
                      onChange={(e) => updateField("state", e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
                <span className="text-[10px] text-muted-foreground">
                  Every contact here can be enrolled into any SmartSend
                  campaign.
                </span>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || !form.email.trim()}
                  className="rounded-full bg-primary px-4 py-[6px] text-[11px] font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? "Saving…" : "Save contact"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


























































