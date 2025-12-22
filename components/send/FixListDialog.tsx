"use client";

import * as React from "react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";

type Blocked = { email: string; reason: "invalid" | "suppressed_global" | "suppressed_campaign" | "duplicate_in_payload" };

export function FixListDialog(props: {
  blocked: Blocked[];
  onExcludeAll: () => void;
  disabled?: boolean;
}) {
  const reasonLabel: Record<Blocked["reason"], string> = {
    invalid: "Invalid",
    suppressed_global: "Global Suppression",
    suppressed_campaign: "Campaign Suppression",
    duplicate_in_payload: "Duplicate"
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={props.disabled}>Fix list</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review blocked recipients</DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-auto rounded-2xl border">
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {props.blocked.map((b, i) => (
                <TR key={i}>
                  <TD className="font-mono text-xs">{b.email}</TD>
                  <TD>
                    <Badge>{reasonLabel[b.reason]}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <Button onClick={props.onExcludeAll} disabled={props.disabled}>Exclude all & continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}