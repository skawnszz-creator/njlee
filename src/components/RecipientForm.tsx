"use client";

import { useActionState } from "react";

import {
  addRecipientAction,
  type NotifyFormState,
} from "@/app/actions/notify";
import { LANGUAGE_LABEL, LANGUAGES } from "@/lib/i18n/types";

const INPUT =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

/** 알림 받을 사람 추가. 언어는 그 사람이 받을 메일의 언어다. */
export function RecipientForm() {
  const [state, formAction, pending] = useActionState<NotifyFormState, FormData>(
    addRecipientAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="email"
        type="email"
        required
        placeholder="사람@dss21.com"
        className={`${INPUT} min-w-[15rem] flex-1`}
      />
      <input name="name" placeholder="이름 (선택)" className={`${INPUT} w-32`} />
      <select name="lang" defaultValue="ko" className={INPUT}>
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_LABEL[l]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
      >
        {pending ? "추가하는 중…" : "+ 추가"}
      </button>

      {state.error && (
        <p className="w-full rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
          {state.ok}
        </p>
      )}
    </form>
  );
}
