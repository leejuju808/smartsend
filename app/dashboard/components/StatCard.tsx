"use client";

import Link from "next/link";
import { Card, CardContent } from "@/src/components/ui/Card";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  href?: string;
}

export function StatCard({ label, value, subtext, href }: StatCardProps) {
  const content = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-6">
        <div className="text-sm font-medium text-muted-foreground mb-1">{label}</div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        {subtext && (
          <div className="text-xs text-muted-foreground">{subtext}</div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

