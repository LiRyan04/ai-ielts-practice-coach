"use client";

import type { ReactNode } from "react";
import type { ReadingQuestion } from "../../lib/reading/library";
import { formatExamText } from "../../lib/practice/format-exam-text";

const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G"];
const PEOPLE_OPTIONS = [
  "A. Nick Antonio",
  "B. Justin Feinstein",
  "C. Tal Dotan Ben-Soussan",
  "D. Eric Pfeifer",
];
const SUGAR_OPTIONS = [
  "A. national governments",
  "B. agricultural developments",
  "C. less wealthy nations",
  "D. untrained workers",
  "E. small-scale cultivation",
  "F. outdated methods",
  "G. financial controls",
  "H. migrant workers",
  "I. powerful individuals and businesses",
];

function splitOption(option: string) {
  const match = option.match(/^([A-I])[.)]\s*(.*)$/);
  return match ? { letter: match[1], text: match[2] } : { letter: "", text: option };
}

function cleanPrompt(question: ReadingQuestion) {
  return formatExamText(question.prompt.replace(/_+/g, "").replace(new RegExp(`\\b${question.number}\\b`, "g"), "").trim());
}

function GroupHeading({ range, children }: { range: string; children: ReactNode }) {
  return <div className="ielts-reading-group-heading"><h3>Questions {range}</h3>{children}</div>;
}

function MatchingRow({
  question,
  options,
  answers,
  activeQuestion,
  onAnswer,
  onActivate,
}: {
  question: ReadingQuestion;
  options: string[];
  answers: Record<string, string>;
  activeQuestion: number;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  return (
    <article className={question.number === activeQuestion ? "ielts-matching-row active" : "ielts-matching-row"} id={`question-${question.number}`} onClick={() => onActivate(question.number)}>
      <strong>{question.number}</strong>
      <span>{cleanPrompt(question)}</span>
      <select aria-label={`Question ${question.number} answer`} onChange={(event) => onAnswer(question.number, event.target.value)} value={answers[String(question.number)] || ""}>
        <option disabled hidden value="">{question.number}</option>
        {options.map((option) => <option key={option} value={option}>{splitOption(option).letter || option}</option>)}
      </select>
    </article>
  );
}

function ChoiceQuestion({
  question,
  answers,
  activeQuestion,
  onAnswer,
  onActivate,
}: {
  question: ReadingQuestion;
  answers: Record<string, string>;
  activeQuestion: number;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  return (
    <article className={question.number === activeQuestion ? "ielts-reading-choice active" : "ielts-reading-choice"} id={`question-${question.number}`} onClick={() => onActivate(question.number)}>
      <div className="ielts-reading-choice-prompt"><strong>{question.number}</strong><span>{formatExamText(question.prompt)}</span></div>
      <div className="ielts-reading-choice-options">
        {question.options.map((option) => {
          const parsed = splitOption(option);
          return (
            <label key={option}>
              <input checked={answers[String(question.number)] === option} name={`question-${question.number}`} onChange={() => onAnswer(question.number, option)} type="radio" />
              {parsed.letter ? <b>{parsed.letter}.</b> : null}
              <span>{formatExamText(parsed.text)}</span>
            </label>
          );
        })}
      </div>
    </article>
  );
}

function SharedOptionBox({ title, options, draggable = false }: { title?: string; options: string[]; draggable?: boolean }) {
  return (
    <div className={draggable ? "ielts-reading-option-box draggable" : "ielts-reading-option-box"}>
      {title ? <h4>{title}</h4> : null}
      {options.map((option) => {
        const parsed = splitOption(option);
        return (
          <div
            draggable={draggable}
            key={option}
            onDragStart={draggable ? (event) => {
              event.dataTransfer.setData("text/plain", option);
              event.dataTransfer.effectAllowed = "copy";
            } : undefined}
          >
            {draggable ? <span className="drag-grip" aria-hidden="true">⠿</span> : null}
            <b>{parsed.letter}.</b><span>{parsed.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function DropAnswer({
  number,
  options,
  answers,
  onAnswer,
  onActivate,
}: {
  number: number;
  options: string[];
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  return (
    <span
      className="ielts-drop-answer"
      id={`question-${number}`}
      onClick={() => onActivate(number)}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={(event) => {
        event.preventDefault();
        const option = event.dataTransfer.getData("text/plain");
        if (options.includes(option)) onAnswer(number, option);
      }}
    >
      <span>{number}</span>
      <select aria-label={`Question ${number} answer`} onChange={(event) => onAnswer(number, event.target.value)} value={answers[String(number)] || ""}>
        <option disabled hidden value="">{number}</option>
        {options.map((option) => <option key={option} value={option}>{splitOption(option).letter}</option>)}
      </select>
    </span>
  );
}

export function ReadingPassageTwoLayout({
  questions,
  answers,
  activeQuestion,
  summaryLayout,
  onAnswer,
  onActivate,
}: {
  questions: ReadingQuestion[];
  answers: Record<string, string>;
  activeQuestion: number;
  summaryLayout: ReactNode;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  const sectionQuestions = questions.filter((question) => question.number >= 14 && question.number <= 17);
  const peopleQuestions = questions.filter((question) => question.number >= 22 && question.number <= 26);
  return (
    <div className="ielts-native-reading-layout">
      <section className="ielts-native-reading-group">
        <GroupHeading range="14–17">
          <p>Reading Passage 2 has seven sections, <strong>A–G.</strong></p>
          <p>Which section contains the following information?</p>
          <p>Choose the correct letter, <strong>A–G</strong>, in boxes 14–17 on your answer sheet.</p>
        </GroupHeading>
        <div className="ielts-matching-rows">
          {sectionQuestions.map((question) => <MatchingRow activeQuestion={activeQuestion} answers={answers} key={question.number} onActivate={onActivate} onAnswer={onAnswer} options={SECTION_OPTIONS} question={question} />)}
        </div>
      </section>
      {summaryLayout}
      <section className="ielts-native-reading-group">
        <GroupHeading range="22–26">
          <p>Look at the following statements (Questions 22–26) and the list of people below.</p>
          <p>Match each statement with the correct person, <strong>A–D.</strong></p>
          <p>Choose the correct letter, <strong>A–D</strong>, next to Questions 22–26.</p>
          <p className="ielts-nb"><strong>NB</strong><em>You may use any letter more than once.</em></p>
        </GroupHeading>
        <SharedOptionBox options={PEOPLE_OPTIONS} title="List of People" />
        <div className="ielts-matching-rows">
          {peopleQuestions.map((question) => <MatchingRow activeQuestion={activeQuestion} answers={answers} key={question.number} onActivate={onActivate} onAnswer={onAnswer} options={PEOPLE_OPTIONS} question={question} />)}
        </div>
      </section>
    </div>
  );
}

export function ReadingPassageThreeLayout({
  questions,
  answers,
  activeQuestion,
  onAnswer,
  onActivate,
}: {
  questions: ReadingQuestion[];
  answers: Record<string, string>;
  activeQuestion: number;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  const multipleChoice = questions.filter((question) => question.number >= 27 && question.number <= 30);
  const claims = questions.filter((question) => question.number >= 37 && question.number <= 40);
  return (
    <div className="ielts-native-reading-layout">
      <section className="ielts-native-reading-group">
        <GroupHeading range="27–30"><p>Choose the correct letter, <strong>A, B, C or D.</strong></p></GroupHeading>
        {multipleChoice.map((question) => <ChoiceQuestion activeQuestion={activeQuestion} answers={answers} key={question.number} onActivate={onActivate} onAnswer={onAnswer} question={question} />)}
      </section>
      <section className="ielts-native-reading-group">
        <GroupHeading range="31–36">
          <p>Complete the summary using the list of words or phrases below.</p>
          <p>Choose the correct letter, <strong>A–I</strong>, in boxes 31–36 on your answer sheet.</p>
          <p className="ielts-drag-hint">Drag an option into a box, or select its letter.</p>
        </GroupHeading>
        <SharedOptionBox draggable options={SUGAR_OPTIONS} />
        <div className="ielts-summary-box">
          <h4>Sugar cultivation and production</h4>
          <p>The book <em>The World of Sugar</em> points out the similarities in the way that sugar was cultivated around the world. In the big industries in both Germany and the US, sugar farming depended on <DropAnswer answers={answers} number={31} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} />. However, in other parts of the world such as South Asia and Latin America, <DropAnswer answers={answers} number={32} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} /> continued.</p>
          <p>Sugar production has also involved <DropAnswer answers={answers} number={33} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} /> who were eager to protect their markets. In countries such as Cuba the sugar industry therefore had a major influence on <DropAnswer answers={answers} number={34} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} />.</p>
          <p>To support the interests of sugar producers, <DropAnswer answers={answers} number={35} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} /> were established. As a result of this, <DropAnswer answers={answers} number={36} onActivate={onActivate} onAnswer={onAnswer} options={SUGAR_OPTIONS} /> were penalised.</p>
        </div>
      </section>
      <section className="ielts-native-reading-group">
        <GroupHeading range="37–40">
          <p>Do the following statements agree with the claims of the writer in Reading Passage 3?</p>
          <p>Choose <strong>YES</strong>, <strong>NO</strong> or <strong>NOT GIVEN</strong>.</p>
        </GroupHeading>
        {claims.map((question) => <ChoiceQuestion activeQuestion={activeQuestion} answers={answers} key={question.number} onActivate={onActivate} onAnswer={onAnswer} question={question} />)}
      </section>
    </div>
  );
}
