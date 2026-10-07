import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sourceRoot = path.resolve(process.argv[2] || "../ielts-exam");
const audioTreePath = path.resolve(process.argv[3] || "/private/tmp/zeeklog-ielts-tree.json");
const outputPath = path.resolve(process.argv[4] || "content/listening-library.json");
const contentCommit = process.argv[5] || "0713e1975a72569dd751146a67edf0b085c2c261";
const audioRevision = process.argv[6] || "master";

const sourceFiles = [
  "js/data.js",
  "js/data-extra.js",
  "js/data-extra2-1.js",
  "js/data-extra2-2.js",
  "js/data-extra2-3.js",
  "js/data-extra3-1.js",
  "js/data-extra3-2.js",
  "js/data-extra3-3.js",
  "js/listening-scripts.js",
  "js/listening-scripts-extra.js",
  "js/listening-scripts-extra2-1.js",
  "js/listening-scripts-extra2-2.js",
  "js/listening-scripts-extra2-3.js",
  "js/listening-scripts-extra3-1.js",
  "js/listening-scripts-extra3-2.js",
  "js/listening-scripts-extra3-3.js",
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
  "js/real-listening-16.js",
  "js/real-listening-18.js",
  "js/real-listening-19.js",
  "js/fix-listening-answers.js",
  "js/official-samples.js",
];

const quietConsole = { log() {}, warn() {}, error() {} };
const context = vm.createContext({ console: quietConsole });
context.window = context;
context.global = context;

for (const relativePath of sourceFiles) {
  const absolutePath = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing legacy source file: ${relativePath}`);
  const source = fs.readFileSync(absolutePath, "utf8").replace("const LISTENING_SCRIPTS =", "var LISTENING_SCRIPTS =");
  vm.runInContext(source, context, { filename: relativePath });
}

const books = vm.runInContext("IELTS_DATA.books", context);
const scripts = vm.runInContext("typeof LISTENING_SCRIPTS === 'undefined' ? {} : LISTENING_SCRIPTS", context);
const audioTree = JSON.parse(fs.readFileSync(audioTreePath, "utf8"));
const audioPaths = audioTree.tree
  .filter((entry) => entry.type === "blob" && /\.(mp3|m4a|wav|ogg)$/i.test(entry.path))
  .map((entry) => entry.path);

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function parseAudioPath(audioPath) {
  const book = Number(audioPath.match(/\/(\d{2})-剑桥雅思\d+\//)?.[1]);
  if (!book) return null;
  const filename = audioPath.split("/").at(-1) || "";
  let test = Number(audioPath.match(/Test\s*(\d+)/i)?.[1]);
  if (!test) test = Number(filename.match(/test\s*_?(\d+)/i)?.[1]);
  if (!test) test = Number(filename.match(/_t(\d+)_/i)?.[1]);
  let section = Number(filename.match(/part\s*_?(\d+)/i)?.[1]);
  if (!section) section = Number(filename.match(/section\s*_?(\d+)/i)?.[1]);
  if (!section) section = Number(filename.match(/[-_]s(\d+)/i)?.[1]);
  if (!section) section = Number(filename.match(/audio(\d+)/i)?.[1]);
  if (book === 5) {
    const match = filename.match(/section(\d+)-(\d+)/i);
    if (match) [test, section] = [Number(match[1]), Number(match[2])];
  }
  if (book === 14 && !section) section = Number(filename.match(/-(\d+)\.[^.]+$/)?.[1]);
  if (book === 12 && test >= 5 && test <= 8) test -= 4;
  if (book === 13 && test === 4 && section === 5) section = 4;
  if (!test || !section || section > 4) return null;
  return { book, test, section, audioPath };
}

const audioIndex = new Map();
for (const audioPath of audioPaths) {
  const parsed = parseAudioPath(audioPath);
  if (parsed) audioIndex.set(`${parsed.book}-${parsed.test}-${parsed.section}`, parsed.audioPath);
}

function rawAudioUrl(audioPath) {
  const encodedPath = audioPath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/zeeklog/IELTS/${audioRevision}/${encodedPath}`;
}

const importedAt = new Date().toISOString();
const papers = [];
let sectionCount = 0;
let questionCount = 0;
let audioSectionCount = 0;
let ttsSectionCount = 0;
let missingTranscriptCount = 0;
let missingAnswerCount = 0;

for (const book of books) {
  for (const test of book.tests || []) {
    if (!test.listening?.sections?.length) continue;
    let nextQuestionNumber = 1;
    const sections = test.listening.sections.map((section, sectionIndex) => {
      const number = sectionIndex + 1;
      const scriptKey = `${book.id}-${test.id}-${sectionIndex}`;
      const transcript = cleanText(scripts[scriptKey] || section.audioScript);
      const audioPath = audioIndex.get(`${book.id}-${test.id}-${number}`) || null;
      if (audioPath) audioSectionCount += 1;
      else ttsSectionCount += 1;
      if (!transcript) missingTranscriptCount += 1;
      const questions = (section.questions || []).map((question) => {
        const answer = cleanText(question.a);
        if (!answer) missingAnswerCount += 1;
        questionCount += 1;
        return {
          number: nextQuestionNumber++,
          type: cleanText(question.type || section.type || "unspecified"),
          prompt: cleanText(question.q),
          instruction: cleanText(question.instruction),
          options: Array.isArray(question.options) ? question.options.map(cleanText).filter(Boolean) : [],
          acceptableAnswers: answer ? [answer] : [],
        };
      });
      sectionCount += 1;
      return {
        id: `legacy-listening-${book.id}-${test.id}-s${number}`,
        number,
        title: cleanText(section.part) || `Section ${number}`,
        context: cleanText(section.context),
        questionType: cleanText(section.type),
        transcript,
        audio: audioPath ? {
          mode: "file",
          url: rawAudioUrl(audioPath),
          format: path.extname(audioPath).slice(1).toLowerCase(),
          sourcePath: audioPath,
          sourceRepository: "zeeklog/IELTS",
        } : { mode: "tts", url: null, format: null, sourcePath: null, sourceRepository: null },
        questions,
      };
    });
    papers.push({
      id: `legacy-listening-${book.id}-${test.id}`,
      collectionId: String(book.id),
      collectionTitle: cleanText(book.fullTitle || book.title),
      title: cleanText(test.title) || `Test ${test.id}`,
      sourceType: book.officialSample ? "official" : "private-import",
      sourceReference: `https://github.com/Kyrie11Feng7/ielts-exam/tree/${contentCommit}`,
      verificationStatus: book.officialSample ? "reviewed" : "unverified",
      isPrivate: true,
      sections,
    });
  }
}

const payload = {
  version: 1,
  importedAt,
  sources: {
    content: { repository: "Kyrie11Feng7/ielts-exam", commit: contentCommit },
    audio: { repository: "zeeklog/IELTS", revision: audioRevision, tree: audioTree.sha, delivery: "remote-stream" },
    privateUseOnly: true,
  },
  stats: { papers: papers.length, sections: sectionCount, questions: questionCount, audioSections: audioSectionCount, ttsSections: ttsSectionCount, missingTranscripts: missingTranscriptCount, missingAnswers: missingAnswerCount },
  papers,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.stats, null, 2));
