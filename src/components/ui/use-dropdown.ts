"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open/close state for a small menu under a button: closes on Escape (focus returns to
 * the button), on a click outside, and when focus leaves it. The panel opens toward
 * whichever side of the screen has room, so it never ends up off-screen on a phone.
 */
export function useDropdown<P extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("right");
  const wrapper = useRef<P>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !wrapper.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const r = button.current?.getBoundingClientRect();
    // A button on the left half of the screen opens its menu to the right, and vice versa.
    if (r) setAlign(r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right");
    setOpen((o) => !o);
  }

  function close({ refocus = false } = {}) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  return {
    open,
    toggle,
    close,
    wrapper,
    button,
    panelPosition: align === "left" ? "left-0" : "right-0",
    onBlur: (e: React.FocusEvent<P>) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false),
  };
}
