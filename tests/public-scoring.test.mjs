import assert from "node:assert/strict";
import test from "node:test";
import { isReadingAnswerCorrect, scoreReadingPaper } from "../lib/reading/scoring.ts";
import { isListeningAnswerCorrect, scoreListeningPaper } from "../lib/listening/scoring.ts";

test("reading scoring accepts normalized exact answers", () => {
  const question = { number: 1, type: "completion", prompt: "", instruction: "", options: [], acceptableAnswers: ["solar power"] };
  assert.equal(isReadingAnswerCorrect(question, "Solar Power"), true);
  assert.equal(isReadingAnswerCorrect(question, "solar"), false);
  assert.equal(scoreReadingPaper({ passages: [{ id: "p1", questions: [question] }] }, { "1": "solar power" }).correctCount, 1);
});

test("listening scoring accepts exact answers", () => {
  const question = { number: 1, type: "completion", prompt: "", instruction: "", options: [], acceptableAnswers: ["garden"] };
  assert.equal(isListeningAnswerCorrect(question, "Garden"), true);
  assert.equal(scoreListeningPaper({ sections: [{ id: "s1", questions: [question] }] }, { "1": "garden" }).correctCount, 1);
});
