const FALLBACK_HOSTED_BOARD_URL = "https://firealert-three.vercel.app";

function hostedBoardUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_HOSTED_BOARD_URL || process.env.HOSTED_BOARD_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/^https?:\/\//, "");
  if (production) return `https://${production.replace(/\/$/, "")}`;
  return FALLBACK_HOSTED_BOARD_URL;
}

export const HOSTED_BOARD_URL = hostedBoardUrl();
