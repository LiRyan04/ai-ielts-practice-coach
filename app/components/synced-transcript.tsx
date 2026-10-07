"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptCue } from "../../lib/listening/transcript";

export function SyncedTranscript({
  activeIndex,
  cues,
  onQuestionNavigate,
  progress,
}: {
  activeIndex: number;
  cues: TranscriptCue[];
  onQuestionNavigate: (number: number) => void;
  progress: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const speakerColors = useMemo(() => {
    const speakers = Array.from(new Set(cues.map((cue) => cue.speaker)));
    return new Map(speakers.map((speaker, index) => [speaker, index % 5]));
  }, [cues]);

  useEffect(() => {
    const container = scrollRef.current;
    const active = activeRef.current;
    if (!open || !container || !active || activeIndex < 0) return;
    const target = active.offsetTop - container.clientHeight * 0.42;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIndex, open]);

  return (
    <aside className="card transcript-card">
      <details onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
        <summary>
          <span>Audio transcript</span>
          <small className={progress == null ? "" : "following"}>
            <i aria-hidden="true" />
            {progress == null ? "Waiting for audio" : "Following audio"}
          </small>
        </summary>
        <div className="transcript-progress" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, progress || 0)) * 100}%` }} /></div>
        <div className="transcript-scroll" ref={scrollRef}>
          {cues.map((cue, index) => {
            const showSpeaker = index === 0 || cues[index - 1]?.speaker !== cue.speaker;
            return (
              <div
                aria-current={index === activeIndex ? "true" : undefined}
                className={index === activeIndex ? "transcript-line active" : "transcript-line"}
                key={`${cue.speaker}-${index}`}
                ref={index === activeIndex ? activeRef : undefined}
              >
                <span className={`transcript-speaker tone-${speakerColors.get(cue.speaker) || 0}`}>
                  {showSpeaker ? (cue.speaker === "NARRATOR" ? "ANNOUNCER" : cue.speaker) : ""}
                </span>
                <p>{cue.text}</p>
                {cue.questionNumbers.length > 0 ? (
                  <span className="transcript-question-cues">
                    {cue.questionNumbers.map((number) => (
                      <button key={number} onClick={() => onQuestionNavigate(number)} type="button">Q{number}</button>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </details>
    </aside>
  );
}
