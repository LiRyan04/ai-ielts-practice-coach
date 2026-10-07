"use client";

import type { ListeningQuestion } from "../../lib/listening/library";
import { formatExamText } from "../../lib/practice/format-exam-text";

const SHARED_OPTIONS = [
  "A. being well-organised",
  "B. being flexible",
  "C. working quickly",
];

function splitOption(option: string) {
  const match = option.match(/^([A-Z])[.)]\s*(.*)$/);
  return match ? { letter: match[1], text: match[2] } : { letter: "", text: option };
}

export function IeltsListeningPartTwo({
  questions,
  answers,
  activeQuestion,
  onAnswer,
  onActivate,
}: {
  questions: ListeningQuestion[];
  answers: Record<string, string>;
  activeQuestion: number;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  const multipleChoice = questions.filter((question) => question.number >= 11 && question.number <= 16);
  const matching = questions.filter((question) => question.number >= 17 && question.number <= 20);

  return (
    <div className="ielts-listening-part-two">
      <section className="ielts-choice-group">
        <h3>Questions 11–16</h3>
        <p>Choose the correct letter, <strong>A, B or C.</strong></p>
        <h4>Working as a makeup trainee</h4>
        <div className="ielts-choice-question-list">
          {multipleChoice.map((question) => (
            <article
              className={question.number === activeQuestion ? "ielts-choice-question active" : "ielts-choice-question"}
              id={`question-${question.number}`}
              key={question.number}
              onClick={() => onActivate(question.number)}
            >
              <div className="ielts-choice-prompt"><strong>{question.number}</strong><span>{formatExamText(question.prompt)}</span></div>
              <div className="ielts-choice-options">
                {question.options.map((option) => {
                  const parsed = splitOption(option);
                  return (
                    <label key={option}>
                      <input checked={answers[String(question.number)] === option} name={`question-${question.number}`} onChange={() => onAnswer(question.number, option)} type="radio" />
                      <b>{parsed.letter}.</b>
                      <span>{parsed.text}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ielts-choice-group ielts-matching-group">
        <h3>Questions 17–20</h3>
        <p>What ability is required for each of the following duties?</p>
        <p>Choose the correct letter, <strong>A–C</strong>, next to Questions 17–20.</p>
        <div className="ielts-shared-options">
          {SHARED_OPTIONS.map((option) => {
            const parsed = splitOption(option);
            return <div key={option}><b>{parsed.letter}.</b><span>{parsed.text}</span></div>;
          })}
        </div>
        <h4 className="ielts-duties-title">Duties</h4>
        <div className="ielts-matching-list">
          {matching.map((question) => {
            const label = question.prompt.replace(/_+/g, "").replace(/\b(?:17|18|19|20)\b/g, "").trim();
            return (
              <article className={question.number === activeQuestion ? "active" : ""} id={`question-${question.number}`} key={question.number} onClick={() => onActivate(question.number)}>
                <strong>{question.number}</strong>
                <span>{label}</span>
                <select aria-label={`Question ${question.number} answer`} onChange={(event) => onAnswer(question.number, event.target.value)} value={answers[String(question.number)] || ""}>
                  <option disabled hidden value="">{question.number}</option>
                  {SHARED_OPTIONS.map((option) => <option key={option} value={option}>{splitOption(option).letter}</option>)}
                </select>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
