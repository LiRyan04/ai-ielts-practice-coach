import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const learnerProfiles = sqliteTable("learner_profiles", {
  id: text("id").primaryKey(),
  targetBand: real("target_band").notNull().default(7),
  currentBand: real("current_band").notNull().default(5.5),
  examType: text("exam_type").notNull().default("academic"),
  dailyMinutes: integer("daily_minutes").notNull().default(60),
  effectiveLearningMinutes: integer("effective_learning_minutes").notNull().default(15),
  interfaceLanguage: text("interface_language").notNull().default("zh-CN"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const apiSettings = sqliteTable("api_settings", {
  accountId: text("account_id").primaryKey(),
  provider: text("provider").notNull().default("dashscope"),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  ttsProvider: text("tts_provider").notNull().default("mimo"),
  ttsBaseUrl: text("tts_base_url").notNull().default("https://api.xiaomimimo.com/v1"),
  ttsModel: text("tts_model").notNull().default("mimo-v2.5-tts"),
  ttsVoice: text("tts_voice").notNull().default("Mia"),
  encryptedApiKey: text("encrypted_api_key"),
  apiKeyLastFour: text("api_key_last_four"),
  mimoEncryptedApiKey: text("mimo_encrypted_api_key"),
  mimoApiKeyLastFour: text("mimo_api_key_last_four"),
  ttsEncryptedApiKey: text("tts_encrypted_api_key"),
  ttsApiKeyLastFour: text("tts_api_key_last_four"),
  updatedAt: text("updated_at").notNull(),
});

export const writingPrompts = sqliteTable("writing_prompts", {
  id: text("id").primaryKey(),
  accountId: text("account_id"),
  collectionId: text("collection_id").notNull().default("ai"),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  visualJson: text("visual_json"),
  source: text("source"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("writing_prompts_account_created_idx").on(table.accountId, table.createdAt)]);

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    promptId: text("prompt_id").notNull(),
    examSessionId: text("exam_session_id"),
    skill: text("skill").notNull().default("writing"),
    taskType: text("task_type").notNull(),
    status: text("status").notNull().default("draft"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    startedAt: text("started_at").notNull(),
    submittedAt: text("submitted_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("attempts_account_id_updated_at_idx").on(table.accountId, table.updatedAt),
    index("attempts_updated_at_idx").on(table.updatedAt),
  ],
);

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().unique(),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("responses_attempt_id_idx").on(table.attemptId)],
);

export const aiAssessments = sqliteTable(
  "ai_assessments",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    overallBand: real("overall_band").notNull(),
    confidence: text("confidence").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("ai_assessments_attempt_id_idx").on(table.attemptId)],
);

export const writingRevisions = sqliteTable(
  "writing_revisions",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    parentResponseId: text("parent_response_id"),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("writing_revisions_attempt_id_idx").on(table.attemptId)],
);

export const contentImports = sqliteTable("content_imports", {
  id: text("id").primaryKey(),
  sourceRepository: text("source_repository").notNull(),
  sourceCommit: text("source_commit").notNull(),
  importedAt: text("imported_at").notNull(),
  statsJson: text("stats_json").notNull(),
});

export const readingPapers = sqliteTable("reading_papers", {
  id: text("id").primaryKey(),
  ownerAccountId: text("owner_account_id"),
  collectionId: text("collection_id").notNull(),
  collectionTitle: text("collection_title").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReference: text("source_reference").notNull(),
  verificationStatus: text("verification_status").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
  passageCount: integer("passage_count").notNull(),
  questionCount: integer("question_count").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("reading_papers_owner_created_idx").on(table.ownerAccountId, table.createdAt)]);

export const readingPassages = sqliteTable(
  "reading_passages",
  {
    id: text("id").primaryKey(),
    paperId: text("paper_id").notNull(),
    passageNumber: integer("passage_number").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    difficulty: text("difficulty"),
    article: text("article").notNull(),
    questionsJson: text("questions_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("reading_passages_paper_number_idx").on(table.paperId, table.passageNumber)],
);

export const readingAttempts = sqliteTable(
  "reading_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    paperId: text("paper_id").notNull(),
    examSessionId: text("exam_session_id"),
    status: text("status").notNull().default("submitted"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    correctCount: integer("correct_count").notNull(),
    scoredCount: integer("scored_count").notNull(),
    bandScore: real("band_score").notNull(),
    answersJson: text("answers_json").notNull(),
    resultJson: text("result_json").notNull(),
    progressJson: text("progress_json").notNull().default("{}"),
    startedAt: text("started_at"),
    updatedAt: text("updated_at"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("reading_attempts_account_submitted_idx").on(table.accountId, table.submittedAt),
    index("reading_attempts_paper_idx").on(table.paperId),
  ],
);

export const listeningPapers = sqliteTable("listening_papers", {
  id: text("id").primaryKey(),
  ownerAccountId: text("owner_account_id"),
  collectionId: text("collection_id").notNull(),
  collectionTitle: text("collection_title").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReference: text("source_reference").notNull(),
  verificationStatus: text("verification_status").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
  sectionCount: integer("section_count").notNull(),
  questionCount: integer("question_count").notNull(),
  audioSectionCount: integer("audio_section_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("listening_papers_owner_created_idx").on(table.ownerAccountId, table.createdAt)]);

export const listeningSections = sqliteTable(
  "listening_sections",
  {
    id: text("id").primaryKey(),
    paperId: text("paper_id").notNull(),
    sectionNumber: integer("section_number").notNull(),
    title: text("title").notNull(),
    context: text("context"),
    questionType: text("question_type"),
    transcript: text("transcript").notNull(),
    audioJson: text("audio_json").notNull(),
    questionsJson: text("questions_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("listening_sections_paper_number_idx").on(table.paperId, table.sectionNumber)],
);

export const listeningAttempts = sqliteTable(
  "listening_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    paperId: text("paper_id").notNull(),
    examSessionId: text("exam_session_id"),
    status: text("status").notNull().default("submitted"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    correctCount: integer("correct_count").notNull(),
    scoredCount: integer("scored_count").notNull(),
    bandScore: real("band_score").notNull(),
    answersJson: text("answers_json").notNull(),
    resultJson: text("result_json").notNull(),
    progressJson: text("progress_json").notNull().default("{}"),
    startedAt: text("started_at"),
    updatedAt: text("updated_at"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("listening_attempts_account_submitted_idx").on(table.accountId, table.submittedAt),
    index("listening_attempts_paper_idx").on(table.paperId),
  ],
);

export const examReadingAttempts = sqliteTable(
  "exam_reading_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    paperId: text("paper_id").notNull(),
    examSessionId: text("exam_session_id").notNull(),
    status: text("status").notNull().default("submitted"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    correctCount: integer("correct_count").notNull(),
    scoredCount: integer("scored_count").notNull(),
    bandScore: real("band_score").notNull(),
    answersJson: text("answers_json").notNull(),
    resultJson: text("result_json").notNull(),
    progressJson: text("progress_json").notNull().default("{}"),
    startedAt: text("started_at"),
    updatedAt: text("updated_at"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("exam_reading_attempts_account_submitted_idx").on(table.accountId, table.submittedAt),
    index("exam_reading_attempts_paper_idx").on(table.paperId),
  ],
);

export const examListeningAttempts = sqliteTable(
  "exam_listening_attempts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    paperId: text("paper_id").notNull(),
    examSessionId: text("exam_session_id").notNull(),
    status: text("status").notNull().default("submitted"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    correctCount: integer("correct_count").notNull(),
    scoredCount: integer("scored_count").notNull(),
    bandScore: real("band_score").notNull(),
    answersJson: text("answers_json").notNull(),
    resultJson: text("result_json").notNull(),
    progressJson: text("progress_json").notNull().default("{}"),
    startedAt: text("started_at"),
    updatedAt: text("updated_at"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("exam_listening_attempts_account_submitted_idx").on(table.accountId, table.submittedAt),
    index("exam_listening_attempts_paper_idx").on(table.paperId),
  ],
);

export const examWritingAttempts = sqliteTable("exam_writing_attempts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  promptId: text("prompt_id").notNull(),
  examSessionId: text("exam_session_id").notNull(),
  taskType: text("task_type").notNull(),
  status: text("status").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull(),
  startedAt: text("started_at").notNull(),
  submittedAt: text("submitted_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("exam_writing_attempts_session_idx").on(table.accountId, table.examSessionId, table.promptId, table.updatedAt)]);

export const learningDailyStats = sqliteTable(
  "learning_daily_stats",
  {
    accountId: text("account_id").notNull(),
    localDate: text("local_date").notNull(),
    activeSeconds: integer("active_seconds").notNull().default(0),
    completedExercises: integer("completed_exercises").notNull().default(0),
    checkedInAt: text("checked_in_at"),
    lastHeartbeatAt: text("last_heartbeat_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.localDate] }),
    index("learning_daily_stats_account_date_idx").on(table.accountId, table.localDate),
  ],
);

export const learningCompletions = sqliteTable(
  "learning_completions",
  {
    accountId: text("account_id").notNull(),
    activityType: text("activity_type").notNull(),
    activityId: text("activity_id").notNull(),
    localDate: text("local_date").notNull(),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.activityType, table.activityId] }),
    index("learning_completions_account_date_idx").on(table.accountId, table.localDate),
  ],
);

export const practiceSummaries = sqliteTable(
  "practice_summaries",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    resultJson: text("result_json").notNull(),
    recordCount: integer("record_count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("practice_summaries_account_created_idx").on(table.accountId, table.createdAt)],
);

export const tutorMessages = sqliteTable(
  "tutor_messages",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    provider: text("provider"),
    model: text("model"),
    recommendationsJson: text("recommendations_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("tutor_messages_account_created_idx").on(table.accountId, table.createdAt)],
);

export const practiceDiagnoses = sqliteTable(
  "practice_diagnoses",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    skill: text("skill").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("practice_diagnoses_account_created_idx").on(table.accountId, table.createdAt),
    index("practice_diagnoses_attempt_created_idx").on(table.attemptId, table.createdAt),
  ],
);

export const aiJobs = sqliteTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    payloadJson: text("payload_json").notNull(),
    resultJson: text("result_json"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("ai_jobs_account_created_idx").on(table.accountId, table.createdAt),
    index("ai_jobs_status_updated_idx").on(table.status, table.updatedAt),
  ],
);
