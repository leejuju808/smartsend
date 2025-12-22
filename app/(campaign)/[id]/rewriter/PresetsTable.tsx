"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function PresetsTable({
  rows,
  onEdit,
  onPreview,
}: {
  rows: Array<{ id: string; scenario: string; tone: string; name: string; weight: number; is_active: boolean }>;
  onEdit: (id: string) => void;
  onPreview: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scenario</TableHead>
            <TableHead>Tone</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.scenario}</TableCell>
              <TableCell>{r.tone}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.weight}</TableCell>
              <TableCell>{r.is_active ? "Active" : "Off"}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(r.id)}>
                  Edit
                </Button>
                <Button size="sm" onClick={() => onPreview(r.id)}>
                  Preview
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}








