"use client";

import type { Dictionary } from "@/lib/i18n";

/**
 * 목록 인쇄.
 *
 * 인쇄용 화면을 따로 만들지 않는다. 지금 보고 있는 표를 그대로 찍는다 —
 * 화면에서 조건을 맞춰 놓고 누르면 그 결과가 나오는 것이 헷갈리지 않다.
 * 무엇을 감추고 무엇을 보일지는 globals.css 의 @media print 에 있다.
 */
export function PrintButton({ t }: { t: Dictionary }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
    >
      🖨 {t.list.print}
    </button>
  );
}
