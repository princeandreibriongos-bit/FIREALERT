"use client";

import { useEffect, useState } from "react";
import { STATION } from "@/lib/station";

function mapSrc(address: string): string {
  const origin = `${STATION.latitude},${STATION.longitude}`;
  const label = encodeURIComponent(STATION.name);
  const trimmed = address.trim();
  if (trimmed.length < 4) {
    return `https://maps.google.com/maps?q=${origin}+(${label})&z=16&hl=en&output=embed`;
  }
  return `https://maps.google.com/maps?saddr=${origin}+(${label})&daddr=${encodeURIComponent(trimmed)}&hl=en&output=embed`;
}

export function IncidentMap({ address }: { address: string }) {
  const [query, setQuery] = useState(address);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(address), 650);
    return () => window.clearTimeout(timer);
  }, [address]);

  const pinned = query.trim().length >= 4;

  return (
    <figure className="incident-map">
      <iframe
        title={pinned ? `Google map from ${STATION.name} to the typed address` : `Google map of ${STATION.name}`}
        src={mapSrc(query)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <figcaption>
        {pinned
          ? `${STATION.name} stays pinned. The other pin follows the address.`
          : `${STATION.name} is pinned. Type an address to drop the incident pin.`}
      </figcaption>
    </figure>
  );
}
