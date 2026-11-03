"use client";

import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/incidents";
import { IncidentCreateFields } from "./incident-form";
import { Modal } from "./modal";

export function IncidentCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (incident: Incident) => void;
}) {
  const router = useRouter();

  return (
    <Modal
      open={open}
      title="New incident"
      description="New Makati Central Fire Station stays pinned. The incident pin follows the address you type. Leave coordinates empty and the board looks up the point when you save."
      onClose={onClose}
      wide
    >
      <IncidentCreateFields
        autofocus={open}
        onCancel={onClose}
        onCreated={(incident) => {
          onCreated?.(incident);
          onClose();
          router.push(`/incidents/${incident.id}`);
        }}
      />
    </Modal>
  );
}
