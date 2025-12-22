"use client";

import Link from "next/link";
import { Plus, Calendar, Rocket } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DashboardActions() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/contacts/new">
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New Contact
        </Button>
      </Link>
      <Link href="/campaigns/new">
        <Button variant="outline" className="flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          Start Campaign
        </Button>
      </Link>
      <Link href="/scheduler">
        <Button variant="outline" className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Book Appointment
        </Button>
      </Link>
    </div>
  );
}





















































