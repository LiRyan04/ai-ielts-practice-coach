"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { localDateString } from "../../lib/learning/date";

const HEARTBEAT_SECONDS = 30;
const IDLE_AFTER_MS = 2 * 60 * 1000;

function isStudyPath(pathname: string): boolean {
  return ["/practice/listening/", "/practice/reading/", "/practice/writing/", "/grammar", "/vocabulary", "/review", "/writing-resources"]
    .some((prefix) => pathname.startsWith(prefix));
}

export function LearningTimeTracker() {
  const pathname = usePathname();
  const lastActivity = useRef(0);
  const unreportedSeconds = useRef(0);

  useEffect(() => {
    if (!isStudyPath(pathname)) return;
    lastActivity.current = Date.now();
    let lastTick = Date.now();
    let sending = false;
    const noteActivity = () => { lastActivity.current = Date.now(); };
    const send = async () => {
      if (sending || unreportedSeconds.current < 1) return;
      const seconds = Math.min(HEARTBEAT_SECONDS, Math.floor(unreportedSeconds.current));
      unreportedSeconds.current -= seconds;
      sending = true;
      try {
        const response = await fetch("/api/learning/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seconds, localDate: localDateString() }),
          keepalive: true,
        });
        if (!response.ok) unreportedSeconds.current += seconds;
      } catch {
        unreportedSeconds.current += seconds;
      } finally {
        sending = false;
      }
    };
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.min(HEARTBEAT_SECONDS, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      if (document.visibilityState === "visible" && now - lastActivity.current <= IDLE_AFTER_MS) unreportedSeconds.current += elapsed;
      if (unreportedSeconds.current >= HEARTBEAT_SECONDS) void send();
    };
    const flush = () => {
      tick();
      if (document.visibilityState === "hidden") void send();
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, noteActivity, { passive: true }));
    document.addEventListener("visibilitychange", flush);
    const interval = window.setInterval(tick, HEARTBEAT_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", flush);
      events.forEach((event) => window.removeEventListener(event, noteActivity));
      tick();
      void send();
    };
  }, [pathname]);

  return null;
}
