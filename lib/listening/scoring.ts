import type { ListeningPaper, ListeningQuestion } from "./library";

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
}

function answerVariants(question: ListeningQuestion): string[] {
  return question.acceptableAnswers.flatMap((rawAnswer) => {
    const normalized = normalizeText(rawAnswer);
    const variants = new Set([normalized]);
    const leadingLetter = normalized.match(/^([a-j])(?:[.)\s,]|$)/)?.[1];
    if (leadingLetter) variants.add(leadingLetter);
    for (const part of normalized.split(/\s*\/\s*|\s+or\s+/)) {
      if (part) variants.add(part.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
    variants.add(normalized.replace(/\s*\([^)]*\)\s*$/, "").trim());
    return [...variants].filter(Boolean);
  });
}

export function isListeningAnswerCorrect(question: ListeningQuestion, answer: string): boolean {
  const normalized = normalizeText(answer);
  if (!normalized || question.acceptableAnswers.length === 0) return false;
  const variants = answerVariants(question);
  if (variants.includes(normalized)) return true;
  const selectedLetter = normalized.match(/^([a-j])(?:[.)\s]|$)/)?.[1];
  return Boolean(selectedLetter && variants.includes(selectedLetter));
}

export function calculateListeningBand(correct: number, total: number): number {
  if (total <= 0) return 0;
  const scaled = Math.round((correct / total) * 40);
  if (scaled >= 39) return 9;
  if (scaled >= 37) return 8.5;
  if (scaled >= 35) return 8;
  if (scaled >= 32) return 7.5;
  if (scaled >= 30) return 7;
  if (scaled >= 26) return 6.5;
  if (scaled >= 23) return 6;
  if (scaled >= 18) return 5.5;
  if (scaled >= 16) return 5;
  if (scaled >= 13) return 4.5;
  if (scaled >= 11) return 4;
  if (scaled >= 8) return 3.5;
  if (scaled >= 6) return 3;
  if (scaled >= 4) return 2.5;
  return scaled > 0 ? 2 : 0;
}

export function scoreListeningPaper(paper: ListeningPaper, answers: Record<string, string>) {
  const allQuestions = paper.sections.flatMap((section) => section.questions);
  const details = paper.sections.flatMap((section) => section.questions.map((question) => {
    const answer = typeof answers[String(question.number)] === "string" ? answers[String(question.number)] : "";
    const scorable = question.acceptableAnswers.length > 0;
    return {
      questionNumber: question.number,
      sectionId: section.id,
      answer,
      correctAnswer: question.acceptableAnswers[0] || null,
      scorable,
      correct: scorable ? isListeningAnswerCorrect(question, answer) : null,
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
  return { correctCount, scoredCount: scored.length, bandScore: calculateListeningBand(correctCount, scored.length), details };
}
