import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1(): D1Database {
  if (!env.DB) throw new Error("D1 binding `DB` is unavailable.");
  return env.DB;
}

let initialized = false;

export async function ensureDatabase(): Promise<void> {
  if (initialized) return;
  const database = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS learner_profiles (id TEXT PRIMARY KEY NOT NULL, target_band REAL DEFAULT 7 NOT NULL, current_band REAL DEFAULT 5.5 NOT NULL, exam_type TEXT DEFAULT 'academic' NOT NULL, daily_minutes INTEGER DEFAULT 60 NOT NULL, effective_learning_minutes INTEGER DEFAULT 15 NOT NULL, interface_language TEXT DEFAULT 'zh-CN' NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS api_settings (account_id TEXT PRIMARY KEY NOT NULL, provider TEXT DEFAULT 'dashscope' NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, tts_provider TEXT DEFAULT 'mimo' NOT NULL, tts_base_url TEXT DEFAULT 'https://api.xiaomimimo.com/v1' NOT NULL, tts_model TEXT DEFAULT 'mimo-v2.5-tts' NOT NULL, tts_voice TEXT DEFAULT 'Mia' NOT NULL, encrypted_api_key TEXT, api_key_last_four TEXT, mimo_encrypted_api_key TEXT, mimo_api_key_last_four TEXT, tts_encrypted_api_key TEXT, tts_api_key_last_four TEXT, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS writing_prompts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT, collection_id TEXT DEFAULT 'ai' NOT NULL, task_type TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, visual_json TEXT, source TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, prompt_id TEXT NOT NULL, skill TEXT DEFAULT 'writing' NOT NULL, task_type TEXT NOT NULL, status TEXT DEFAULT 'draft', duration_seconds INTEGER DEFAULT 0 NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS attempts_updated_at_idx ON attempts (updated_at)`,
    `CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, word_count INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS responses_attempt_id_idx ON responses (attempt_id)`,
    `CREATE TABLE IF NOT EXISTS ai_assessments (id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, overall_band REAL NOT NULL, confidence TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS ai_assessments_attempt_id_idx ON ai_assessments (attempt_id)`,
    `CREATE TABLE IF NOT EXISTS writing_revisions (id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL, parent_response_id TEXT, content TEXT NOT NULL, word_count INTEGER NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS writing_revisions_attempt_id_idx ON writing_revisions (attempt_id)`,
    `CREATE TABLE IF NOT EXISTS content_imports (id TEXT PRIMARY KEY NOT NULL, source_repository TEXT NOT NULL, source_commit TEXT NOT NULL, imported_at TEXT NOT NULL, stats_json TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reading_papers (id TEXT PRIMARY KEY NOT NULL, owner_account_id TEXT, collection_id TEXT NOT NULL, collection_title TEXT NOT NULL, title TEXT NOT NULL, source_type TEXT NOT NULL, source_reference TEXT NOT NULL, verification_status TEXT NOT NULL, is_private INTEGER DEFAULT 1 NOT NULL, passage_count INTEGER NOT NULL, question_count INTEGER NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reading_passages (id TEXT PRIMARY KEY NOT NULL, paper_id TEXT NOT NULL, passage_number INTEGER NOT NULL, title TEXT NOT NULL, summary TEXT, difficulty TEXT, article TEXT NOT NULL, questions_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS reading_passages_paper_number_idx ON reading_passages (paper_id, passage_number)`,
    `CREATE TABLE IF NOT EXISTS reading_attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, paper_id TEXT NOT NULL, status TEXT DEFAULT 'submitted' NOT NULL, duration_seconds INTEGER DEFAULT 0 NOT NULL, correct_count INTEGER NOT NULL, scored_count INTEGER NOT NULL, band_score REAL NOT NULL, answers_json TEXT NOT NULL, result_json TEXT NOT NULL, progress_json TEXT DEFAULT '{}' NOT NULL, started_at TEXT, updated_at TEXT, submitted_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS reading_attempts_account_submitted_idx ON reading_attempts (account_id, submitted_at)`,
    `CREATE INDEX IF NOT EXISTS reading_attempts_paper_idx ON reading_attempts (paper_id)`,
    `CREATE TABLE IF NOT EXISTS listening_papers (id TEXT PRIMARY KEY NOT NULL, owner_account_id TEXT, collection_id TEXT NOT NULL, collection_title TEXT NOT NULL, title TEXT NOT NULL, source_type TEXT NOT NULL, source_reference TEXT NOT NULL, verification_status TEXT NOT NULL, is_private INTEGER DEFAULT 1 NOT NULL, section_count INTEGER NOT NULL, question_count INTEGER NOT NULL, audio_section_count INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS listening_sections (id TEXT PRIMARY KEY NOT NULL, paper_id TEXT NOT NULL, section_number INTEGER NOT NULL, title TEXT NOT NULL, context TEXT, question_type TEXT, transcript TEXT NOT NULL, audio_json TEXT NOT NULL, questions_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS listening_sections_paper_number_idx ON listening_sections (paper_id, section_number)`,
    `CREATE TABLE IF NOT EXISTS listening_attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, paper_id TEXT NOT NULL, status TEXT DEFAULT 'submitted' NOT NULL, duration_seconds INTEGER DEFAULT 0 NOT NULL, correct_count INTEGER NOT NULL, scored_count INTEGER NOT NULL, band_score REAL NOT NULL, answers_json TEXT NOT NULL, result_json TEXT NOT NULL, progress_json TEXT DEFAULT '{}' NOT NULL, started_at TEXT, updated_at TEXT, submitted_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS listening_attempts_account_submitted_idx ON listening_attempts (account_id, submitted_at)`,
    `CREATE INDEX IF NOT EXISTS listening_attempts_paper_idx ON listening_attempts (paper_id)`,
    `CREATE TABLE IF NOT EXISTS learning_daily_stats (account_id TEXT NOT NULL, local_date TEXT NOT NULL, active_seconds INTEGER DEFAULT 0 NOT NULL, completed_exercises INTEGER DEFAULT 0 NOT NULL, checked_in_at TEXT, last_heartbeat_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (account_id, local_date))`,
    `CREATE INDEX IF NOT EXISTS learning_daily_stats_account_date_idx ON learning_daily_stats (account_id, local_date)`,
    `CREATE TABLE IF NOT EXISTS learning_completions (account_id TEXT NOT NULL, activity_type TEXT NOT NULL, activity_id TEXT NOT NULL, local_date TEXT NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY (account_id, activity_type, activity_id))`,
    `CREATE INDEX IF NOT EXISTS learning_completions_account_date_idx ON learning_completions (account_id, local_date)`,
    `CREATE TABLE IF NOT EXISTS practice_summaries (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, result_json TEXT NOT NULL, record_count INTEGER NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS practice_summaries_account_created_idx ON practice_summaries (account_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS exam_sessions (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, collection_id TEXT NOT NULL, test_number INTEGER NOT NULL, status TEXT DEFAULT 'in_progress' NOT NULL, progress_json TEXT NOT NULL, report_json TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS exam_sessions_account_updated_idx ON exam_sessions (account_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS exam_reading_attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, paper_id TEXT NOT NULL, exam_session_id TEXT NOT NULL, status TEXT NOT NULL, duration_seconds INTEGER NOT NULL, correct_count INTEGER NOT NULL, scored_count INTEGER NOT NULL, band_score REAL NOT NULL, answers_json TEXT NOT NULL, result_json TEXT NOT NULL, progress_json TEXT NOT NULL, started_at TEXT, updated_at TEXT, submitted_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS exam_reading_attempts_session_idx ON exam_reading_attempts (account_id, exam_session_id, paper_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS exam_listening_attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, paper_id TEXT NOT NULL, exam_session_id TEXT NOT NULL, status TEXT NOT NULL, duration_seconds INTEGER NOT NULL, correct_count INTEGER NOT NULL, scored_count INTEGER NOT NULL, band_score REAL NOT NULL, answers_json TEXT NOT NULL, result_json TEXT NOT NULL, progress_json TEXT NOT NULL, started_at TEXT, updated_at TEXT, submitted_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS exam_listening_attempts_session_idx ON exam_listening_attempts (account_id, exam_session_id, paper_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS exam_writing_attempts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, prompt_id TEXT NOT NULL, exam_session_id TEXT NOT NULL, task_type TEXT NOT NULL, status TEXT NOT NULL, duration_seconds INTEGER NOT NULL, content TEXT NOT NULL, word_count INTEGER NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS exam_writing_attempts_session_idx ON exam_writing_attempts (account_id, exam_session_id, prompt_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS tutor_messages (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, provider TEXT, model TEXT, recommendations_json TEXT, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS tutor_messages_account_created_idx ON tutor_messages (account_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS practice_diagnoses (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, attempt_id TEXT NOT NULL, skill TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS practice_diagnoses_account_created_idx ON practice_diagnoses (account_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS practice_diagnoses_attempt_created_idx ON practice_diagnoses (attempt_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT DEFAULT 'queued' NOT NULL, payload_json TEXT NOT NULL, result_json TEXT, error TEXT, attempts INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS ai_jobs_account_created_idx ON ai_jobs (account_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS ai_jobs_status_updated_idx ON ai_jobs (status, updated_at)`,
  ].map((statement) => database.prepare(statement));

  await database.batch(statements);

  const attemptColumns = await database.prepare("PRAGMA table_info(attempts)").all<{ name: string }>();
  if (!attemptColumns.results.some((column) => column.name === "account_id")) {
    await database.prepare("ALTER TABLE attempts ADD COLUMN account_id TEXT NOT NULL DEFAULT ''").run();
  }
  if (!attemptColumns.results.some((column) => column.name === "exam_session_id")) {
    await database.prepare("ALTER TABLE attempts ADD COLUMN exam_session_id TEXT").run();
  }
  const profileColumns = await database.prepare("PRAGMA table_info(learner_profiles)").all<{ name: string }>();
  if (!profileColumns.results.some((column) => column.name === "daily_minutes")) {
    await database.prepare("ALTER TABLE learner_profiles ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 60").run();
  }
  if (!profileColumns.results.some((column) => column.name === "effective_learning_minutes")) {
    await database.prepare("ALTER TABLE learner_profiles ADD COLUMN effective_learning_minutes INTEGER NOT NULL DEFAULT 15").run();
  }
  if (!profileColumns.results.some((column) => column.name === "interface_language")) {
    await database.prepare("ALTER TABLE learner_profiles ADD COLUMN interface_language TEXT NOT NULL DEFAULT 'zh-CN'").run();
  }
  const apiSettingColumns = await database.prepare("PRAGMA table_info(api_settings)").all<{ name: string }>();
  if (!apiSettingColumns.results.some((column) => column.name === "tts_model")) {
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_model TEXT NOT NULL DEFAULT 'qwen3-tts-flash'").run();
  }
  if (!apiSettingColumns.results.some((column) => column.name === "tts_voice")) {
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_voice TEXT NOT NULL DEFAULT 'Cherry'").run();
  }
  const needsMimoMigration = !apiSettingColumns.results.some((column) => column.name === "mimo_encrypted_api_key");
  if (needsMimoMigration) {
    await database.prepare("ALTER TABLE api_settings ADD COLUMN mimo_encrypted_api_key TEXT").run();
    await database.prepare("ALTER TABLE api_settings ADD COLUMN mimo_api_key_last_four TEXT").run();
    await database.prepare("UPDATE api_settings SET tts_model = 'mimo-v2.5-tts', tts_voice = 'Mia'").run();
  }
  if (!apiSettingColumns.results.some((column) => column.name === "tts_provider")) {
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_provider TEXT NOT NULL DEFAULT 'mimo'").run();
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_base_url TEXT NOT NULL DEFAULT 'https://api.xiaomimimo.com/v1'").run();
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_encrypted_api_key TEXT").run();
    await database.prepare("ALTER TABLE api_settings ADD COLUMN tts_api_key_last_four TEXT").run();
    await database.prepare("UPDATE api_settings SET tts_encrypted_api_key = mimo_encrypted_api_key, tts_api_key_last_four = mimo_api_key_last_four").run();
  }
  const writingPromptColumns = await database.prepare("PRAGMA table_info(writing_prompts)").all<{ name: string }>();
  if (!writingPromptColumns.results.some((column) => column.name === "account_id")) {
    await database.prepare("ALTER TABLE writing_prompts ADD COLUMN account_id TEXT").run();
  }
  if (!writingPromptColumns.results.some((column) => column.name === "collection_id")) {
    await database.prepare("ALTER TABLE writing_prompts ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'ai'").run();
  }
  if (!writingPromptColumns.results.some((column) => column.name === "visual_json")) {
    await database.prepare("ALTER TABLE writing_prompts ADD COLUMN visual_json TEXT").run();
  }
  const tutorMessageColumns = await database.prepare("PRAGMA table_info(tutor_messages)").all<{ name: string }>();
  if (!tutorMessageColumns.results.some((column) => column.name === "recommendations_json")) {
    await database.prepare("ALTER TABLE tutor_messages ADD COLUMN recommendations_json TEXT").run();
  }
  const readingPaperColumns = await database.prepare("PRAGMA table_info(reading_papers)").all<{ name: string }>();
  if (!readingPaperColumns.results.some((column) => column.name === "owner_account_id")) {
    await database.prepare("ALTER TABLE reading_papers ADD COLUMN owner_account_id TEXT").run();
  }
  const listeningPaperColumns = await database.prepare("PRAGMA table_info(listening_papers)").all<{ name: string }>();
  if (!listeningPaperColumns.results.some((column) => column.name === "owner_account_id")) {
    await database.prepare("ALTER TABLE listening_papers ADD COLUMN owner_account_id TEXT").run();
  }
  const readingAttemptColumns = await database.prepare("PRAGMA table_info(reading_attempts)").all<{ name: string }>();
  if (!readingAttemptColumns.results.some((column) => column.name === "exam_session_id")) {
    await database.prepare("ALTER TABLE reading_attempts ADD COLUMN exam_session_id TEXT").run();
  }
  if (!readingAttemptColumns.results.some((column) => column.name === "progress_json")) {
    await database.prepare("ALTER TABLE reading_attempts ADD COLUMN progress_json TEXT NOT NULL DEFAULT '{}'").run();
    await database.prepare("ALTER TABLE reading_attempts ADD COLUMN started_at TEXT").run();
    await database.prepare("ALTER TABLE reading_attempts ADD COLUMN updated_at TEXT").run();
    await database.prepare("UPDATE reading_attempts SET started_at = submitted_at, updated_at = submitted_at").run();
  }
  const listeningAttemptColumns = await database.prepare("PRAGMA table_info(listening_attempts)").all<{ name: string }>();
  if (!listeningAttemptColumns.results.some((column) => column.name === "exam_session_id")) {
    await database.prepare("ALTER TABLE listening_attempts ADD COLUMN exam_session_id TEXT").run();
  }
  if (!listeningAttemptColumns.results.some((column) => column.name === "progress_json")) {
    await database.prepare("ALTER TABLE listening_attempts ADD COLUMN progress_json TEXT NOT NULL DEFAULT '{}'").run();
    await database.prepare("ALTER TABLE listening_attempts ADD COLUMN started_at TEXT").run();
    await database.prepare("ALTER TABLE listening_attempts ADD COLUMN updated_at TEXT").run();
    await database.prepare("UPDATE listening_attempts SET started_at = submitted_at, updated_at = submitted_at").run();
  }
  await database.prepare("CREATE INDEX IF NOT EXISTS attempts_account_id_updated_at_idx ON attempts (account_id, updated_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS writing_prompts_account_created_idx ON writing_prompts (account_id, created_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS reading_papers_owner_created_idx ON reading_papers (owner_account_id, created_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS listening_papers_owner_created_idx ON listening_papers (owner_account_id, created_at)").run();
  await database.prepare(`DELETE FROM practice_summaries WHERE account_id IN (
    SELECT account_id FROM reading_attempts WHERE exam_session_id IS NOT NULL
    UNION SELECT account_id FROM listening_attempts WHERE exam_session_id IS NOT NULL
    UNION SELECT account_id FROM attempts WHERE exam_session_id IS NOT NULL
  )`).run();
  for (const skill of ["reading", "listening"] as const) {
    const oldTable = `${skill}_attempts`;
    const examTable = `exam_${skill}_attempts`;
    await database.batch([
      database.prepare(`INSERT OR IGNORE INTO ${examTable} (id, account_id, paper_id, exam_session_id, status, duration_seconds, correct_count, scored_count, band_score, answers_json, result_json, progress_json, started_at, updated_at, submitted_at)
        SELECT id, account_id, paper_id, exam_session_id, status, duration_seconds, correct_count, scored_count, band_score, answers_json, result_json, progress_json, started_at, updated_at, submitted_at FROM ${oldTable} WHERE exam_session_id IS NOT NULL`),
      database.prepare(`DELETE FROM ${oldTable} WHERE exam_session_id IS NOT NULL AND id IN (SELECT id FROM ${examTable})`),
    ]);
  }
  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO exam_writing_attempts (id, account_id, prompt_id, exam_session_id, task_type, status, duration_seconds, content, word_count, started_at, submitted_at, updated_at)
      SELECT a.id, a.account_id, a.prompt_id, a.exam_session_id, a.task_type, a.status, a.duration_seconds, COALESCE(r.content, ''), COALESCE(r.word_count, 0), a.started_at, a.submitted_at, a.updated_at
      FROM attempts a LEFT JOIN responses r ON r.attempt_id = a.id WHERE a.exam_session_id IS NOT NULL`),
    database.prepare(`DELETE FROM responses WHERE attempt_id IN (SELECT id FROM exam_writing_attempts)`),
    database.prepare(`DELETE FROM attempts WHERE exam_session_id IS NOT NULL AND id IN (SELECT id FROM exam_writing_attempts)`),
  ]);
  const examCompletionIds = `SELECT id FROM exam_reading_attempts UNION SELECT id FROM exam_listening_attempts UNION SELECT id FROM exam_writing_attempts`;
  await database.batch([
    database.prepare(`UPDATE learning_daily_stats SET completed_exercises = MAX(0, completed_exercises - (
      SELECT COUNT(*) FROM learning_completions c WHERE c.account_id = learning_daily_stats.account_id
      AND c.local_date = learning_daily_stats.local_date AND c.activity_id IN (${examCompletionIds})
    )) WHERE EXISTS (SELECT 1 FROM learning_completions c WHERE c.account_id = learning_daily_stats.account_id
      AND c.local_date = learning_daily_stats.local_date AND c.activity_id IN (${examCompletionIds}))`),
    database.prepare(`DELETE FROM learning_completions WHERE activity_id IN (${examCompletionIds})`),
  ]);
  initialized = true;
}
