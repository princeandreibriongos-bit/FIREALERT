import { Suspense } from "react";
import { SensorsPage } from "@/components/sensors-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="fine">Loading sensors…</p>}>
      <SensorsPage />
    </Suspense>
  );
}
