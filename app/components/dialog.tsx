"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function Dialog({ children, labelId, descriptionId, className = "", onClose }: { children: ReactNode; labelId: string; descriptionId?: string; className?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={ref} className={className} aria-labelledby={labelId} aria-describedby={descriptionId} onClose={() => closeRef.current()} onCancel={(event) => { event.preventDefault(); closeRef.current(); }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
  }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeRef.current();
  }}>{children}</dialog>;
}
