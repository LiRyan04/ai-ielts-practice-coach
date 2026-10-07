"use client";

import Link from "next/link";
import { useState } from "react";
import type { ImportSkill } from "../../lib/ai/import-validation";

type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
};

function pageNumbers(value: string, maximum: number, limit: number) {
  const result = new Set<number>();
  for (const part of value.split(/[,，\s]+/u).filter(Boolean)) {
    const match = /^(\d+)(?:[-–](\d+))?$/u.exec(part);
    if (!match) throw new Error(`页码格式无效：${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end > maximum || end < start) throw new Error(`页码超出 1–${maximum}：${part}`);
    for (let page = start; page <= end; page++) result.add(page);
  }
  if (!result.size) throw new Error("请填写 PDF 页码");
  if (result.size > limit) throw new Error(`每次最多提取 ${limit} 页，请分段导入`);
  return [...result].sort((a, b) => a - b);
}

async function responseJson(response: Response) {
  const payload = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

export function MaterialImporter({ configured }: { configured: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [skill, setSkill] = useState<ImportSkill>("reading");
  const [questionPages, setQuestionPages] = useState("");
  const [answerPages, setAnswerPages] = useState("");
  const [scriptPages, setScriptPages] = useState("");
  const [ocrKey, setOcrKey] = useState("");
  const [forceOcr, setForceOcr] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceImage, setSourceImage] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ href: string; id: string } | null>(null);

  async function extract() {
    if (!file) throw new Error("请先选择 PDF");
    if (file.size > 80_000_000) throw new Error("PDF 超过 80 MB，请先拆分文件");
    const pdfjsUrl = "/vendor/pdfjs/pdf.min.mjs";
    const pdfjs = await import(/* @vite-ignore */ pdfjsUrl) as { GlobalWorkerOptions: { workerSrc: string }; getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocument> } };
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const groups = [
      { pages: pageNumbers(questionPages, pdf.numPages, 12) },
      ...(skill === "writing" ? [] : [{ pages: pageNumbers(answerPages, pdf.numPages, 4) }]),
      ...(skill === "listening" ? [{ pages: pageNumbers(scriptPages, pdf.numPages, 10) }] : []),
    ];
    async function readPage(number: number) {
      setStatus(`正在读取 PDF 第 ${number} 页…`);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").trim();
      if (!forceOcr && text.length >= 120) return text;
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法渲染扫描页");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      setStatus(`正在用 DeepSeek 识别第 ${number} 页…`);
      const payload = await responseJson(await fetch("/api/import/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.83), apiKey: ocrKey }) }));
      return String(payload.text || "");
    }
    const extracted: string[] = [];
    for (const group of groups) {
      const pages: string[] = [];
      for (const number of group.pages) pages.push(`[PDF page ${number}]\n${await readPage(number)}`);
      extracted.push(pages.join("\n\n"));
    }
    setQuestionText(extracted[0]);
    setAnswerText(skill === "writing" ? "" : extracted[1]);
    setSourceText(skill === "listening" ? extracted[2] || "" : "");
    if (skill === "writing") {
      const page = await pdf.getPage(groups[0].pages[0]);
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法保存图表原图");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      setSourceImage(canvas.toDataURL("image/jpeg", 0.75));
    } else setSourceImage("");
    setStatus("文字已提取。请检查题目、答案和原文后转换。");
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setResult(null);
    try { await action(); } catch (error) { setStatus(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function convert() {
    setStatus("正在转换为题库格式…");
    const payload = await responseJson(await fetch("/api/import/convert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skill, questionText, answerText, sourceText, sourceImage }) }));
    const material = payload.material as { questions?: Array<{ acceptableAnswers?: string[] }>; prompts?: Array<{ taskType?: string; visual?: { type?: string; dataUrl?: string } }> };
    if (skill === "writing") for (const prompt of material.prompts || []) if (prompt.visual?.type === "image") prompt.visual.dataUrl = "[PDF 原图将在保存时自动附加]";
    setPreview(JSON.stringify(material, null, 2));
    const missing = material.questions?.filter((question) => !question.acceptableAnswers?.length).length || 0;
    setStatus(missing ? `转换完成，${missing} 道题没有匹配答案。请补齐后保存。` : skill === "writing" ? "转换完成。请核对题干与 Task 1 图表数据后保存。" : "转换完成。请检查题干、选项、答案和原文后保存。");
  }

  async function save() {
    const material = JSON.parse(preview) as { prompts?: Array<{ taskType?: string; visual?: { type?: string; dataUrl?: string } }> };
    if (skill === "writing") for (const prompt of material.prompts || []) if (prompt.taskType === "task1" && prompt.visual?.type === "image") prompt.visual.dataUrl = sourceImage;
    const payload = await responseJson(await fetch("/api/import/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skill, filename: file?.name || "手动粘贴", material }) }));
    setResult({ href: String(payload.href), id: String(payload.id) });
    setStatus("已保存到私人题库，可立即练习。");
  }

  return <div className="material-importer">
    <Link className="back-link" href="/library">← 返回题库</Link>
    <p className="eyebrow">MATERIAL IMPORT</p><h1>导入 IELTS 材料</h1>
    <p>选择 PDF 中的一篇阅读、一个听力 Part 或一组写作题。阅读和听力需要指定答案页。PDF 在浏览器中读取；所选页面的文字会发给账号配置的文本模型，扫描页图片会发给 DeepSeek 识别。转换后可校对 JSON，再存入私人题库。</p>
    <div className="card import-panel">
      <div className="import-grid">
        <label>材料类型<select value={skill} onChange={(event) => { setSkill(event.target.value as ImportSkill); setPreview(""); }}><option value="reading">阅读 Passage</option><option value="listening">听力 Part</option><option value="writing">写作 Task 1 / 2</option></select></label>
        <label>PDF 文件<input accept="application/pdf,.pdf" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <label>题目页码<input placeholder={skill === "reading" ? "IELTS 21 Test 1 Passage 1：17-20" : skill === "listening" ? "IELTS 21 Test 1 Part 1：11" : "例如 30-31"} value={questionPages} onChange={(event) => setQuestionPages(event.target.value)} /></label>
        {skill !== "writing" ? <label>答案页码<input placeholder={skill === "reading" ? "IELTS 21 Test 1：119" : "IELTS 21 Test 1：118"} value={answerPages} onChange={(event) => setAnswerPages(event.target.value)} /></label> : null}
        {skill === "listening" ? <label>Audioscripts 页码<input placeholder="IELTS 21 Test 1 Part 1：98-99" value={scriptPages} onChange={(event) => setScriptPages(event.target.value)} /></label> : null}
        <label>DeepSeek API Key（仅扫描页需要）<input autoComplete="off" placeholder="临时使用，不保存" type="password" value={ocrKey} onChange={(event) => setOcrKey(event.target.value)} /></label>
      </div>
      <label className="import-checkbox"><input checked={forceOcr} onChange={(event) => setForceOcr(event.target.checked)} type="checkbox" />强制用 OCR 重识别所选页面（文字层有乱码时使用）</label>
      <p className="section-note">页码按 PDF 阅读器显示的页码填写。每次导入一个 Passage、Part 或 Test 的写作题；题目最多 12 页，答案最多 4 页。写作 Task 1 会保留首张题目页的原图，图表无需猜测数值。{configured ? "文本模型已配置。" : "转换前请先在设置中配置文本模型。"}</p>
      <button className="button button-primary" disabled={busy || !file} onClick={() => void act(extract)} type="button">提取 PDF 文字</button>
    </div>
    <div className="card import-panel">
      <h2>核对提取内容</h2>
      <label>{skill === "reading" ? "题目与阅读文章" : skill === "listening" ? "听力题目" : "写作题目与图表内容"}<textarea rows={9} value={questionText} onChange={(event) => setQuestionText(event.target.value)} /></label>
      {skill !== "writing" ? <label>答案页<textarea rows={5} value={answerText} onChange={(event) => setAnswerText(event.target.value)} /></label> : null}
      {skill === "listening" ? <label>听力原文<textarea rows={7} value={sourceText} onChange={(event) => setSourceText(event.target.value)} /></label> : null}
      <button className="button button-primary" disabled={busy || !configured || !questionText || (skill !== "writing" && !answerText)} onClick={() => void act(convert)} type="button">转换为题目</button>
    </div>
    {preview ? <div className="card import-panel"><h2>校对并保存</h2><p className="section-note">{skill === "writing" ? "Task 1 的 visual 使用原始 PDF 页面图片；请核对题干。" : "请逐题核对答案。缺失答案会阻止保存。导入后标记为“未校验”。"}</p><textarea aria-label="结构化题目 JSON" className="import-json" rows={22} value={preview} onChange={(event) => setPreview(event.target.value)} /><button className="button button-primary" disabled={busy} onClick={() => void act(save)} type="button">保存到私人题库</button></div> : null}
    {status ? <p className="import-status" role="status">{status}</p> : null}
    {result ? <Link className="button button-secondary" href={result.href}>开始练习 →</Link> : null}
  </div>;
}
