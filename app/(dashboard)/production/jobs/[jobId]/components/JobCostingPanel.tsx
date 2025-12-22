"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plus,
  Upload,
  Trash2,
  Edit,
  Clock,
  Users,
  Package,
  Wrench,
  Trash,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface JobCostingPanelProps {
  jobId: string;
}

interface CostData {
  costs: any;
  costItems: any[];
  crewHours: any[];
  warnings: any[];
}

export function JobCostingPanel({ jobId }: JobCostingPanelProps) {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [addCrewHoursOpen, setAddCrewHoursOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [costForm, setCostForm] = useState({
    category: "materials",
    description: "",
    vendor: "",
    amount: "",
    cost_date: new Date().toISOString().split("T")[0],
    notes: "",
    material_type: "",
    quantity: "",
    unit: "",
    unit_cost: "",
    crew_name: "",
    hours: "",
    hourly_rate: "",
  });

  const [crewHoursForm, setCrewHoursForm] = useState({
    crew_name: "",
    start_time: "",
    end_time: "",
    hourly_rate: "",
    crew_size: "1",
    crew_members: [] as string[],
    work_type: "tear_off",
    issues: "",
  });

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/profit/calculate`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Error loading cost data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const handleAddCost = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costForm),
      });

      if (response.ok) {
        setAddCostOpen(false);
        setCostForm({
          category: "materials",
          description: "",
          vendor: "",
          amount: "",
          cost_date: new Date().toISOString().split("T")[0],
          notes: "",
          material_type: "",
          quantity: "",
          unit: "",
          unit_cost: "",
          crew_name: "",
          hours: "",
          hourly_rate: "",
        });
        loadData();
      }
    } catch (error) {
      console.error("Error adding cost:", error);
    }
  };

  const handleAddCrewHours = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/crew-hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...crewHoursForm,
          start_time: new Date(crewHoursForm.start_time).toISOString(),
          end_time: crewHoursForm.end_time
            ? new Date(crewHoursForm.end_time).toISOString()
            : null,
          hourly_rate: parseFloat(crewHoursForm.hourly_rate),
          crew_size: parseInt(crewHoursForm.crew_size),
        }),
      });

      if (response.ok) {
        setAddCrewHoursOpen(false);
        setCrewHoursForm({
          crew_name: "",
          start_time: "",
          end_time: "",
          hourly_rate: "",
          crew_size: "1",
          crew_members: [],
          work_type: "tear_off",
          issues: "",
        });
        loadData();
      }
    } catch (error) {
      console.error("Error adding crew hours:", error);
    }
  };

  const handleDeleteCost = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this cost item?")) return;

    try {
      const response = await fetch(
        `/api/jobs/${jobId}/costs/${itemId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error deleting cost:", error);
    }
  };

  const handleDeleteCrewHours = async (hourId: string) => {
    if (!confirm("Are you sure you want to delete this crew hours entry?"))
      return;

    try {
      const response = await fetch(
        `/api/jobs/${jobId}/crew-hours/${hourId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error deleting crew hours:", error);
    }
  };

  const handleUploadReceipt = async (
    file: File,
    costItemId?: string
  ) => {
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (costItemId) {
        formData.append("cost_item_id", costItemId);
      }

      const response = await fetch(
        `/api/jobs/${jobId}/costs/receipt/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error uploading receipt:", error);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleAcknowledgeWarning = async (warningId: string) => {
    try {
      const response = await fetch(
        `/api/jobs/${jobId}/warnings/${warningId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledged: true }),
        }
      );

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error acknowledging warning:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-zinc-400">Loading cost data...</div>
        </CardContent>
      </Card>
    );
  }

  const costs = data?.costs;
  const costItems = data?.costItems || [];
  const crewHours = data?.crewHours || [];
  const warnings = data?.warnings || [];

  const margin = costs?.margin || 0;
  const profit = costs?.profit || 0;
  const totalCost = costs?.total_cost || 0;
  const revenue = costs?.actual_revenue || costs?.projected_revenue || 0;

  const marginColor =
    margin < 20
      ? "text-red-500"
      : margin < 30
      ? "text-orange-500"
      : margin < 35
      ? "text-yellow-500"
      : "text-green-500";

  return (
    <div className="space-y-4">
      {/* Profit Warnings */}
      {warnings.length > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-500">
              <AlertTriangle className="h-5 w-5" />
              Profit Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warnings.map((warning) => (
                <div
                  key={warning.id}
                  className="flex items-center justify-between rounded-lg border border-orange-500/30 bg-orange-500/10 p-3"
                >
                  <div className="flex-1">
                    <p className="font-medium text-orange-200">
                      {warning.message}
                    </p>
                    {warning.details && (
                      <p className="mt-1 text-sm text-orange-300/80">
                        {warning.details.variance && (
                          <span>
                            Variance: {warning.details.variance > 0 ? "+" : ""}
                            {warning.details.variance.toFixed(2)}%
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAcknowledgeWarning(warning.id)}
                  >
                    Acknowledge
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profit Summary Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Job Profit Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-zinc-400">Revenue</p>
              <p className="text-2xl font-bold text-zinc-50">
                {formatCurrency(revenue)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total Cost</p>
              <p className="text-2xl font-bold text-zinc-50">
                {formatCurrency(totalCost)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Gross Profit</p>
              <p
                className={`text-2xl font-bold ${
                  profit >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {formatCurrency(profit)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Margin</p>
              <p className={`text-2xl font-bold ${marginColor}`}>
                {margin.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mt-6 border-t border-zinc-800 pt-6">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">
              Cost Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-400">Materials</p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatCurrency(costs?.materials_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Labor</p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatCurrency(costs?.labor_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Equipment</p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatCurrency(costs?.equipment_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Dumpster</p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatCurrency(costs?.dumpster_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Supplements</p>
                <p className="text-lg font-semibold text-green-500">
                  -{formatCurrency(costs?.supplements)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Change Orders</p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatCurrency(costs?.change_orders)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Items and Crew Hours Tabs */}
      <Tabs defaultValue="costs" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="costs">Cost Items</TabsTrigger>
          <TabsTrigger value="crew-hours">Crew Hours</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cost Items</CardTitle>
              <Dialog open={addCostOpen} onOpenChange={setAddCostOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cost
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Cost Item</DialogTitle>
                    <DialogDescription>
                      Add a new cost entry for this job
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={costForm.category}
                        onValueChange={(value) =>
                          setCostForm({ ...costForm, category: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="materials">Materials</SelectItem>
                          <SelectItem value="labor">Labor</SelectItem>
                          <SelectItem value="equipment">Equipment</SelectItem>
                          <SelectItem value="dumpster">Dumpster</SelectItem>
                          <SelectItem value="supplements">Supplements</SelectItem>
                          <SelectItem value="change_order">
                            Change Order
                          </SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={costForm.amount}
                        onChange={(e) =>
                          setCostForm({ ...costForm, amount: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input
                        value={costForm.description}
                        onChange={(e) =>
                          setCostForm({
                            ...costForm,
                            description: e.target.value,
                          })
                        }
                        placeholder="e.g., Shingles, Underlayment"
                      />
                    </div>
                    <div>
                      <Label>Vendor</Label>
                      <Input
                        value={costForm.vendor}
                        onChange={(e) =>
                          setCostForm({ ...costForm, vendor: e.target.value })
                        }
                        placeholder="Supplier name"
                      />
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={costForm.cost_date}
                        onChange={(e) =>
                          setCostForm({ ...costForm, cost_date: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={costForm.notes}
                        onChange={(e) =>
                          setCostForm({ ...costForm, notes: e.target.value })
                        }
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddCostOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddCost}>Add Cost</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {costItems.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No cost items yet. Add your first cost entry.
                </div>
              ) : (
                <div className="space-y-2">
                  {costItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.category}</Badge>
                          <span className="font-medium text-zinc-50">
                            {item.description || "No description"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-zinc-400">
                          {item.vendor && (
                            <span>Vendor: {item.vendor}</span>
                          )}
                          {item.cost_date && (
                            <span>
                              {format(new Date(item.cost_date), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-zinc-50">
                          {formatCurrency(item.amount)}
                        </span>
                        {item.receipt_url ? (
                          <a
                            href={item.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        ) : (
                          <label className="cursor-pointer text-zinc-400 hover:text-zinc-300">
                            <Upload className="h-4 w-4" />
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.png,.jpg,.jpeg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadReceipt(file, item.id);
                                }
                              }}
                            />
                          </label>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCost(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crew-hours" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Crew Hours</CardTitle>
              <Dialog
                open={addCrewHoursOpen}
                onOpenChange={setAddCrewHoursOpen}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Hours
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Crew Hours</DialogTitle>
                    <DialogDescription>
                      Track crew time on this job
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Crew Name</Label>
                      <Input
                        value={crewHoursForm.crew_name}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            crew_name: e.target.value,
                          })
                        }
                        placeholder="Crew name"
                      />
                    </div>
                    <div>
                      <Label>Start Time *</Label>
                      <Input
                        type="datetime-local"
                        value={crewHoursForm.start_time}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            start_time: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="datetime-local"
                        value={crewHoursForm.end_time}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            end_time: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Hourly Rate *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={crewHoursForm.hourly_rate}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            hourly_rate: e.target.value,
                          })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>Crew Size</Label>
                      <Input
                        type="number"
                        value={crewHoursForm.crew_size}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            crew_size: e.target.value,
                          })
                        }
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Label>Work Type</Label>
                      <Select
                        value={crewHoursForm.work_type}
                        onValueChange={(value) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            work_type: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tear_off">Tear-Off</SelectItem>
                          <SelectItem value="install">Install</SelectItem>
                          <SelectItem value="repair">Repair</SelectItem>
                          <SelectItem value="decking">Decking</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Issues</Label>
                      <Textarea
                        value={crewHoursForm.issues}
                        onChange={(e) =>
                          setCrewHoursForm({
                            ...crewHoursForm,
                            issues: e.target.value,
                          })
                        }
                        placeholder="Any issues encountered..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddCrewHoursOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddCrewHours}>Log Hours</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {crewHours.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No crew hours logged yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {crewHours.map((hour) => (
                    <div
                      key={hour.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{hour.work_type}</Badge>
                          <span className="font-medium text-zinc-50">
                            {hour.crew_name || "Unnamed Crew"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-zinc-400">
                          <span>
                            {format(
                              new Date(hour.start_time),
                              "MMM d, yyyy h:mm a"
                            )}
                          </span>
                          {hour.end_time && (
                            <>
                              <span>→</span>
                              <span>
                                {format(
                                  new Date(hour.end_time),
                                  "MMM d, yyyy h:mm a"
                                )}
                              </span>
                              <span>
                                ({hour.total_hours?.toFixed(1)} hrs)
                              </span>
                            </>
                          )}
                          {hour.crew_size > 1 && (
                            <span>{hour.crew_size} crew members</span>
                          )}
                        </div>
                        {hour.issues && (
                          <p className="mt-1 text-sm text-orange-400">
                            Issues: {hour.issues}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-zinc-50">
                          {formatCurrency(hour.total_cost)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCrewHours(hour.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
































