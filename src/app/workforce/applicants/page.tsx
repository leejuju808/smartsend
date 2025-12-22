"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, FileText, Mail, Phone } from "lucide-react";
import { WorkforceApplicant } from "@/types/database";
import { ApplicantCard } from "./ApplicantCard";
import { ApplicantDrawer } from "./ApplicantDrawer";
import { AddApplicantModal } from "./AddApplicantModal";

const columns = [
  { id: "new", label: "New", color: "bg-blue-50 border-blue-200" },
  { id: "review", label: "Review", color: "bg-yellow-50 border-yellow-200" },
  { id: "interview", label: "Interview", color: "bg-orange-50 border-orange-200" },
  { id: "hired", label: "Hired", color: "bg-green-50 border-green-200" },
  { id: "rejected", label: "Rejected", color: "bg-red-50 border-red-200" },
];

type GroupedApplicants = {
  new: WorkforceApplicant[];
  review: WorkforceApplicant[];
  interview: WorkforceApplicant[];
  hired: WorkforceApplicant[];
  rejected: WorkforceApplicant[];
};

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState<GroupedApplicants>({
    new: [],
    review: [],
    interview: [],
    hired: [],
    rejected: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<WorkforceApplicant | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadApplicants();
  }, []);

  async function loadApplicants() {
    try {
      setLoading(true);
      const res = await fetch("/api/workforce/applicants/get");
      const data = await res.json();
      setApplicants(data);
    } catch (error) {
      console.error("Error loading applicants:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleMove(id: string, toStatus: string) {
    try {
      await fetch("/api/workforce/applicants/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: toStatus }),
      });
      loadApplicants(); // refresh
    } catch (error) {
      console.error("Error moving applicant:", error);
    }
  }

  function onDragEnd(result: DropResult) {
    const { destination, draggableId } = result;

    if (!destination) return;

    const sourceStatus = result.source.droppableId;
    const destStatus = destination.droppableId;

    if (sourceStatus === destStatus) return;

    handleMove(draggableId, destStatus);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">Loading applicants...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Hiring Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Drag and drop applicants between stages. Click a card to view details.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Applicant
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-4">
          {columns.map((column) => (
            <Droppable key={column.id} droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-xl border-2 p-4 min-h-[500px] transition-colors ${
                    column.color
                  } ${snapshot.isDraggingOver ? "ring-2 ring-blue-400" : ""}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold capitalize text-gray-700">
                      {column.label}
                    </h2>
                    <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded-full">
                      {applicants[column.id as keyof GroupedApplicants]?.length || 0}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {applicants[column.id as keyof GroupedApplicants]?.map(
                      (applicant, index) => (
                        <Draggable
                          key={applicant.id}
                          draggableId={applicant.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setSelectedApplicant(applicant)}
                              className={`cursor-pointer ${
                                snapshot.isDragging ? "opacity-50" : ""
                              }`}
                            >
                              <ApplicantCard applicant={applicant} />
                            </div>
                          )}
                        </Draggable>
                      )
                    )}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {selectedApplicant && (
        <ApplicantDrawer
          applicant={selectedApplicant}
          onClose={() => setSelectedApplicant(null)}
          onUpdate={loadApplicants}
        />
      )}

      {showAddModal && (
        <AddApplicantModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadApplicants();
          }}
        />
      )}
    </div>
  );
}
























