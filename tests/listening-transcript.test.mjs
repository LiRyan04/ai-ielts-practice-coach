import assert from "node:assert/strict";
import test from "node:test";
import { transcriptCues, transcriptForTts } from "../lib/listening/transcript.ts";

test("turns source answer annotations into synchronized transcript cues", () => {
  const transcript = [
    "ANNOUNCER:Part one. You have some time to look at the questions.",
    "WOMAN:The group usually has eight people.1",
    "MAN:Great.",
    "WOMAN:The course covers weather.2 And tides.",
  ].join("\n");
  const cues = transcriptCues(transcript);

  assert.equal(cues.find((cue) => cue.questionNumbers.includes(1))?.text, "The group usually has eight people.");
  assert.equal(cues.find((cue) => cue.questionNumbers.includes(2))?.text, "The course covers weather.");
  assert.ok(cues.every((cue) => cue.spokenWeight > 0));
  assert.ok(cues.some((cue) => cue.speaker === "WOMAN"));
});

test("does not send answer annotations to TTS while preserving spoken numbers", () => {
  const spoken = transcriptForTts("WOMAN:It costs £120. The group usually has eight people.1");
  assert.match(spoken, /£120/u);
  assert.doesNotMatch(spoken, /people\\.1/u);
});
