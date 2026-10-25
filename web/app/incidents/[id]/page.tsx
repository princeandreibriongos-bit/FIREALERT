"use client";

import { useParams } from "next/navigation";
import { IncidentDetail } from "@/components/incident-detail";

export default function IncidentPage() {
  const params = useParams<{ id: string }>();
  return <IncidentDetail incidentId={decodeURIComponent(params.id)} />;
}
