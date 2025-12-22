"use client";

// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Payment Plan Manager Client Component

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  DollarSign,
  CreditCard,
  Edit,
  Save,
  X,
  Plus,
  Trash2,
} from "lucide-react";

interface PaymentPlanManagerClientProps {
  plan: any;
  autopayRules: any[];
}

export function PaymentPlanManagerClient({
  plan,
  autopayRules,
}: PaymentPlanManagerClientProps) {
  const [editing, setEditing] = useState(false);
  const [schedule, setSchedule] = useState(plan.schedule || []);
  const [autoPay, setAutoPay] = useState(plan.auto_pay || false);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/payment-plan/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule,
          auto_pay: autoPay,
        }),
      });

      if (response.ok) {
        setEditing(false);
        alert("Payment plan updated successfully!");
        window.location.reload();
      } else {
        alert("Failed to update payment plan");
      }
    } catch (error) {
      console.error("Error updating payment plan:", error);
      alert("Error updating payment plan");
    } finally {
      setLoading(false);
    }
  };

  const updateScheduleItem = (index: number, field: string, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], [field]: value };
    setSchedule(newSchedule);
  };

  const addInstallment = () => {
    const lastItem = schedule[schedule.length - 1];
    const newDate = new Date(lastItem?.date || new Date());
    newDate.setDate(newDate.getDate() + 30);

    setSchedule([
      ...schedule,
      {
        date: newDate.toISOString().split("T")[0],
        amount: 0,
        status: "pending",
        installment_number: schedule.length + 1,
      },
    ]);
  };

  const removeInstallment = (index: number) => {
    if (schedule.length > 1) {
      setSchedule(schedule.filter((_, i) => i !== index));
    }
  };

  const totalAmount = schedule.reduce((sum, item) => sum + Number(item.amount), 0);
  const paidCount = schedule.filter((item) => item.status === "paid").length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Plan Manager</h1>
          <p className="text-gray-600 mt-1">
            {plan.homeowners?.name || "Homeowner"} • {formatCurrency(plan.total_amount)}
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Plan
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Plan Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Total Amount</p>
                  <p className="text-xl font-bold">{formatCurrency(plan.total_amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Number of Payments</p>
                  <p className="text-xl font-bold">{plan.num_payments}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Progress</p>
                  <p className="text-xl font-bold">
                    {paidCount} / {plan.num_payments}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Payment Schedule</CardTitle>
                {editing && (
                  <Button variant="outline" size="sm" onClick={addInstallment}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Installment
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedule.map((item: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    {editing ? (
                      <>
                        <div>
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={item.date}
                            onChange={(e) =>
                              updateScheduleItem(index, "date", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label>Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) =>
                              updateScheduleItem(index, "amount", parseFloat(e.target.value))
                            }
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm text-gray-500">Payment {item.installment_number}</p>
                          <p className="font-medium">{formatCurrency(item.amount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Due Date</p>
                          <p className="font-medium">
                            {new Date(item.date).toLocaleDateString()}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "paid" ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Paid
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                    {editing && schedule.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInstallment(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Auto-Pay Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Pay Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Auto-Pay</p>
                  <p className="text-sm text-gray-500">
                    Automatically charge saved payment method
                  </p>
                </div>
                <Switch
                  checked={autoPay}
                  onCheckedChange={setAutoPay}
                  disabled={!editing}
                />
              </div>
              {autopayRules.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Active Payment Method</p>
                  {autopayRules[0]?.payment_methods && (
                    <p className="text-xs text-gray-600">
                      {autopayRules[0].payment_methods.type === "card"
                        ? `${autopayRules[0].payment_methods.brand?.toUpperCase()} •••• ${autopayRules[0].payment_methods.last4}`
                        : `ACH •••• ${autopayRules[0].payment_methods.last4}`}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan Status */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                variant={
                  plan.status === "completed"
                    ? "default"
                    : plan.status === "overdue"
                    ? "destructive"
                    : "secondary"
                }
              >
                {plan.status}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

























