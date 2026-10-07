import libraryPayload from "../../content/listening-library.json";
import { ensureDatabase, getD1 } from "../../db";

export type ListeningQuestion = {
  number: number;
  type: string;
  prompt: string;
  instruction: string;
  options: string[];
  acceptableAnswers: string[];
};

export type ListeningAudio = {
  mode: "file" | "tts";
  url: string | null;
  format: string | null;
  sourcePath: string | null;
  sourceRepository: string | null;
};

export type ListeningSection = {
  id: string;
  number: number;
  title: string;
  context: string;
  questionType: string;
  transcript: string;
  audio: ListeningAudio;
  layoutHtml?: string;
  layoutQuestionNumbers?: number[];
  questions: ListeningQuestion[];
};

export type ListeningPaper = {
  id: string;
  collectionId: string;
  collectionTitle: string;
  title: string;
  sourceType: "official" | "private-import";
  sourceReference: string;
  verificationStatus: "reviewed" | "unverified";
  isPrivate: boolean;
  sections: ListeningSection[];
};

type ListeningLibraryPayload = {
  version: number;
  importedAt: string;
  sources: {
    content: { repository: string; commit: string };
    audio: { repository: string; revision: string; tree: string; delivery: string };
    privateUseOnly: boolean;
  };
  stats: Record<string, number>;
  papers: ListeningPaper[];
};

const library = libraryPayload as ListeningLibraryPayload;
const importId = `legacy-listening-${library.sources.content.commit}-${library.sources.audio.tree}`;
let seeded = false;

async function runBatches(database: D1Database, statements: D1PreparedStatement[], size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}

export async function ensureListeningLibrary(): Promise<void> {
  if (seeded) return;
  await ensureDatabase();
  const database = getD1();
  const existing = await database.prepare("SELECT id FROM content_imports WHERE id = ?").bind(importId).first();
  if (existing) {
    seeded = true;
    return;
  }

  const statements: D1PreparedStatement[] = [];
  for (const paper of library.papers) {
    const questionCount = paper.sections.reduce((sum, section) => sum + section.questions.length, 0);
    const audioSectionCount = paper.sections.filter((section) => section.audio.mode === "file").length;
    statements.push(database.prepare(`
      INSERT OR REPLACE INTO listening_papers
        (id, collection_id, collection_title, title, source_type, source_reference, verification_status, is_private, section_count, question_count, audio_section_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(paper.id, paper.collectionId, paper.collectionTitle, paper.title, paper.sourceType, paper.sourceReference, paper.verificationStatus, paper.sections.length, questionCount, audioSectionCount, library.importedAt));
    for (const section of paper.sections) {
      statements.push(database.prepare(`
        INSERT OR REPLACE INTO listening_sections
          (id, paper_id, section_number, title, context, question_type, transcript, audio_json, questions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(section.id, paper.id, section.number, section.title, section.context || null, section.questionType || null, section.transcript, JSON.stringify(section.audio), JSON.stringify(section.questions), library.importedAt));
    }
  }
  await runBatches(database, statements);
  await database.prepare(`
    INSERT INTO content_imports (id, source_repository, source_commit, imported_at, stats_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(importId, `${library.sources.content.repository} + ${library.sources.audio.repository}`, `${library.sources.content.commit} + ${library.sources.audio.tree}`, library.importedAt, JSON.stringify(library.stats)).run();
  seeded = true;
}

export type ListeningPaperSummary = Omit<ListeningPaper, "sections"> & {
  sectionCount: number;
  questionCount: number;
  audioSectionCount: number;
  latestBand: number | null;
  attemptCount: number;
};

export async function listListeningPapers(accountId: string): Promise<ListeningPaperSummary[]> {
  await ensureListeningLibrary();
  const result = await getD1().prepare(`
    SELECT p.id, p.collection_id AS collectionId, p.collection_title AS collectionTitle,
      p.title, p.source_type AS sourceType, p.source_reference AS sourceReference,
      p.verification_status AS verificationStatus, p.is_private AS isPrivate,
      p.section_count AS sectionCount, p.question_count AS questionCount,
      p.audio_section_count AS audioSectionCount, COUNT(a.id) AS attemptCount,
      (SELECT band_score FROM listening_attempts latest
        WHERE latest.paper_id = p.id AND latest.account_id = ? AND latest.exam_session_id IS NULL
        ORDER BY latest.submitted_at DESC LIMIT 1) AS latestBand
    FROM listening_papers p
    LEFT JOIN listening_attempts a ON a.paper_id = p.id AND a.account_id = ? AND a.exam_session_id IS NULL
    WHERE (p.owner_account_id IS NULL OR p.owner_account_id = ?)
      AND p.collection_id IN ('21', 'ai')
    GROUP BY p.id
    ORDER BY CASE WHEN p.collection_id = 'ai' THEN 0 WHEN p.collection_id = '0' THEN 1 ELSE 2 END, p.created_at DESC, p.title
  `).bind(accountId, accountId, accountId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: String(row.id),
    collectionId: String(row.collectionId),
    collectionTitle: String(row.collectionTitle),
    title: String(row.title),
    sourceType: row.sourceType === "official" ? "official" : "private-import",
    sourceReference: String(row.sourceReference),
    verificationStatus: row.verificationStatus === "reviewed" ? "reviewed" : "unverified",
    isPrivate: Boolean(row.isPrivate),
    sectionCount: Number(row.sectionCount),
    questionCount: Number(row.questionCount),
    audioSectionCount: Number(row.audioSectionCount),
    latestBand: row.latestBand == null ? null : Number(row.latestBand),
    attemptCount: Number(row.attemptCount),
  }));
}

export async function getListeningPaper(id: string, accountId: string): Promise<ListeningPaper | null> {
  await ensureListeningLibrary();
  const database = getD1();
  const paper = await database.prepare(`
    SELECT id, collection_id AS collectionId, collection_title AS collectionTitle, title,
      source_type AS sourceType, source_reference AS sourceReference,
      verification_status AS verificationStatus, is_private AS isPrivate
    FROM listening_papers WHERE id = ? AND (owner_account_id IS NULL OR owner_account_id = ?)
  `).bind(id, accountId).first<Record<string, unknown>>();
  if (!paper) return null;
  const rows = await database.prepare(`
    SELECT id, section_number AS number, title, context, question_type AS questionType,
      transcript, audio_json AS audioJson, questions_json AS questionsJson
    FROM listening_sections WHERE paper_id = ? ORDER BY section_number
  `).bind(id).all<Record<string, unknown>>();
  const staticSections = new Map(
    library.papers.flatMap((item) => item.sections).map((item) => [item.id, item]),
  );
  return {
    id: String(paper.id),
    collectionId: String(paper.collectionId),
    collectionTitle: String(paper.collectionTitle),
    title: String(paper.title),
    sourceType: paper.sourceType === "official" ? "official" : "private-import",
    sourceReference: String(paper.sourceReference),
    verificationStatus: paper.verificationStatus === "reviewed" ? "reviewed" : "unverified",
    isPrivate: Boolean(paper.isPrivate),
    sections: rows.results.map((row) => {
      const sectionId = String(row.id);
      const staticSection = staticSections.get(sectionId);
      return {
      id: sectionId,
      number: Number(row.number),
      title: String(row.title),
      context: typeof row.context === "string" ? row.context : "",
      questionType: typeof row.questionType === "string" ? row.questionType : "",
      transcript: String(row.transcript),
      audio: JSON.parse(String(row.audioJson)) as ListeningAudio,
      layoutHtml: staticSection?.layoutHtml,
      layoutQuestionNumbers: staticSection?.layoutQuestionNumbers,
      questions: staticSection?.questions || JSON.parse(String(row.questionsJson)) as ListeningQuestion[],
    };
    }),
  };
}

export async function saveGeneratedListeningPaper(accountId: string, input: {
  title: string;
  context: string;
  questionType: string;
  transcript: string;
  questions: ListeningQuestion[];
  sourceReference: string;
  imported?: boolean;
}) {
  await ensureListeningLibrary();
  const database = getD1();
  const id = `${input.imported ? "import" : "ai"}-listening-${crypto.randomUUID()}`;
  const sectionId = `${id}-s1`;
  const now = new Date().toISOString();
  const audio: ListeningAudio = { mode: "tts", url: null, format: null, sourcePath: null, sourceRepository: null };
  await database.batch([
    database.prepare(`
      INSERT INTO listening_papers
        (id, owner_account_id, collection_id, collection_title, title, source_type, source_reference, verification_status, is_private, section_count, question_count, audio_section_count, created_at)
      VALUES (?, ?, 'ai', ?, ?, 'private-import', ?, 'unverified', 1, 1, ?, 0, ?)
    `).bind(id, accountId, input.imported ? "我的导入材料" : "AI 私人题库", input.title, input.sourceReference, input.questions.length, now),
    database.prepare(`
      INSERT INTO listening_sections
        (id, paper_id, section_number, title, context, question_type, transcript, audio_json, questions_json, created_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).bind(sectionId, id, input.title, input.context || null, input.questionType || null, input.transcript, JSON.stringify(audio), JSON.stringify(input.questions), now),
  ]);
  return id;
}
