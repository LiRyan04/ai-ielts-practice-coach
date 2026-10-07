"use client";

import { memo, useEffect, useRef } from "react";

const IeltsQuestionMarkup = memo(function IeltsQuestionMarkup({ html }: { html: string }) {
  return <div className="ielts-rich-markup" dangerouslySetInnerHTML={{ __html: html }} />;
});

export function IeltsQuestionLayout({
  activeQuestion,
  answers,
  html,
  onAnswer,
  onActivate,
}: {
  activeQuestion: number;
  answers: Record<string, string>;
  html: string;
  onAnswer: (number: number, value: string) => void;
  onActivate: (number: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLInputElement>("input[data-question-number]").forEach((input) => {
      const number = input.dataset.questionNumber;
      if (number) {
        input.placeholder = number;
        if (input.value !== (answers[number] || "")) input.value = answers[number] || "";
      }
    });
    root.querySelectorAll<HTMLElement>(".ielts-answer-wrap").forEach((wrapper) => {
      const number = wrapper.querySelector<HTMLElement>("[data-question-number]")?.dataset.questionNumber;
      wrapper.classList.toggle("active", Number(number) === activeQuestion);
    });
  }, [activeQuestion, answers, html]);

  return (
    <div
      className="ielts-rich-layout"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const numbered = target.closest<HTMLElement>("[data-question-number]");
        const number = Number(numbered?.dataset.questionNumber);
        if (number && number !== activeQuestion) onActivate(number);
      }}
      onInput={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const number = Number(target.dataset.questionNumber);
        if (number) {
          if (number !== activeQuestion) onActivate(number);
          onAnswer(number, target.value);
        }
      }}
      ref={rootRef}
    >
      <IeltsQuestionMarkup html={html} />
    </div>
  );
}
