export const mockExamSkills = ["listening", "reading", "writing", "speaking"] as const;
export const mockWrittenSkills = ["listening", "reading", "writing"] as const;
export type MockExamSkill = typeof mockExamSkills[number];
export type MockExamSection = {
  status: "not_started" | "in_progress" | "completed";
  attemptId?: string;
  band?: number;
  updatedAt?: string;
};
export type MockExamProgress = Record<MockExamSkill, MockExamSection>;

export function isWrittenExamComplete(progress: MockExamProgress): boolean {
  return mockWrittenSkills.every((skill) => progress[skill].status === "completed");
}

export function nextMockWrittenSkill(progress: MockExamProgress, available: Partial<Record<MockExamSkill, boolean>>): MockExamSkill | null {
  return mockWrittenSkills.find((skill) => available[skill] && progress[skill].status !== "completed") || null;
}

export function emptyMockExamProgress(): MockExamProgress {
  return Object.fromEntries(mockExamSkills.map((skill) => [skill, { status: "not_started" }])) as MockExamProgress;
}

export function parseMockExamProgress(value: unknown): MockExamProgress {
  try {
    const parsed: unknown = JSON.parse(String(value || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyMockExamProgress();
    const source = parsed as Record<string, unknown>;
    const progress = emptyMockExamProgress();
    for (const skill of mockExamSkills) {
      const section = source[skill];
      if (!section || typeof section !== "object" || Array.isArray(section)) continue;
      const item = section as Record<string, unknown>;
      const status = item.status;
      if (status !== "not_started" && status !== "in_progress" && status !== "completed") continue;
      progress[skill] = { status };
      if (typeof item.attemptId === "string") progress[skill].attemptId = item.attemptId;
      if (typeof item.band === "number" && Number.isFinite(item.band) && item.band >= 0 && item.band <= 9) progress[skill].band = item.band;
      if (typeof item.updatedAt === "string") progress[skill].updatedAt = item.updatedAt;
    }
    return progress;
  } catch {
    return emptyMockExamProgress();
  }
}

export function parseMockExamBand(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 9 ? value : null;
}

export function makeMockExamReport(progress: MockExamProgress) {
  const bands = mockExamSkills.map((skill) => progress[skill].status === "completed" ? progress[skill].band : undefined);
  const allScored = bands.every((band) => typeof band === "number");
  return {
    overallBand: allScored ? Math.round((bands as number[]).reduce((sum, band) => sum + band, 0) / bands.length * 2) / 2 : null,
    skills: Object.fromEntries(mockExamSkills.map((skill) => [skill, progress[skill].band ?? null])),
    completedSections: mockExamSkills.filter((skill) => progress[skill].status === "completed").length,
    generatedAt: new Date().toISOString(),
  };
}
