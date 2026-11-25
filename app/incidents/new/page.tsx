import { redirect } from "next/navigation";

/** Legacy flat form URL — open the incidents board with the create popup. */
export default function NewIncidentPage() {
  redirect("/incidents?new=1");
}
