import assert from "node:assert/strict";
import test from "node:test";
import { countWords, normalizeBand, validateEssay } from "../lib/writing/rules.ts";

test("counts whitespace-separated IELTS words", () => {
  assert.equal(countWords("  Governments should invest\n in cities.  "), 5);
  assert.equal(countWords(""), 0);
});

test("normalizes model scores to IELTS half bands", () => {
  assert.equal(normalizeBand(6.74), 6.5);
  assert.equal(normalizeBand(6.76), 7);
  assert.equal(normalizeBand(11), 9);
  assert.equal(normalizeBand(-1), 0);
});

test("enforces Task 2 minimum length", () => {
  const shortEssay = Array.from({ length: 249 }, () => "word").join(" ");
  assert.equal(validateEssay(shortEssay, "task2").valid, false);
  const validEssay = `${shortEssay} final`;
  assert.deepEqual(validateEssay(validEssay, "task2"), { valid: true, wordCount: 250, errors: [] });
});
