"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Award, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Certification {
  id: string;
  user_id: string;
  type: string;
  issued_date: string;
  expiration_date: string;
  file_url?: string;
  days_until_expiration: number;
  is_expired: boolean;
  is_expiring_soon: boolean;
}

export function CertificationsList() {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    user_id: "",
    type: "",
    issued_date: "",
    expiration_date: "",
    file_url: "",
  });

  useEffect(() => {
    fetchCertifications();
  }, []);

  const fetchCertifications = async () => {
    try {
      const res = await fetch("/api/safety/certification?expiring_soon=30");
      const data = await res.json();
      if (data.ok) {
        setCertifications(data.data);
      }
    } catch (error) {
      console.error("Error fetching certifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCertification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/safety/certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setFormData({
          user_id: "",
          type: "",
          issued_date: "",
          expiration_date: "",
          file_url: "",
        });
        fetchCertifications();
      } else {
        alert(data.error || "Failed to add certification");
      }
    } catch (error) {
      console.error("Error adding certification:", error);
      alert("Failed to add certification");
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading certifications...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Track crew member certifications and get alerts before they expire
        </p>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          Add Certification
        </Button>
      </div>

      {certifications.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No certifications found. Add one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {certifications.map((cert) => (
            <div
              key={cert.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {cert.is_expired ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : cert.is_expiring_soon ? (
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                <div>
                  <p className="text-sm font-medium">{cert.type}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires: {new Date(cert.expiration_date).toLocaleDateString()}
                    {cert.days_until_expiration >= 0 && (
                      <span className="ml-2">
                        ({cert.days_until_expiration} days)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  cert.is_expired
                    ? "bg-red-100 text-red-700"
                    : cert.is_expiring_soon
                    ? "bg-orange-100 text-orange-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {cert.is_expired
                  ? "Expired"
                  : cert.is_expiring_soon
                  ? "Expiring Soon"
                  : "Valid"}
              </span>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Certification</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCertification} className="space-y-4">
              <div>
                <Label htmlFor="user_id">User ID</Label>
                <Input
                  id="user_id"
                  value={formData.user_id}
                  onChange={(e) =>
                    setFormData({ ...formData, user_id: e.target.value })
                  }
                  placeholder="Enter user ID"
                  required
                />
              </div>

              <div>
                <Label htmlFor="type">Certification Type</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  placeholder="e.g., Fall Protection, First Aid"
                  required
                />
              </div>

              <div>
                <Label htmlFor="issued_date">Issued Date</Label>
                <Input
                  id="issued_date"
                  type="date"
                  value={formData.issued_date}
                  onChange={(e) =>
                    setFormData({ ...formData, issued_date: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="expiration_date">Expiration Date</Label>
                <Input
                  id="expiration_date"
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) =>
                    setFormData({ ...formData, expiration_date: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="file_url">File URL (Optional)</Label>
                <Input
                  id="file_url"
                  value={formData.file_url}
                  onChange={(e) =>
                    setFormData({ ...formData, file_url: e.target.value })
                  }
                  placeholder="URL to certification document"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Add Certification</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}



























