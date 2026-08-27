"use client";

import { useState } from "react";

import { deleteMeterAction } from "@/app/actions/meters";
import type { Dictionary } from "@/lib/i18n";

/**
 * 삭제는 실제로 지우지 않고 목록에서만 감춘다. 사유는 감사 로그에 남는다.
 * 버튼을 숨기는 것은 UI 편의일 뿐이고, 실제 차단은 서버 액션에서 한다.
 */
export function DeleteMeterForm({ id, t }: { id: string; t: Dictionary }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        {t.common.delete}
      </button>
    );
  }

  return (
    <form
      action={deleteMeterAction}
      className="w-full rounded-lg border border-red-200 bg-red-50 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-medium text-red-900">{t.form.deleteTitle}</p>
      <p className="mt-0.5 text-xs text-red-700">{t.form.deleteHint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          name="reason"
          required
          maxLength={200}
          placeholder={t.form.deleteReason}
          className="min-w-[14rem] flex-1 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          {t.form.deleteConfirm}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
