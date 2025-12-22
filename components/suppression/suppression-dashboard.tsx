"use client";

import * as React from "react";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
// If you have a Select component from shadcn, use it; otherwise we'll fake it with an <select>
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type SuppressionRow = {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  created_at: string;
};

type SuppressionDashboardProps = {
  workspaceId: string;
};

const PAGE_SIZE = 20;

export function SuppressionDashboard({ workspaceId }: SuppressionDashboardProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const { push: toast } = useToast();

  const [rows, setRows] = React.useState<SuppressionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [bulkLoading, setBulkLoading] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [reason, setReason] = React.useState("");

  // 🔍 Filters & pagination
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState(""); // debounced
  const [sourceFilter, setSourceFilter] = React.useState<
    "all" | "manual" | "bounce" | "complaint" | "spamtrap" | "admin" | "api"
  >("all");
  const [page, setPage] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Debounce search input a bit so we don't hammer Supabase
  React.useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1); // reset to first page on new search
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("global_suppressions")
      .select("id, email, reason, source, created_at", {
        count: "exact",
      })
      .eq("workspace_id", workspaceId);

    if (search) {
      query = query.ilike("email", `%${search}%`);
    }

    if (sourceFilter !== "all") {
      query = query.eq("source", sourceFilter);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Failed to load suppression list",
        description: error.message,
      });
    } else {
      setRows((data || []) as SuppressionRow[]);
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  }, [supabase, workspaceId, search, sourceFilter, page, toast]);

  React.useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        type: "error",
        title: "Email required",
        description: "Please enter an email to suppress.",
      });
      return;
    }

    setCreating(true);

    const { error } = await supabase.from("global_suppressions").insert({
      workspace_id: workspaceId,
      email: email.trim(),
      reason: reason.trim() || null,
      source: "manual",
    });

    if (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Failed to add suppression",
        description: error.message,
      });
    } else {
      toast({
        type: "success",
        title: "Email suppressed",
        description: `${email.trim()} added to global do-not-send list.`,
      });
      setEmail("");
      setReason("");
      // reload first page for fresh view
      setPage(1);
      await fetchRows();
    }

    setCreating(false);
  };

  const handleDelete = async (id: string, targetEmail: string) => {
    const prev = rows;
    setRows((r) => r.filter((row) => row.id !== id));

    const { error } = await supabase
      .from("global_suppressions")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error(error);
      // rollback
      setRows(prev);

      toast({
        type: "error",
        title: "Failed to remove suppression",
        description: error.message,
      });
    } else {
      toast({
        type: "success",
        title: "Suppression removed",
        description: `${targetEmail} removed from do-not-send list.`,
      });
      // Optionally, refetch to keep pagination/count in sync
      await fetchRows();
    }
  };

  const handleAutoSuppressBounces = async () => {
    setBulkLoading(true);

    const { data, error } = await supabase.rpc(
      "auto_suppress_recent_bounces",
      {
        p_workspace_id: workspaceId,
        p_days: 30,
      }
    );

    setBulkLoading(false);

    if (error) {
      console.error(error);
      toast({
        type: "error",
        title: "Auto-suppress failed",
        description: error.message,
      });
      return;
    }

    const addedCount = typeof data === "number" ? data : 0;

    toast({
      type: "success",
      title: "Auto-suppressed recent bounces",
      description:
        addedCount > 0
          ? `Added or updated ${addedCount} email(s) from recent bounces/complaints.`
          : "No recent bounce/complaint emails to suppress.",
    });

    setPage(1);
    await fetchRows();
  };

  const handlePrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setPage((p) => Math.min(totalPages, p + 1));
  };

  return (
    <div className="space-y-6">
      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
      >
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">
            Email to suppress
          </label>
          <Input
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">
            Reason (optional)
          </label>
          <Input
            placeholder="Bounce, complaint, unsubscribed..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={creating}
          >
            {creating && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add to list
          </Button>
        </div>
      </form>

      {/* Filters row */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={sourceFilter}
            onValueChange={(val) => {
              setSourceFilter(
                val as
                  | "all"
                  | "manual"
                  | "bounce"
                  | "complaint"
                  | "spamtrap"
                  | "admin"
                  | "api"
              );
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Source filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="bounce">Bounce</SelectItem>
              <SelectItem value="complaint">Complaint</SelectItem>
              <SelectItem value="spamtrap">Spamtrap</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            onClick={handleAutoSuppressBounces}
          >
            {bulkLoading && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            Auto-suppress recent bounces
          </Button>
        </div>
      </div>

      {/* Table + pagination */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Added
                </TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading suppression list...
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No suppressed emails found
                      {search || sourceFilter !== "all"
                        ? " for the current filters."
                        : " yet. Add one above to get started."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.email}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.reason || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">
                        {row.source || "manual"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(row.id, row.email)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls */}
        <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <div>
            Showing{" "}
            <span className="font-medium">
              {rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}
            </span>{" "}
            –{" "}
            <span className="font-medium">
              {(page - 1) * PAGE_SIZE + rows.length}
            </span>{" "}
            of{" "}
            <span className="font-medium">{totalCount}</span> suppressed
            email(s)
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={page <= 1 || loading}
            >
              Prev
            </Button>
            <span>
              Page{" "}
              <span className="font-medium">
                {page}
              </span>{" "}
              of{" "}
              <span className="font-medium">
                {totalPages}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
