"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { WearerDetail } from "@/components/wearer-detail";

function WearerPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  return <WearerDetail wearerId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="fine">Loading wearer…</p>}>
      <WearerPage />
    </Suspense>
  );
}
