"use client";

import { useState, useEffect } from "react";
import { FileText, Plus, Save, Edit, Trash2 } from "lucide-react";

interface TemplatesTabProps {
  roofingCompanyId: string;
  canEdit: boolean;
}

const templateTypes = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'contract', label: 'Contract' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'change_order', label: 'Change Order' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'warranty', label: 'Warranty' },
];

export default function TemplatesTab({ roofingCompanyId, canEdit }: TemplatesTabProps) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>("estimate");
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    variables: [] as string[],
    is_default: false,
  });

  useEffect(() => {
    loadTemplates();
  }, [roofingCompanyId, selectedType]);

  const loadTemplates = async () => {
    try {
      const response = await fetch(
        `/api/company/templates/list?roofing_company_id=${roofingCompanyId}&template_type=${selectedType}`
      );
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    try {
      const response = await fetch("/api/company/templates/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roofing_company_id: roofingCompanyId,
          template_type: selectedType,
          template_id: editingTemplate?.id,
          ...formData,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Template saved successfully!");
        setShowEditor(false);
        setEditingTemplate(null);
        setFormData({ name: "", content: "", variables: [], is_default: false });
        loadTemplates();
      } else {
        alert(data.error || "Failed to save template");
      }
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to save template");
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      content: template.content,
      variables: template.variables || [],
      is_default: template.is_default || false,
    });
    setShowEditor(true);
  };

  const handleNew = () => {
    setEditingTemplate(null);
    setFormData({ name: "", content: "", variables: [], is_default: false });
    setShowEditor(true);
  };

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <FileText className="w-6 h-6 text-gray-600 mr-3" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Templates</h2>
              <p className="text-sm text-gray-500 mt-1">Manage document and message templates</p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={handleNew}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {templateTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  {template.is_default && (
                    <span className="text-xs text-blue-600 font-medium">Default</span>
                  )}
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {template.content.substring(0, 100)}...
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No templates found. Create your first template to get started.
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingTemplate ? "Edit Template" : "New Template"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Default Estimate"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Estimate for {{homeowner_name}}&#10;Job Address: {{job_address}}..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {"{"}{"{"}homeowner_name{"}"}{"}"}, {"{"}{"{"}job_address{"}"}{"}"}, {"{"}{"{"}company_name{"}"}{"}"}, {"{"}{"{"}proposal_total{"}"}{"}"}
                </p>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">
                  Set as default template
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditor(false);
                  setEditingTemplate(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

























