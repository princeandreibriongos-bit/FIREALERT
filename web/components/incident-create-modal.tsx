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
      description="Leave coordinates empty and the board will geocode the address. A failed lookup asks you to enter a map point."
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
