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
import { CampaignAnalytics } from "../types";
import { useState } from "react";

interface StepPerformanceTableProps {
  steps: CampaignAnalytics["steps"];
}

type SortBy = "step" | "replyRate" | "hot";

export function StepPerformanceTable({ steps }: StepPerformanceTableProps) {
  const [sortBy, setSortBy] = useState<SortBy>("step");
  const [sortAsc, setSortAsc] = useState(true);

  const sortedSteps = [...steps].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "step":
        comparison = a.stepName.localeCompare(b.stepName);
        break;
      case "replyRate":
        comparison = a.replyRate - b.replyRate;
        break;
      case "hot":
        comparison = a.hot - b.hot;
        break;
    }
    return sortAsc ? comparison : -comparison;
  });

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const handleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Sequence Step Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("step")}
              >
                Step
                {sortBy === "step" && (sortAsc ? " ↑" : " ↓")}
              </TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Replies</TableHead>
              <TableHead className="text-right">HOT</TableHead>
              <TableHead className="text-right">WARM</TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("replyRate")}
              >
                Reply Rate
                {sortBy === "replyRate" && (sortAsc ? " ↑" : " ↓")}
              </TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("hot")}
              >
                Hot Rate
                {sortBy === "hot" && (sortAsc ? " ↑" : " ↓")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSteps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No step data available
                </TableCell>
              </TableRow>
            ) : (
              sortedSteps.map((step, idx) => (
                <TableRow key={step.stepId || idx}>
                  <TableCell className="font-medium">{step.stepName}</TableCell>
                  <TableCell className="text-right">
                    {step.sent.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {step.replies.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-red-600 font-medium">
                    {step.hot.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    {step.warm.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(step.replyRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(step.hotRate)}
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





























































