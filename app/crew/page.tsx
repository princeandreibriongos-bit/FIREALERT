import { Suspense } from "react";
import { CrewBoard } from "@/components/crew-board";

export default function CrewPage() {
  return (
    <Suspense fallback={<p className="fine">Loading crew…</p>}>
      <CrewBoard />
    </Suspense>
  );
}
