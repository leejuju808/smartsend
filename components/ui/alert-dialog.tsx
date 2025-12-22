"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const AlertDialog = Dialog;

export function AlertDialogAction({
  children,
  onClick,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </Button>
  );
}

export function AlertDialogCancel({
  children,
  onClick,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </Button>
  );
}

export const AlertDialogContent = DialogContent;
export const AlertDialogDescription = DialogDescription;
export const AlertDialogFooter = DialogFooter;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogTitle = DialogTitle;














