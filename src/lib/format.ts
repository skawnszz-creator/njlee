import type { Lang } from "@/lib/i18n";

const LOCALE: Record<Lang, string> = { ko: "ko-KR", ja: "ja-JP" };

/** 서버가 NAS(UTC)여도 한국 시각으로 보여준다. */
export function formatDate(value: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatDateTime(value: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
