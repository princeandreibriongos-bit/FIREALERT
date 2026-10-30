"use client";

import { useEffect, useId, type ReactNode } from "react";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-scrim" aria-label="Close dialog" onClick={onClose} />
      <div
        className={`modal-panel card${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Dispatch</p>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="fine">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm modal-x" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
