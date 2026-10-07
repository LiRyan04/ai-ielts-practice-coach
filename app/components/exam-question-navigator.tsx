"use client";

import Link from "next/link";
import { useState } from "react";

export type ExamQuestionGroup = {
  label: string;
  questions: number[];
};

type Props = {
  activeQuestion: number;
  answeredQuestions: Set<number>;
  error?: string | null;
  exitHref: string;
  groups: ExamQuestionGroup[];
  onNavigate: (question: number) => void;
  onSubmit: () => void;
  onNextPart?: () => void;
  onToggleReview: (question: number) => void;
  reviewedQuestions: Set<number>;
  submitLabel: string;
  submitting: boolean;
  confirmSubmit?: boolean;
};

export function ExamQuestionNavigator({
  activeQuestion,
  answeredQuestions,
  error,
  exitHref,
  groups,
  onNavigate,
  onSubmit,
  onNextPart,
  onToggleReview,
  reviewedQuestions,
  submitLabel,
  submitting,
  confirmSubmit = false,
}: Props) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const allQuestions = groups.flatMap((group) => group.questions);
  const activeIndex = allQuestions.indexOf(activeQuestion);
  const previousQuestion = activeIndex > 0 ? allQuestions[activeIndex - 1] : null;
  const nextQuestion = activeIndex >= 0 && activeIndex < allQuestions.length - 1 ? allQuestions[activeIndex + 1] : null;
  const unansweredCount = allQuestions.filter((question) => !answeredQuestions.has(question)).length;

  return (
    <footer className="exam-navigation" aria-label="Question navigation">
      <div className="exam-navigation-status">
        <button
          aria-pressed={reviewedQuestions.has(activeQuestion)}
          className={reviewedQuestions.has(activeQuestion) ? "review-toggle active" : "review-toggle"}
          onClick={() => onToggleReview(activeQuestion)}
          type="button"
        >
          <span aria-hidden="true">◆</span>
          {reviewedQuestions.has(activeQuestion) ? "Marked for review" : "Mark for review"}
        </button>
        {error ? <p className="inline-error" role="alert">{error}</p> : <span className="exam-navigation-key"><i className="answered-key" /> Answered <i className="review-key" /> Review</span>}
      </div>

      <div className="exam-question-groups">
        {groups.map((group) => {
          const isActiveGroup = group.questions.includes(activeQuestion);
          const answeredInGroup = group.questions.filter((question) => answeredQuestions.has(question)).length;
          return (
          <div className={isActiveGroup ? "exam-question-group active" : "exam-question-group"} key={group.label}>
            <button className="exam-group-button" onClick={() => onNavigate(group.questions[0])} type="button">{group.label}</button>
            {isActiveGroup ? <div>
              {group.questions.map((question) => {
                const classes = [
                  "exam-question-button",
                  question === activeQuestion ? "active" : "",
                  answeredQuestions.has(question) ? "answered" : "",
                  reviewedQuestions.has(question) ? "reviewed" : "",
                ].filter(Boolean).join(" ");
                return <button aria-current={question === activeQuestion ? "step" : undefined} aria-label={`Question ${question}${answeredQuestions.has(question) ? ", answered" : ", unanswered"}${reviewedQuestions.has(question) ? ", marked for review" : ""}`} className={classes} key={question} onClick={() => onNavigate(question)} type="button">{question}</button>;
              })}
            </div> : <span>{answeredInGroup} of {group.questions.length}</span>}
          </div>
        )})}
      </div>

      <div className="exam-navigation-actions">
        <Link className="exam-exit-link" href={exitHref}>Exit</Link>
        <button aria-label="Previous question" className="exam-arrow-button" disabled={previousQuestion == null} onClick={() => previousQuestion != null && onNavigate(previousQuestion)} type="button">‹</button>
        <button aria-label="Next question" className="exam-arrow-button" disabled={nextQuestion == null} onClick={() => nextQuestion != null && onNavigate(nextQuestion)} type="button">›</button>
        <button className="exam-submit-button" disabled={submitting} onClick={onNextPart || (() => confirmSubmit ? setShowConfirmation(true) : onSubmit())} type="button">{submitting ? "Submitting…" : submitLabel}</button>
      </div>
      {showConfirmation ? <div className="exam-finish-backdrop" role="presentation">
        <section aria-labelledby="exam-finish-title" aria-modal="true" className="exam-finish-dialog" role="dialog">
          <p className="eyebrow">FINAL CHECK</p>
          <h2 id="exam-finish-title">确认交卷？</h2>
          <p>整科共 {allQuestions.length} 题，已作答 {allQuestions.length - unansweredCount} 题，未作答 {unansweredCount} 题。交卷后不能继续修改答案。</p>
          <div><button className="button button-secondary" onClick={() => setShowConfirmation(false)} type="button">返回检查</button><button className="button button-primary" disabled={submitting} onClick={() => { setShowConfirmation(false); onSubmit(); }} type="button">确认交卷</button></div>
        </section>
      </div> : null}
    </footer>
  );
}
