import { Fragment, type ReactNode } from "react";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language: string; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "rule" };

function cells(line: string) {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
}

function isSpecial(line: string, next = "") {
  return /^\s*```/u.test(line) || /^\s*#{1,3}\s+/u.test(line) || /^\s*>/u.test(line) || /^\s*([-*+]\s+|\d+[.)]\s+)/u.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/u.test(line)
    || (line.includes("|") && /^\s*\|?\s*:?-{3,}/u.test(next));
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: Block[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```([^\s`]*)/u);
    if (fence) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/u.test(lines[index])) { content.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[1] || "", content: content.join("\n") });
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/u);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); index += 1; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/u.test(line)) { blocks.push({ type: "rule" }); index += 1; continue; }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/u.test(lines[index + 1])) {
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) { rows.push(cells(lines[index])); index += 1; }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^\s*>/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/u.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/u, "")); index += 1; }
      blocks.push({ type: "quote", lines: quote });
      continue;
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/u);
    if (list) {
      const ordered = /^\d/u.test(list[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/u);
        if (!match || /^\d/u.test(match[1]) !== ordered) break;
        items.push(match[2]); index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isSpecial(lines[index], lines[index + 1] || "")) { paragraph.push(lines[index]); index += 1; }
    blocks.push({ type: "paragraph", lines: paragraph });
  }
  return blocks;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|(?<!\*)\*([^*\n]+)\*(?!\*))/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) result.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${count}`;
    if (match[2] && match[3]) result.push(<a href={match[3]} key={key} rel="noreferrer" target="_blank">{match[2]}</a>);
    else if (match[4] || match[5]) result.push(<strong key={key}>{match[4] || match[5]}</strong>);
    else if (match[6]) result.push(<code key={key}>{match[6]}</code>);
    else if (match[7]) result.push(<em key={key}>{match[7]}</em>);
    cursor = match.index + match[0].length;
    count += 1;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function lines(values: string[], keyPrefix: string) {
  return values.map((value, index) => <Fragment key={`${keyPrefix}-${index}`}>{index > 0 ? <br /> : null}{inline(value, `${keyPrefix}-${index}`)}</Fragment>);
}

export function TutorMarkdown({ content }: { content: string }) {
  return <div className="tutor-markdown">{parseBlocks(content).map((block, index) => {
    const key = `block-${index}`;
    if (block.type === "heading") {
      if (block.level === 1) return <h2 key={key}>{inline(block.text, key)}</h2>;
      if (block.level === 2) return <h3 key={key}>{inline(block.text, key)}</h3>;
      return <h4 key={key}>{inline(block.text, key)}</h4>;
    }
    if (block.type === "paragraph") return <p key={key}>{lines(block.lines, key)}</p>;
    if (block.type === "quote") return <blockquote key={key}>{lines(block.lines, key)}</blockquote>;
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>)}</List>;
    }
    if (block.type === "code") return <pre key={key}><code data-language={block.language || undefined}>{block.content}</code></pre>;
    if (block.type === "table") return <div className="tutor-table-wrap" key={key}><table><thead><tr>{block.headers.map((header, cellIndex) => <th key={`${key}-h-${cellIndex}`}>{inline(header, `${key}-h-${cellIndex}`)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{block.headers.map((_, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{inline(row[cellIndex] || "", `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>;
    return <hr key={key} />;
  })}</div>;
}
