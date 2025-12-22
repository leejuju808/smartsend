"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  User, 
  Building2, 
  Calendar, 
  Package, 
  Users, 
  DollarSign,
  Phone,
  Mail,
  MapPin,
  X,
  Plus,
  Save,
  Clock
} from "lucide-react";

interface Job {
  id: string;
  lead_id: string | null;
  stage_id: string;
  stage_name: string | null;
  progress: number;
  contract_value: number | null;
  insurance: boolean;
  notes: string | null;
  created_at: string;
  homeowner_name: string | null;
  homeowner_phone: string | null;
  homeowner_email: string | null;
  address: string | null;
  crew_name: string | null;
  production_date: string | null;
  estimated_value: number | null;
  final_value: number | null;
  job_type: string | null;
  roof_type: string | null;
  insurance_claim: boolean;
  materials: any;
}

interface JobDetailsDrawerProps {
  job: Job;
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface Crew {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
  order_index: number;
}

interface Material {
  id?: string;
  name: string;
  quantity: string;
  unit?: string;
}

const PRODUCTION_CHECKLIST = [
  { id: 'tear_off', label: 'Tear-off done', progress: 20 },
  { id: 'dry_in', label: 'Dry-in complete', progress: 40 },
  { id: 'shingles', label: 'Shingles installed', progress: 70 },
  { id: 'cleanup', label: 'Cleanup finished', progress: 90 },
  { id: 'inspection', label: 'Final inspection', progress: 100 },
];

export function JobDetailsDrawer({ 
  job: initialJob, 
  companyId,
  onClose, 
  onUpdate 
}: JobDetailsDrawerProps) {
  const supabase = createClientComponentClient();
  const [job, setJob] = useState<Job>(initialJob);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [materials, setMaterials] = useState<Material[]>(
    Array.isArray(initialJob.materials) ? initialJob.materials : []
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [job.id, companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load crews
      const { data: crewsData } = await supabase
        .from('crews')
        .select('id, name')
        .eq('roofing_company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (crewsData) setCrews(crewsData);

      // Load stages
      const { data: stagesData } = await supabase
        .from('job_stages')
        .select('id, name, order_index')
        .eq('company_id', companyId)
        .order('order_index');
      if (stagesData) setStages(stagesData);

      // Load full job details with activity
      const response = await fetch(`/api/pipeline/jobs/${job.id}`);
      if (response.ok) {
        const { job: fullJob } = await response.json();
        setJob(fullJob);
        setActivity(fullJob.activity || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/pipeline/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...job,
          materials: materials,
        }),
      });

      if (response.ok) {
        const { job: updatedJob } = await response.json();
        setJob(updatedJob);
        onUpdate();
      }
    } catch (error) {
      console.error('Error saving job:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (newStageId: string) => {
    try {
      const response = await fetch(`/api/pipeline/jobs/${job.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId }),
      });

      if (response.ok) {
        await loadData();
        onUpdate();
      }
    } catch (error) {
      console.error('Error changing stage:', error);
    }
  };

  const handleProgressCheck = async (checklistItem: typeof PRODUCTION_CHECKLIST[0], checked: boolean) => {
    const newProgress = checked ? checklistItem.progress : Math.max(0, job.progress - (checklistItem.progress - (checklistItem.progress - 20)));
    setJob({ ...job, progress: newProgress });
    
    await fetch(`/api/pipeline/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: newProgress }),
    });
    
    onUpdate();
  };

  const addMaterial = () => {
    setMaterials([...materials, { name: '', quantity: '', unit: 'pieces' }]);
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const updateMaterial = (index: number, field: keyof Material, value: string) => {
    const updated = [...materials];
    updated[index] = { ...updated[index], [field]: value };
    setMaterials(updated);
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Job Details</SheetTitle>
          <SheetDescription>
            Manage job information, production tracking, and materials
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Homeowner Info */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <User className="h-5 w-5" />
              Homeowner Information
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="homeowner_name">Name</Label>
                <Input
                  id="homeowner_name"
                  value={job.homeowner_name || ''}
                  onChange={(e) => setJob({ ...job, homeowner_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="homeowner_phone">Phone</Label>
                  <Input
                    id="homeowner_phone"
                    value={job.homeowner_phone || ''}
                    onChange={(e) => setJob({ ...job, homeowner_phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="homeowner_email">Email</Label>
                  <Input
                    id="homeowner_email"
                    type="email"
                    value={job.homeowner_email || ''}
                    onChange={(e) => setJob({ ...job, homeowner_email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={job.address || ''}
                  onChange={(e) => setJob({ ...job, address: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* Job Info */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Job Information
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="estimated_value">Estimated Value</Label>
                  <Input
                    id="estimated_value"
                    type="number"
                    value={job.estimated_value || ''}
                    onChange={(e) => setJob({ ...job, estimated_value: parseFloat(e.target.value) || null })}
                  />
                </div>
                <div>
                  <Label htmlFor="final_value">Final Value</Label>
                  <Input
                    id="final_value"
                    type="number"
                    value={job.final_value || ''}
                    onChange={(e) => setJob({ ...job, final_value: parseFloat(e.target.value) || null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="job_type">Job Type</Label>
                  <Input
                    id="job_type"
                    value={job.job_type || ''}
                    onChange={(e) => setJob({ ...job, job_type: e.target.value })}
                    placeholder="e.g., roof_replacement, repair"
                  />
                </div>
                <div>
                  <Label htmlFor="roof_type">Roof Type</Label>
                  <Input
                    id="roof_type"
                    value={job.roof_type || ''}
                    onChange={(e) => setJob({ ...job, roof_type: e.target.value })}
                    placeholder="e.g., shingles, tile, metal"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="insurance_claim"
                  checked={job.insurance_claim}
                  onCheckedChange={(checked) => setJob({ ...job, insurance_claim: !!checked })}
                />
                <Label htmlFor="insurance_claim">Insurance Claim</Label>
              </div>
            </div>
          </section>

          {/* Stage Progress */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Stage & Progress
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="stage">Current Stage</Label>
                <Select
                  value={job.stage_id}
                  onValueChange={handleStageChange}
                >
                  <SelectTrigger id="stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label>Progress</Label>
                  <span className="font-medium">{job.progress}%</span>
                </div>
                <Progress value={job.progress} />
              </div>
            </div>
          </section>

          {/* Production */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Production
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="crew">Assign Crew</Label>
                <Select
                  value={job.crew_id || ''}
                  onValueChange={(crewId) => {
                    setJob({ ...job, crew_id: crewId });
                    fetch(`/api/pipeline/jobs/${job.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ crew_id: crewId }),
                    }).then(() => onUpdate());
                  }}
                >
                  <SelectTrigger id="crew">
                    <SelectValue placeholder="Select crew" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No crew assigned</SelectItem>
                    {crews.map((crew) => (
                      <SelectItem key={crew.id} value={crew.id}>
                        {crew.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="production_date">Production Date</Label>
                <Input
                  id="production_date"
                  type="date"
                  value={job.production_date ? new Date(job.production_date).toISOString().split('T')[0] : ''}
                  onChange={(e) => setJob({ ...job, production_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Production Checklist</Label>
                {PRODUCTION_CHECKLIST.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={job.progress >= item.progress}
                      onCheckedChange={(checked) => handleProgressCheck(item, !!checked)}
                    />
                    <Label className="font-normal">{item.label} ({item.progress}%)</Label>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Materials */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Materials Needed
            </h3>
            <div className="space-y-2">
              {materials.map((material, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Material Name</Label>
                    <Input
                      value={material.name}
                      onChange={(e) => updateMaterial(index, 'name', e.target.value)}
                      placeholder="e.g., Shingles"
                    />
                  </div>
                  <div className="w-24">
                    <Label>Quantity</Label>
                    <Input
                      value={material.quantity}
                      onChange={(e) => updateMaterial(index, 'quantity', e.target.value)}
                      placeholder="30"
                    />
                  </div>
                  <div className="w-24">
                    <Label>Unit</Label>
                    <Input
                      value={material.unit || 'pieces'}
                      onChange={(e) => updateMaterial(index, 'unit', e.target.value)}
                      placeholder="bundles"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMaterial(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={addMaterial}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Notes</h3>
            <Textarea
              value={job.notes || ''}
              onChange={(e) => setJob({ ...job, notes: e.target.value })}
              rows={4}
              placeholder="Add internal notes about this job..."
            />
          </section>

          {/* Timeline */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timeline
            </h3>
            <div className="space-y-2">
              {activity.map((item) => (
                <div key={item.id} className="border-l-2 border-muted pl-4 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{item.message || item.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {activity.length === 0 && (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              )}
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


























