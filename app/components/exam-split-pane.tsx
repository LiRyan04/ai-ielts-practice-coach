"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export function ExamSplitPane({ className, left, right }: { className: string; left: ReactNode; right: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);

  function resizeFromClientX(clientX: number) {
    if (!rootRef.current) return;
    const bounds = rootRef.current.getBoundingClientRect();
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(68, Math.max(32, next)));
  }

  useEffect(() => {
    if (!dragging) return;
    const resize = (event: globalThis.PointerEvent) => resizeFromClientX(event.clientX);
    const stop = () => {
      setDragging(false);
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplit((value) => Math.max(32, value - 2));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplit((value) => Math.min(68, value + 2));
    } else if (event.key === "Home") {
      event.preventDefault();
      setSplit(50);
    }
  }

  return (
    <div className={`exam-split-pane ${className}`} ref={rootRef} style={{ "--exam-split": `${split}%` } as CSSProperties}>
      {left}
      <button
        aria-label="Resize question and answer panels"
        aria-orientation="vertical"
        aria-valuemax={68}
        aria-valuemin={32}
        aria-valuenow={Math.round(split)}
        className={dragging ? "exam-split-handle dragging" : "exam-split-handle"}
        onDoubleClick={() => setSplit(50)}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          setDragging(false);
        }}
        onPointerCancel={() => {
          setDragging(false);
        }}
        role="separator"
        type="button"
      ><span aria-hidden="true">↔</span></button>
      {right}
    </div>
  );
}
