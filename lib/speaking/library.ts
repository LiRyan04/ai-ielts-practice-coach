import payload from "../../content/speaking-library.json";

export type SpeakingPart = {
  id: string;
  collectionId: string;
  collectionTitle: string;
  test: number;
  part: number;
  title: string;
  questions: string[];
  source: string;
};

function cleanFirstQuestion(page: SpeakingPart) {
  const raw = page.questions[0] || "";
  if (!raw.startsWith(".")) return raw;
  if (page.part === 2) return raw.match(/(Describe [\s\S]+?)(?:You should say:|$)/)?.[1]?.trim() || page.title;
  return raw.match(/([A-Z][^?]+\?)\s*$/)?.[1]?.trim() || page.title;
}

export function listSpeakingParts(collectionId: string): SpeakingPart[] {
  return (payload.pages as SpeakingPart[])
    .filter((page) => page.collectionId === collectionId)
    .map((page) => ({ ...page, questions: [cleanFirstQuestion(page), ...page.questions.slice(1)].filter(Boolean) }));
}

export function getSpeakingPart(test: number, part: number): SpeakingPart | null {
  return listSpeakingParts("21").find((page) => page.test === test && page.part === part) || null;
}
