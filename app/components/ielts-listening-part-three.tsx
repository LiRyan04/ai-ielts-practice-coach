"use client";

import type { ListeningQuestion } from "../../lib/listening/library";
import { formatExamText } from "../../lib/practice/format-exam-text";

const OPINIONS = [
  "A. This is aimed at a very specialist audience.",
  "B. This is now rather outdated.",
  "C. This was an effective description of a new danger.",
  "D. This suggests possible ways to improve the situation.",
  "E. This does not give a balanced account.",
  "F. This is too predictable to be useful.",
  "G. This gives insufficient evidence for its claims.",
  "H. This gives a clear explanation of the problems.",
];

function splitOption(option: string) {
  const match = option.match(/^([A-H])[.)]\s*(.*)$/);
  return match ? { letter: match[1], text: match[2] } : { letter: "", text: option };
}

function cleanPrompt(question: ListeningQuestion) {
  return formatExamText(question.prompt
    .replace(/^Questions\s+____\s+and\s+\d+\s+Choose TWO letters,\s*A-E\./i, "")
    .replace(/^\d{2}-\d{2}\s*/, "")
    .replace(/_+/g, "")
    .replace(new RegExp(`\\b${question.number}\\b`, "g"), "")
    .trim());
}

function TwoChoiceGroup({
  questions,
  answers,
  onAnswer,
  onActivate,
}: {
  questions: ListeningQuestion[];
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  const primary = questions[0];
  if (!primary) return null;
  const numbers = questions.map((question) => question.number);
  const selected = new Set(numbers.map((number) => answers[String(number)]).filter(Boolean));
  const toggle = (option: string) => {
    const existingNumber = numbers.find((number) => answers[String(number)] === option);
    if (existingNumber) {
      onAnswer(existingNumber, "");
      onActivate(existingNumber);
      return;
    }
    const emptyNumber = numbers.find((number) => !answers[String(number)]) ?? numbers.at(-1);
    if (emptyNumber) {
      onAnswer(emptyNumber, option);
      onActivate(emptyNumber);
    }
  };
  return (
    <section className="ielts-listening-multi-group">
      <h3>Questions {numbers[0]} and {numbers.at(-1)}</h3>
      <p>Choose <strong>TWO</strong> letters, <strong>A–E.</strong></p>
      <h4>{cleanPrompt(primary)}</h4>
      <div className="ielts-listening-multi-options">
        {primary.options.map((option) => {
          const parsed = splitOption(option);
          return <label key={option}><input checked={selected.has(option)} onChange={() => toggle(option)} type="checkbox" /><b>{parsed.letter}.</b><span>{parsed.text}</span></label>;
        })}
      </div>
    </section>
  );
}

export function IeltsListeningPartThree({
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
  const matching = questions.filter((question) => question.number >= 25);
  return (
    <div className="ielts-listening-part-three">
      <h2>Marine Biodiversity and Conservation</h2>
      <TwoChoiceGroup answers={answers} onActivate={onActivate} onAnswer={onAnswer} questions={questions.filter((question) => question.number >= 21 && question.number <= 22)} />
      <TwoChoiceGroup answers={answers} onActivate={onActivate} onAnswer={onAnswer} questions={questions.filter((question) => question.number >= 23 && question.number <= 24)} />
      <section className="ielts-listening-opinion-group">
        <h3>Questions 25–30</h3>
        <p>What is the students&apos; opinion of each of the following resources related to ocean biodiversity?</p>
        <p>Choose the correct letter, <strong>A–H</strong>, next to Questions 25–30.</p>
        <div className="ielts-listening-opinion-box">
          <h4>Opinions</h4>
          {OPINIONS.map((option) => {
            const parsed = splitOption(option);
            return (
              <div draggable key={option} onDragStart={(event) => { event.dataTransfer.setData("text/plain", option); event.dataTransfer.effectAllowed = "copy"; }}>
                <span aria-hidden="true">⠿</span><b>{parsed.letter}.</b><span>{parsed.text}</span>
              </div>
            );
          })}
        </div>
        <h4 className="ielts-resources-title">Resources</h4>
        <div className="ielts-listening-resource-list">
          {matching.map((question) => (
            <article
              className={question.number === activeQuestion ? "active" : ""}
              id={`question-${question.number}`}
              key={question.number}
              onClick={() => onActivate(question.number)}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDrop={(event) => {
                event.preventDefault();
                const option = event.dataTransfer.getData("text/plain");
                if (OPINIONS.includes(option)) onAnswer(question.number, option);
              }}
            >
              <strong>{question.number}</strong>
              <span>{cleanPrompt(question)}</span>
              <select aria-label={`Question ${question.number} answer`} onChange={(event) => onAnswer(question.number, event.target.value)} value={answers[String(question.number)] || ""}>
                <option disabled hidden value="">{question.number}</option>
                {OPINIONS.map((option) => <option key={option} value={option}>{splitOption(option).letter}</option>)}
              </select>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
