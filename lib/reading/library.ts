import libraryPayload from "../../content/reading-library.json";
import { ensureDatabase, getD1 } from "../../db";

export type ReadingQuestion = {
  number: number;
  type: string;
  prompt: string;
  instruction: string;
  options: string[];
  acceptableAnswers: string[];
};

export type ReadingPassage = {
  id: string;
  number: number;
  title: string;
  summary: string;
  difficulty: string;
  article: string;
  layoutHtml?: string;
  layoutQuestionNumbers?: number[];
  questions: ReadingQuestion[];
};

export type ReadingPaper = {
  id: string;
  collectionId: string;
  collectionTitle: string;
  title: string;
  sourceType: "official" | "private-import";
  sourceReference: string;
  verificationStatus: "reviewed" | "unverified";
  isPrivate: boolean;
  passages: ReadingPassage[];
};

type ReadingLibraryPayload = {
  version: number;
  importedAt: string;
  source: { repository: string; commit: string; privateUseOnly: boolean };
  stats: Record<string, number>;
  papers: ReadingPaper[];
};

const library = libraryPayload as ReadingLibraryPayload;
const importId = `legacy-reading-${library.source.commit}`;
let seeded = false;

async function runBatches(database: D1Database, statements: D1PreparedStatement[], size = 60) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}

export async function ensureReadingLibrary(): Promise<void> {
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
    const questionCount = paper.passages.reduce((sum, passage) => sum + passage.questions.length, 0);
    statements.push(database.prepare(`
      INSERT OR REPLACE INTO reading_papers
        (id, collection_id, collection_title, title, source_type, source_reference, verification_status, is_private, passage_count, question_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).bind(
      paper.id,
      paper.collectionId,
      paper.collectionTitle,
      paper.title,
      paper.sourceType,
      paper.sourceReference,
      paper.verificationStatus,
      paper.passages.length,
      questionCount,
      library.importedAt,
    ));
    for (const passage of paper.passages) {
      statements.push(database.prepare(`
        INSERT OR REPLACE INTO reading_passages
          (id, paper_id, passage_number, title, summary, difficulty, article, questions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        passage.id,
        paper.id,
        passage.number,
        passage.title,
        passage.summary || null,
        passage.difficulty || null,
        passage.article,
        JSON.stringify(passage.questions),
        library.importedAt,
      ));
    }
  }
  await runBatches(database, statements);
  await database.prepare(`
    INSERT INTO content_imports (id, source_repository, source_commit, imported_at, stats_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(importId, library.source.repository, library.source.commit, library.importedAt, JSON.stringify(library.stats)).run();
  seeded = true;
}

export type ReadingPaperSummary = Omit<ReadingPaper, "passages"> & {
  passageCount: number;
  questionCount: number;
  latestBand: number | null;
  attemptCount: number;
};

export async function listReadingPapers(accountId: string): Promise<ReadingPaperSummary[]> {
  await ensureReadingLibrary();
  const result = await getD1().prepare(`
    SELECT p.id, p.collection_id AS collectionId, p.collection_title AS collectionTitle,
      p.title, p.source_type AS sourceType, p.source_reference AS sourceReference,
      p.verification_status AS verificationStatus, p.is_private AS isPrivate,
      p.passage_count AS passageCount, p.question_count AS questionCount,
      COUNT(a.id) AS attemptCount,
      (SELECT band_score FROM reading_attempts latest
        WHERE latest.paper_id = p.id AND latest.account_id = ? AND latest.exam_session_id IS NULL
        ORDER BY latest.submitted_at DESC LIMIT 1) AS latestBand
    FROM reading_papers p
    LEFT JOIN reading_attempts a ON a.paper_id = p.id AND a.account_id = ? AND a.exam_session_id IS NULL
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
    passageCount: Number(row.passageCount),
    questionCount: Number(row.questionCount),
    latestBand: row.latestBand == null ? null : Number(row.latestBand),
    attemptCount: Number(row.attemptCount),
  }));
}

export async function getReadingPaper(id: string, accountId: string): Promise<ReadingPaper | null> {
  await ensureReadingLibrary();
  const database = getD1();
  const paper = await database.prepare(`
    SELECT id, collection_id AS collectionId, collection_title AS collectionTitle, title,
      source_type AS sourceType, source_reference AS sourceReference,
      verification_status AS verificationStatus, is_private AS isPrivate
    FROM reading_papers WHERE id = ? AND (owner_account_id IS NULL OR owner_account_id = ?)
  `).bind(id, accountId).first<Record<string, unknown>>();
  if (!paper) return null;
  const passageRows = await database.prepare(`
    SELECT id, passage_number AS number, title, summary, difficulty, article,
      questions_json AS questionsJson FROM reading_passages WHERE paper_id = ? ORDER BY passage_number
  `).bind(id).all<Record<string, unknown>>();
  const staticPassages = new Map(
    library.papers.flatMap((item) => item.passages).map((item) => [item.id, item]),
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
    passages: passageRows.results.map((row) => {
      const passageId = String(row.id);
      const staticPassage = staticPassages.get(passageId);
      return {
      id: passageId,
      number: Number(row.number),
      title: String(row.title),
      summary: typeof row.summary === "string" ? row.summary : "",
      difficulty: typeof row.difficulty === "string" ? row.difficulty : "",
      article: String(row.article),
      layoutHtml: staticPassage?.layoutHtml,
      layoutQuestionNumbers: staticPassage?.layoutQuestionNumbers,
      questions: staticPassage?.questions || JSON.parse(String(row.questionsJson)) as ReadingQuestion[],
    };
    }),
  };
}

export async function saveGeneratedReadingPaper(accountId: string, input: {
  title: string;
  summary: string;
  difficulty: string;
  article: string;
  questions: ReadingQuestion[];
  sourceReference: string;
  imported?: boolean;
}) {
  await ensureReadingLibrary();
  const database = getD1();
  const id = `${input.imported ? "import" : "ai"}-reading-${crypto.randomUUID()}`;
  const passageId = `${id}-p1`;
  const now = new Date().toISOString();
  await database.batch([
    database.prepare(`
      INSERT INTO reading_papers
        (id, owner_account_id, collection_id, collection_title, title, source_type, source_reference, verification_status, is_private, passage_count, question_count, created_at)
      VALUES (?, ?, 'ai', ?, ?, 'private-import', ?, 'unverified', 1, 1, ?, ?)
    `).bind(id, accountId, input.imported ? "我的导入材料" : "AI 私人题库", input.title, input.sourceReference, input.questions.length, now),
    database.prepare(`
      INSERT INTO reading_passages
        (id, paper_id, passage_number, title, summary, difficulty, article, questions_json, created_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(passageId, id, input.title, input.summary || null, input.difficulty, input.article, JSON.stringify(input.questions), now),
  ]);
  return id;
}
