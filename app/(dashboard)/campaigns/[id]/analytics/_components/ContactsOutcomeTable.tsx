"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/Badge";
import { CampaignAnalytics } from "../types";
import { useState, useMemo } from "react";
import Link from "next/link";

interface ContactsOutcomeTableProps {
  contacts: CampaignAnalytics["contacts"];
}

type FilterType = "all" | "hot" | "warm" | "replied" | "not_replied";

export function ContactsOutcomeTable({ contacts }: ContactsOutcomeTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Apply filter
    if (filter === "hot") {
      filtered = filtered.filter((c) => c.latestIntent === "hot");
    } else if (filter === "warm") {
      filtered = filtered.filter((c) => c.latestIntent === "warm");
    } else if (filter === "replied") {
      filtered = filtered.filter((c) => c.replied);
    } else if (filter === "not_replied") {
      filtered = filtered.filter((c) => !c.replied);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [contacts, filter, searchQuery]);

  const getIntentBadgeVariant = (intent: string) => {
    switch (intent) {
      case "hot":
        return "destructive";
      case "warm":
        return "default";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>All Contacts in Campaign</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="px-3 py-1.5 text-sm border rounded-md bg-background"
            >
              <option value="all">All</option>
              <option value="hot">HOT</option>
              <option value="warm">WARM</option>
              <option value="replied">Replied</option>
              <option value="not_replied">Not Replied</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest Intent</TableHead>
              <TableHead>Replied?</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead>Reply Step</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {searchQuery || filter !== "all"
                    ? "No contacts match your filters"
                    : "No contacts in this campaign"}
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow key={contact.contactId}>
                  <TableCell>
                    <Link
                      href={`/contacts/${contact.contactId}`}
                      className="font-medium hover:underline"
                    >
                      {contact.name || "Unknown"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contact.replied ? "default" : "outline"}>
                      {contact.status === "replied" ? "Replied" : "Not Replied"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getIntentBadgeVariant(contact.latestIntent)}>
                      {contact.latestIntent.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contact.replied ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(contact.lastActivity)}
                  </TableCell>
                  <TableCell>{contact.repliesCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.replyStepName || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

