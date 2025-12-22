"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Plus, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  phone?: string;
}

interface Step3AddContactsProps {
  onNext: (data: { contacts: Contact[] }) => void;
  onBack: () => void;
  contacts?: Contact[];
}

export function Step3AddContacts({ onNext, onBack, contacts: initialContacts }: Step3AddContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts || []);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("csv");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual entry form
  const [manualContact, setManualContact] = useState<Contact>({
    email: "",
    first_name: "",
    last_name: "",
    address: "",
    city: "",
    phone: "",
  });

  // Paste emails
  const [pastedEmails, setPastedEmails] = useState("");

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to upload contacts");
      }

      const data = await res.json();
      
      // Parse imported contacts
      const importedContacts: Contact[] = (data.contacts || []).map((c: any) => ({
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        address: c.address,
        city: c.city,
        phone: c.phone,
      }));

      setContacts([...contacts, ...importedContacts]);
      toast.success(`Imported ${importedContacts.length} contacts`);
    } catch (error: any) {
      toast.error(error.message || "Failed to upload contacts");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAddManual = () => {
    if (!manualContact.email || !manualContact.email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setContacts([...contacts, { ...manualContact }]);
    setManualContact({
      email: "",
      first_name: "",
      last_name: "",
      address: "",
      city: "",
      phone: "",
    });
    toast.success("Contact added");
  };

  const handlePasteEmails = () => {
    const emails = pastedEmails
      .split(/[\n,;]/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@") && e.length > 0);

    if (emails.length === 0) {
      toast.error("No valid emails found");
      return;
    }

    const newContacts: Contact[] = emails.map((email) => ({
      email: email.toLowerCase(),
    }));

    setContacts([...contacts, ...newContacts]);
    setPastedEmails("");
    toast.success(`Added ${newContacts.length} contacts`);
  };

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (contacts.length === 0) {
      toast.error("Please add at least one contact");
      return;
    }

    // Validate emails
    const invalidEmails = contacts.filter(
      (c) => !c.email || !c.email.includes("@")
    );
    if (invalidEmails.length > 0) {
      toast.error("Please remove invalid email addresses");
      return;
    }

    onNext({ contacts });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Add Contacts</h2>
        <p className="text-gray-600 mt-2">
          Import homeowners you want to reach out to
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="csv">Upload CSV</TabsTrigger>
          <TabsTrigger value="manual">Add Manually</TabsTrigger>
          <TabsTrigger value="paste">Paste Emails</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
              <CardDescription>
                Upload a CSV file with columns: email, first_name, last_name, address, city, phone
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  variant="outline"
                >
                  {uploading ? "Uploading..." : "Choose CSV File"}
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  CSV should include: email, first_name, last_name, address, city, phone
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Contact Manually</CardTitle>
              <CardDescription>Add contacts one at a time (up to 10)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={manualContact.email}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, email: e.target.value })
                    }
                    placeholder="homeowner@example.com"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={manualContact.phone}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={manualContact.first_name}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, first_name: e.target.value })
                    }
                    placeholder="John"
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={manualContact.last_name}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, last_name: e.target.value })
                    }
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={manualContact.address}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, address: e.target.value })
                    }
                    placeholder="123 Main St"
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input
                    value={manualContact.city}
                    onChange={(e) =>
                      setManualContact({ ...manualContact, city: e.target.value })
                    }
                    placeholder="Denver"
                  />
                </div>
              </div>
              <Button onClick={handleAddManual} disabled={contacts.length >= 10}>
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paste" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paste Email Addresses</CardTitle>
              <CardDescription>
                Paste email addresses separated by commas, semicolons, or new lines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={pastedEmails}
                onChange={(e) => setPastedEmails(e.target.value)}
                placeholder="homeowner1@example.com, homeowner2@example.com&#10;homeowner3@example.com"
                rows={8}
              />
              <Button onClick={handlePasteEmails}>
                Add Contacts
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {contacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Added Contacts ({contacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex-1">
                    <p className="font-medium">{contact.email}</p>
                    {(contact.first_name || contact.last_name) && (
                      <p className="text-sm text-muted-foreground">
                        {contact.first_name} {contact.last_name}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveContact(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleNext} disabled={contacts.length === 0}>
          Next Step ({contacts.length} contacts)
        </Button>
      </div>
    </div>
  );
}




























































