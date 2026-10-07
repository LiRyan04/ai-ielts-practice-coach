import assert from "node:assert/strict";
import test from "node:test";
import { formatExamText } from "../lib/practice/format-exam-text.ts";

test("restores imported passage punctuation without changing answer-like numbers", () => {
  assert.equal(formatExamText("history.Bosma travelled to Cuba,where he paid 3.5 dollars;later,he left."), "history. Bosma travelled to Cuba, where he paid 3.5 dollars; later, he left.");
  assert.equal(formatExamText("e.g. 3.5 million"), "e.g. 3.5 million");
  assert.equal(formatExamText("The sisters'collection grew. Impressionists*.We know J.Pierpont Morgan."), "The sisters' collection grew. Impressionists*. We know J. Pierpont Morgan.");
});
