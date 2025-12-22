"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { AlertTriangle, ArrowUp, ArrowDown, Calendar } from "lucide-react";

interface CashflowEvent {
  id: string;
  event_type: string;
  amount: number;
  date: string;
  description?: string;
  status: string;
}

interface CashflowForecast {
  company_id: string;
  start_date: string;
  end_date: string;
  inflows: number;
  outflows: number;
  net: number;
  upcoming_events: CashflowEvent[];
  cashflow_tight: boolean;
}

interface CashflowForecastProps {
  companyId: string;
  forecast?: CashflowForecast | null;
  onRefresh?: () => void;
}

/**
 * Block 254200: Cashflow Forecast Engine
 * Predicts incoming payments, outgoing payables, and cashflow tightness
 */
export function CashflowForecast({ companyId, forecast, onRefresh }: CashflowForecastProps) {
  const [loading, setLoading] = React.useState(false);

  if (!forecast) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Loading cashflow forecast...
        </div>
      </Card>
    );
  }

  const isPositive = forecast.net > 0;
  const days = Math.ceil(
    (new Date(forecast.end_date).getTime() - new Date(forecast.start_date).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Cashflow Projection — Next {days} Days</h3>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Inflows</div>
          <div className="flex items-center gap-1">
            <ArrowUp className="h-4 w-4 text-green-600" />
            <span className="text-xl font-bold text-green-600">
              ${forecast.inflows.toLocaleString()}
            </span>
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">Outflows</div>
          <div className="flex items-center gap-1">
            <ArrowDown className="h-4 w-4 text-red-600" />
            <span className="text-xl font-bold text-red-600">
              ${forecast.outflows.toLocaleString()}
            </span>
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">Net</div>
          <div className={`text-xl font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
            ${forecast.net.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Cashflow Tight Warning */}
      {forecast.cashflow_tight && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Cashflow Tight Next Week</span>
          </div>
          <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            You have material POs due before receivables arrive. Review your cashflow forecast.
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      {forecast.upcoming_events && forecast.upcoming_events.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Upcoming Events</h4>
          <div className="space-y-2">
            {forecast.upcoming_events.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between text-sm p-2 bg-muted rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {new Date(event.date).toLocaleDateString()}
                  </span>
                  <span>{event.description || event.event_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={event.event_type.includes("payment") || event.event_type === "deposit" ? "text-green-600" : "text-red-600"}>
                    {event.event_type.includes("payment") || event.event_type === "deposit" ? "+" : "-"}
                    ${Math.abs(event.amount).toLocaleString()}
                  </span>
                  <Badge variant={event.status === "confirmed" ? "default" : "secondary"}>
                    {event.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}






















