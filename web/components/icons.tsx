import type { ReactNode, SVGProps } from "react";

type IconName = "overview" | "sensors" | "crew" | "incidents" | "log" | "gateway" | "system" | "search" | "menu";

const PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  sensors: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      <path d="m6.2 6.2 2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1" />
    </>
  ),
  crew: (
    <>
      <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.2A3.8 3.8 0 0 0 17.2 15" />
      <path d="M16 5.1a3 3 0 0 1 0 5.8" />
    </>
  ),
  incidents: (
    <>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  log: (
    <>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  gateway: (
    <>
      <path d="M5 12.5a7 7 0 0 1 14 0" />
      <path d="M8 15.2a3.5 3.5 0 0 1 8 0" />
      <path d="M12 18.5h.01" />
    </>
  ),
  system: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}

export { StationLogo as BrandMark } from "./station-logo";
