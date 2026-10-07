import type { ReadingPaper, ReadingQuestion } from "./library";

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
}

function answerVariants(question: ReadingQuestion): string[] {
  return question.acceptableAnswers.flatMap((rawAnswer) => {
    const normalized = normalizeText(rawAnswer);
    const variants = new Set([normalized]);
    const leadingLetter = normalized.match(/^([a-j])(?:[.)\s]|$)/)?.[1];
    if (leadingLetter) variants.add(leadingLetter);
    for (const part of normalized.split(/\s*\/\s*|\s+or\s+/)) {
      if (part) variants.add(part.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
    variants.add(normalized.replace(/\s*\([^)]*\)\s*$/, "").trim());
    return [...variants].filter(Boolean);
  });
}

export function isReadingAnswerCorrect(question: ReadingQuestion, answer: string): boolean {
  const normalized = normalizeText(answer);
  if (!normalized || question.acceptableAnswers.length === 0) return false;
  const variants = answerVariants(question);
  if (variants.includes(normalized)) return true;
  const selectedLetter = normalized.match(/^([a-j])(?:[.)\s]|$)/)?.[1];
  return Boolean(selectedLetter && variants.includes(selectedLetter));
}

export function calculateAcademicReadingBand(correct: number, total: number): number {
  if (total <= 0) return 0;
  const scaled = Math.round((correct / total) * 40);
  if (scaled >= 39) return 9;
  if (scaled >= 37) return 8.5;
  if (scaled >= 35) return 8;
  if (scaled >= 33) return 7.5;
  if (scaled >= 30) return 7;
  if (scaled >= 27) return 6.5;
  if (scaled >= 23) return 6;
  if (scaled >= 19) return 5.5;
  if (scaled >= 15) return 5;
  if (scaled >= 13) return 4.5;
  if (scaled >= 10) return 4;
  if (scaled >= 8) return 3.5;
  if (scaled >= 6) return 3;
  if (scaled >= 4) return 2.5;
  return scaled > 0 ? 2 : 0;
}

export function scoreReadingPaper(paper: ReadingPaper, answers: Record<string, string>) {
  const allQuestions = paper.passages.flatMap((passage) => passage.questions);
  const details = paper.passages.flatMap((passage) => passage.questions.map((question) => {
    const key = String(question.number);
    const answer = typeof answers[key] === "string" ? answers[key] : "";
    const scorable = question.acceptableAnswers.length > 0;
    return {
      questionNumber: question.number,
      passageId: passage.id,
      answer,
      correctAnswer: question.acceptableAnswers[0] || null,
      scorable,
      correct: scorable ? isReadingAnswerCorrect(question, answer) : null,
    };
  }));
  for (let index = 1; index < allQuestions.length; index++) {
    const previous = allQuestions[index - 1];
    const current = allQuestions[index];
    if (current.number !== previous.number + 1 || current.acceptableAnswers.length !== 2 || previous.acceptableAnswers.length !== 2) continue;
    if (current.acceptableAnswers.map(normalizeText).sort().join("|") !== previous.acceptableAnswers.map(normalizeText).sort().join("|")) continue;
    if (details[index].correct && details[index - 1].correct && normalizeText(details[index].answer) === normalizeText(details[index - 1].answer)) details[index].correct = false;
  }
  const scored = details.filter((detail) => detail.scorable);
  const correctCount = scored.filter((detail) => detail.correct).length;
  return {
    correctCount,
    scoredCount: scored.length,
    bandScore: calculateAcademicReadingBand(correctCount, scored.length),
    details,
  };
}
