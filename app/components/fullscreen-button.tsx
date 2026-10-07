"use client";

import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch {
      // Browsers can reject fullscreen requests outside a trusted user gesture.
    }
  }

  const label = isFullscreen ? "退出全屏" : "进入全屏";

  return (
    <button className="fullscreen-button" type="button" onClick={() => void toggleFullscreen()} aria-label={label} title={label}>
      {isFullscreen ? (
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M4 15v5h5M20 15v5h-5" /></svg>
      )}
      <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
    </button>
  );
}
