"use client";

import { useActionState, useState } from "react";

import {
  saveTemplateAction,
  type NotifyFormState,
} from "@/app/actions/notify";
import { fill, type MailTemplate } from "@/lib/mail/template";
import type { Lang } from "@/lib/i18n/types";

const INPUT =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

const LABEL = "mb-1 block text-xs font-medium text-slate-600";

/**
 * 알림 메일 문구 편집.
 *
 * 자리표시자 두 개만 기억하면 된다 — {ym} 은 기한, {count} 는 대수.
 * 아래에 그 자리를 채운 모습을 바로 보여 준다. 저장하기 전에 확인하라고.
 */
export function MailTemplateForm({
  lang,
  langLabel,
  template,
  sampleYm,
  sampleCount,
}: {
  lang: Lang;
  langLabel: string;
  template: MailTemplate;
  sampleYm: string;
  sampleCount: number;
}) {
  const [state, formAction, pending] = useActionState<NotifyFormState, FormData>(
    saveTemplateAction,
    {},
  );

  const [subject, setSubject] = useState(template.subject);
  const [lead, setLead] = useState(template.lead);
  const [footer, setFooter] = useState(template.footer);

  const preview = (value: string) => fill(value, sampleYm, sampleCount);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lang" value={lang} />

      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{langLabel}</h3>
        <span className="text-xs text-slate-400">
          {"{ym}"} = 기한 · {"{count}"} = 대수
        </span>
      </div>

      <div>
        <label className={LABEL} htmlFor={`subject-${lang}`}>
          메일 제목
        </label>
        <input
          id={`subject-${lang}`}
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`lead-${lang}`}>
          표 위에 오는 말
        </label>
        <textarea
          id={`lead-${lang}`}
          name="lead"
          rows={3}
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`footer-${lang}`}>
          표 아래에 오는 말
        </label>
        <textarea
          id={`footer-${lang}`}
          name="footer"
          rows={2}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          className={INPUT}
        />
      </div>

      {/* 저장하기 전에 실제로 어떻게 보이는지 */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="mb-1 text-xs font-medium text-slate-500">
          이렇게 나갑니다 (기한 {sampleYm} · {sampleCount}대 기준)
        </p>
        <p className="text-sm font-semibold text-slate-900">{preview(subject)}</p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">
          {preview(lead)}
        </p>
        <p className="mt-1 text-xs whitespace-pre-wrap text-slate-400">
          {preview(footer)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
        >
          {pending ? "저장하는 중…" : "저장"}
        </button>
        {state.error && <span className="text-xs text-red-700">{state.error}</span>}
        {state.ok && <span className="text-xs text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
