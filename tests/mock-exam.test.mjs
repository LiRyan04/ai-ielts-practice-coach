import assert from "node:assert/strict";
import test from "node:test";
import { emptyMockExamProgress, isWrittenExamComplete, makeMockExamReport, nextMockWrittenSkill, parseMockExamBand, parseMockExamProgress } from "../lib/practice/mock-exam.ts";

test("an omitted mock exam score stays unscored", () => {
  assert.equal(parseMockExamBand(undefined), null);
  assert.equal(parseMockExamBand(null), null);
  assert.equal(parseMockExamBand(""), null);
  assert.equal(parseMockExamBand(7), 7);
  assert.equal(parseMockExamBand(0), 0);
  assert.equal(parseMockExamBand(10), null);

  const progress = emptyMockExamProgress();
  progress.listening = { status: "completed", band: 7 };
  progress.reading = { status: "completed", band: 6.5 };
  progress.writing = { status: "completed", band: 7.5 };
  progress.speaking = { status: "completed" };
  const report = makeMockExamReport(progress);
  assert.equal(report.skills.speaking, null);
  assert.equal(report.overallBand, null);
  assert.equal(report.completedSections, 4);

  progress.speaking.band = 6;
  assert.equal(makeMockExamReport(progress).overallBand, 7);
});

test("malformed stored progress cannot corrupt a mock exam report", () => {
  const progress = parseMockExamProgress('{"speaking":null,"reading":{"status":"completed","band":"7"}}');
  assert.deepEqual(progress.speaking, { status: "not_started" });
  assert.deepEqual(progress.reading, { status: "completed" });
  assert.equal(makeMockExamReport(progress).overallBand, null);
});

test("the written exam advances in order and finishes before separate speaking practice", () => {
  const progress = emptyMockExamProgress();
  const available = { listening: true, reading: true, writing: true, speaking: true };
  assert.equal(nextMockWrittenSkill(progress, available), "listening");
  progress.listening.status = "completed";
  assert.equal(nextMockWrittenSkill(progress, available), "reading");
  progress.reading.status = "completed";
  assert.equal(nextMockWrittenSkill(progress, available), "writing");
  progress.writing.status = "completed";
  assert.equal(nextMockWrittenSkill(progress, available), null);
  assert.equal(isWrittenExamComplete(progress), true);
  assert.equal(progress.speaking.status, "not_started");
});
