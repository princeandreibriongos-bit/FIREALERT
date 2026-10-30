import { redirect } from "next/navigation";

/** Legacy /login URL opens the landing page with the sign-in popup. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next;
  const url = new URL("http://local/?signin=1");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") && next !== "/") {
    url.searchParams.set("next", next);
  } else {
    url.searchParams.set("next", "/overview");
  }
  redirect(`/${url.search}`);
}
