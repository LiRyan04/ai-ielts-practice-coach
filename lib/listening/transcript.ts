const DISCOURSE_OPENERS = new Set([
  "a", "an", "and", "as", "at", "but", "for", "from", "good", "hello", "hi", "in", "it",
  "no", "now", "oh", "ok", "okay", "on", "right", "so", "thanks", "that", "the", "then",
  "this", "to", "today", "we", "well", "what", "when", "yes", "you",
]);

const ROLE_LABELS = new Set([
  "assistant", "caller", "candidate", "customer", "doctor", "employee", "examiner", "guide",
  "host", "interviewer", "lecturer", "man", "official", "operator", "presenter", "professor",
  "receptionist", "speaker", "student", "teacher", "tourist", "tutor", "woman",
]);

const COLON_LABEL = /^([A-Z][A-Za-zÀ-ÖØ-öø-ÿ0-9.'’/-]*(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ0-9.'’/-]*){0,4}(?:\s+\([A-Z][A-Z ]{1,40}\))?):\s*/u;
const TITLED_NAME = /^((?:Dr|Mr|Mrs|Ms|Miss|Prof|Professor)\.?\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]*)\s+(?=[A-Z“"'‘])/u;
const FIRST_WORD = /^([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]*)\s+(?=[A-Z“"'‘])/u;
const ANSWER_MARKER = /([.!?])\s*(40|[1-3]\d|[1-9])(?=\s|$|[A-Z“"'‘])/gu;
const ANSWER_TOKEN = /\[\[Q(40|[1-3]\d|[1-9])\]\]/gu;

function unmarkedSpeakerCandidate(line: string) {
  const titledName = line.match(TITLED_NAME)?.[1];
  if (titledName) return titledName;
  const firstWord = line.match(FIRST_WORD)?.[1];
  if (!firstWord || DISCOURSE_OPENERS.has(firstWord.toLowerCase())) return null;
  return firstWord;
}

export type TranscriptTtsSegment = { speaker: string; text: string };

function parsedTranscriptSegments(transcript: string): TranscriptTtsSegment[] {
  const lines = transcript.split(/\r?\n/u);
  const candidateCounts = new Map<string, number>();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || COLON_LABEL.test(line)) continue;
    const candidate = unmarkedSpeakerCandidate(line);
    if (candidate) candidateCounts.set(candidate, (candidateCounts.get(candidate) || 0) + 1);
  }

  const segments: TranscriptTtsSegment[] = [];
  let currentSpeaker = "NARRATOR";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const marked = line.match(COLON_LABEL);
    let text = line;
    if (marked) {
      currentSpeaker = marked[1].trim();
      text = line.slice(marked[0].length).trim();
    } else {
      const candidate = unmarkedSpeakerCandidate(line);
      const isSpeaker = Boolean(candidate) && ((candidateCounts.get(candidate!) || 0) >= 2 || ROLE_LABELS.has(candidate!.toLowerCase()));
      if (candidate && isSpeaker) {
        currentSpeaker = candidate;
        text = line.slice(candidate.length).trimStart();
      }
    }
    if (!text) continue;
    const previous = segments.at(-1);
    if (previous?.speaker === currentSpeaker) previous.text += `\n${text}`;
    else segments.push({ speaker: currentSpeaker, text });
  }
  return segments;
}

function normalizeTranscriptSpacing(text: string) {
  return text
    .replace(/([,;:!?])(?=[A-Za-z“"'‘])/gu, "$1 ")
    .replace(/\.(?=[A-Z“"'‘])/gu, ". ")
    .replace(/([A-Za-z)])(?=[£$€])/gu, "$1 ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function withoutAnswerMarkers(text: string) {
  return normalizeTranscriptSpacing(text.replace(ANSWER_MARKER, "$1 "));
}

export function transcriptSegmentsForTts(transcript: string): TranscriptTtsSegment[] {
  return parsedTranscriptSegments(transcript).map((segment) => ({
    ...segment,
    text: withoutAnswerMarkers(segment.text),
  }));
}

export type TranscriptCue = {
  speaker: string;
  text: string;
  questionNumbers: number[];
  spokenWeight: number;
};

function cueWeight(text: string) {
  const words = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9£$€%'-]+/gu)?.length || 1;
  const pauses = (text.match(/[,;:]/gu)?.length || 0) * 0.22 + (text.match(/[.!?]/gu)?.length || 0) * 0.42;
  return words + pauses;
}

/**
 * Builds speaker-aware transcript rows for synchronized practice review.
 * Source answer annotations such as ".7" become question cues and are not
 * shown or spoken as part of the dialogue.
 */
export function transcriptCues(transcript: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const segment of parsedTranscriptSegments(transcript)) {
    const marked = segment.text.replace(ANSWER_MARKER, (_, punctuation: string, number: string) => `${punctuation} [[Q${number}]] `);
    const pieces = marked
      .split(/(?<=[.!?])(?=\s|[A-Z“"'‘])|\n+/u)
      .map((piece) => piece.trim())
      .filter(Boolean);
    for (const piece of pieces) {
      const leadingNumbers: number[] = [];
      const withoutLeading = piece.replace(/^((?:\[\[Q(?:40|[1-3]\d|[1-9])\]\]\s*)+)/u, (tokens) => {
        for (const match of tokens.matchAll(ANSWER_TOKEN)) leadingNumbers.push(Number(match[1]));
        return "";
      }).trim();
      if (leadingNumbers.length && cues.length) {
        cues.at(-1)!.questionNumbers = Array.from(new Set([...cues.at(-1)!.questionNumbers, ...leadingNumbers]));
      }
      const questionNumbers = Array.from(withoutLeading.matchAll(ANSWER_TOKEN), (match) => Number(match[1]));
      const text = normalizeTranscriptSpacing(withoutLeading.replace(ANSWER_TOKEN, ""));
      if (!text) {
        if (questionNumbers.length && cues.length) {
          cues.at(-1)!.questionNumbers = Array.from(new Set([...cues.at(-1)!.questionNumbers, ...questionNumbers]));
        }
        continue;
      }
      cues.push({
        speaker: segment.speaker,
        text,
        questionNumbers: Array.from(new Set(questionNumbers)),
        spokenWeight: cueWeight(text),
      });
    }
  }
  return cues;
}

/**
 * Removes transcript-only speaker labels while preserving line breaks and the
 * spoken dialogue. Labels ending in a colon are always removed. Unmarked names
 * such as "Jack That's right" are removed only when repeated in the section;
 * known role labels such as "Official" and "Man" can be removed on first use.
 */
export function transcriptForTts(transcript: string) {
  return transcriptSegmentsForTts(transcript)
    .map((segment) => segment.text)
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
