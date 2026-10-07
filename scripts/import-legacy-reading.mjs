import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sourceRoot = path.resolve(process.argv[2] || "../ielts-exam");
const outputPath = path.resolve(process.argv[3] || "content/reading-library.json");
const commit = process.argv[4] || "0713e1975a72569dd751146a67edf0b085c2c261";

const sourceFiles = [
  "js/data.js",
  "js/data-extra.js",
  "js/data-extra2-1.js",
  "js/data-extra2-2.js",
  "js/data-extra2-3.js",
  "js/data-extra3-1.js",
  "js/data-extra3-2.js",
  "js/data-extra3-3.js",
  "js/reading-passages-1.js",
  "js/reading-passages-2.js",
  "js/reading-passages-3.js",
  "js/reading-passages-extra2-1.js",
  "js/reading-passages-extra2-2.js",
  "js/reading-passages-extra2-3.js",
  "js/reading-passages-extra3-1.js",
  "js/reading-passages-extra3-2.js",
  "js/reading-passages-extra3-3.js",
  "js/real-19t1.js",
  "js/real-19b.js",
  "js/real-18a.js",
  "js/real-18b.js",
  "js/real-17a.js",
  "js/real-17b.js",
  "js/real-16a.js",
  "js/real-16b.js",
  "js/real-15a.js",
  "js/real-15b.js",
  "js/real-14.js",
  "js/real-13.js",
  "js/real-12.js",
  "js/real-11.js",
  "js/real-reading-11.js",
  "js/real-reading-12.js",
  "js/real-reading-13.js",
  "js/real-reading-14.js",
  "js/real-reading-15.js",
  "js/real-reading-16.js",
  "js/real-reading-17.js",
  "js/real-reading-18.js",
  "js/real-reading-19.js",
  "js/official-samples.js",
];

const quietConsole = { log() {}, warn() {}, error() {} };
const context = vm.createContext({ console: quietConsole });
context.window = context;
context.global = context;

for (const relativePath of sourceFiles) {
  const absolutePath = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing legacy source file: ${relativePath}`);
  }
  vm.runInContext(fs.readFileSync(absolutePath, "utf8"), context, { filename: relativePath });
}

const books = vm.runInContext("IELTS_DATA.books", context);
const sourceReference = `https://github.com/Kyrie11Feng7/ielts-exam/tree/${commit}`;
const importedAt = new Date().toISOString();
const papers = [];
let passageCount = 0;
let questionCount = 0;
let missingArticleCount = 0;
let missingAnswerCount = 0;

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

for (const book of books) {
  for (const test of book.tests || []) {
    const reading = test.reading;
    if (!reading?.passages?.length) continue;
    const passages = [];
    let nextQuestionNumber = 1;
    for (const [passageIndex, passage] of reading.passages.entries()) {
      const article = cleanText(passage.text || passage.context);
      if (!article) missingArticleCount += 1;
      const questions = (passage.questions || []).map((question) => {
        const answer = cleanText(question.a);
        if (!answer) missingAnswerCount += 1;
        const normalized = {
          number: nextQuestionNumber,
          type: cleanText(question.type || passage.type || "unspecified"),
          prompt: cleanText(question.q),
          instruction: cleanText(question.instruction),
          options: Array.isArray(question.options) ? question.options.map(cleanText).filter(Boolean) : [],
          acceptableAnswers: answer ? [answer] : [],
        };
        nextQuestionNumber += 1;
        questionCount += 1;
        return normalized;
      });
      passageCount += 1;
      passages.push({
        id: `legacy-reading-${book.id}-${test.id}-p${passageIndex + 1}`,
        number: passageIndex + 1,
        title: cleanText(passage.title) || `Reading Passage ${passageIndex + 1}`,
        summary: cleanText(passage.summary || passage.context),
        difficulty: cleanText(passage.difficulty),
        article,
        questions,
      });
    }
    papers.push({
      id: `legacy-reading-${book.id}-${test.id}`,
      collectionId: String(book.id),
      collectionTitle: cleanText(book.fullTitle || book.title),
      title: cleanText(test.title) || `Test ${test.id}`,
      sourceType: book.officialSample ? "official" : "private-import",
      sourceReference,
      verificationStatus: book.officialSample ? "reviewed" : "unverified",
      isPrivate: true,
      passages,
    });
  }
}

const payload = {
  version: 1,
  importedAt,
  source: {
    repository: "Kyrie11Feng7/ielts-exam",
    commit,
    privateUseOnly: true,
  },
  stats: {
    papers: papers.length,
    passages: passageCount,
    questions: questionCount,
    missingArticles: missingArticleCount,
    missingAnswers: missingAnswerCount,
  },
  papers,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.stats, null, 2));
