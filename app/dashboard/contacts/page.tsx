// app/dashboard/contacts/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import ContactsClient from "./_components/ContactsClient";

export const metadata: Metadata = {
  title: "Contacts · SmartSend",
};

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

async function loadContacts(): Promise<ContactRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `
      id,
      workspace_id,
      email,
      first_name,
      last_name,
      city,
      state,
      source,
      created_at
    `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    console.error("Error loading contacts:", error);
    return [];
  }

  return data as ContactRow[];
}

export default async function ContactsPage() {
  const contacts = await loadContacts();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <ContactsClient contacts={contacts} />
    </div>
  );
}


























































