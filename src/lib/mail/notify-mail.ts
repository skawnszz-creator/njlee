/**
 * 교정 기한 알림 메일 본문.
 *
 * 문구는 DB(web_notify_templates)에 있고 화면에서 고칠 수 있다.
 * 행이 없으면 아래 기본 문구를 쓴다 — 설정을 안 해도 메일은 나가야 한다.
 *
 * 계측기 표는 문구가 아니라 데이터라 자동으로 붙는다. 고칠 수 있는 것은
 * 제목·앞말·맺음말 세 가지다.
 *
 * 메일 클라이언트는 브라우저가 아니다. 외부 CSS 도, class 도 믿을 수 없다.
 * 스타일은 태그마다 직접 적는다. 표가 깨져도 읽히도록 글자 본문도 함께 보낸다.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { webNotifyTemplates, type WebMeter } from "@/lib/db/schema";
import { dictionaryFor, meterName, type Lang } from "@/lib/i18n";
import {
  DEFAULT_TEMPLATE,
  fill,
  PLACEHOLDERS,
  type MailTemplate,
} from "@/lib/mail/template";

export type { MailTemplate };
export { DEFAULT_TEMPLATE, PLACEHOLDERS, fill };

export type NotifyMail = {
  subject: string;
  text: string;
  html: string;
};

/** 저장된 문구. 없으면 기본값. */
export async function loadTemplate(lang: Lang): Promise<MailTemplate> {
  const rows = await db
    .select()
    .from(webNotifyTemplates)
    .where(eq(webNotifyTemplates.lang, lang))
    .limit(1);

  const row = rows[0];
  if (!row) return DEFAULT_TEMPLATE[lang];
  return { subject: row.subject, lead: row.lead, footer: row.footer };
}

/**
 * 값 안의 줄바꿈을 없앤다.
 * 모델명이 여러 줄로 적힌 것들이 있다 (예: "4028A 10M" 아래에 "(10-15MHz…)").
 * 그대로 두면 글자 본문의 줄이 어긋나 표처럼 읽히지 않는다.
 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cells(meter: WebMeter, lang: Lang): string[] {
  const t = dictionaryFor(lang);
  return [
    meter.assetNo,
    oneLine(meterName(lang, meter)),
    oneLine(meter.maker ?? ""),
    oneLine(meter.model ?? ""),
    oneLine(meter.controlNo ?? ""),
    t.status[meter.status],
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 사람이 쓴 문구는 줄바꿈을 살려서 보여 준다. */
function paragraphs(text: string): string {
  return escapeHtml(text).split("\n").join("<br>");
}

function plainText(
  meters: WebMeter[],
  lang: Lang,
  url: string,
  lead: string,
  footer: string,
): string {
  const t = dictionaryFor(lang);
  const lines = meters.map((m) => {
    const [assetNo, name, maker, model, , status] = cells(m, lang);
    const spec = [maker, model].filter(Boolean).join(" ");
    return `  ${assetNo}  ${name}${spec ? `  (${spec})` : ""}  [${status}]`;
  });

  return [lead, "", ...lines, "", `${t.list.printTitle}: ${url}`, "", footer].join("\n");
}

function htmlBody(
  meters: WebMeter[],
  lang: Lang,
  url: string,
  lead: string,
  footer: string,
): string {
  const t = dictionaryFor(lang);
  const headers = [
    t.field.assetNo,
    t.field.name,
    t.field.maker,
    t.field.model,
    t.field.controlNo,
    t.field.status,
  ];

  const th =
    'style="padding:6px 10px;border:1px solid #e2e8f0;background:#f1f5f9;' +
    'text-align:left;font-size:13px;color:#334155;white-space:nowrap"';
  const td =
    'style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px;color:#0f172a"';

  const rows = meters
    .map(
      (meter) =>
        `<tr>${cells(meter, lang)
          .map((v) => `<td ${td}>${escapeHtml(v)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<div style="font-family:'Malgun Gothic','Meiryo',sans-serif;color:#0f172a">
  <p style="font-size:15px;margin:0 0 4px">${paragraphs(lead)}</p>
  <table style="border-collapse:collapse;margin:14px 0">
    <thead><tr>${headers.map((h) => `<th ${th}>${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:13px;margin:0 0 10px">
    <a href="${escapeHtml(url)}" style="color:#0369a1">${escapeHtml(t.list.printTitle)}</a>
  </p>
  <p style="font-size:12px;color:#94a3b8;margin:0">${paragraphs(footer)}</p>
</div>`;
}

export function renderNotifyMail({
  meters,
  ym,
  lang = "ko",
  url,
  template,
}: {
  meters: WebMeter[];
  ym: string;
  lang?: Lang;
  url: string;
  template: MailTemplate;
}): NotifyMail {
  const count = meters.length;
  const lead = fill(template.lead, ym, count);
  const footer = fill(template.footer, ym, count);

  return {
    subject: fill(template.subject, ym, count),
    text: plainText(meters, lang, url, lead, footer),
    html: htmlBody(meters, lang, url, lead, footer),
  };
}
