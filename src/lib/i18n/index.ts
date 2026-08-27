import { cookies } from "next/headers";

import { ja } from "./ja";
import { ko } from "./ko";
import { LANGUAGES, type Dictionary, type Lang } from "./types";

export { LANGUAGES, LANGUAGE_LABEL } from "./types";
export type { Dictionary, Lang } from "./types";

export const LANG_COOKIE = "lang";
export const DEFAULT_LANG: Lang = "ko";

const DICTIONARIES: Record<Lang, Dictionary> = {
  ko: ko as unknown as Dictionary,
  ja,
};

function isLang(value: string | undefined): value is Lang {
  return !!value && (LANGUAGES as readonly string[]).includes(value);
}

/** 현재 요청의 언어. 쿠키가 없거나 이상하면 한국어. */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

export async function getDictionary(): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await getLang();
  return { lang, t: DICTIONARIES[lang] };
}

export function dictionaryFor(lang: Lang): Dictionary {
  return DICTIONARIES[lang];
}

/**
 * 계측기명 표시 규칙.
 * 일본어 화면인데 일본어 이름이 비어 있으면 한국어 이름을 그대로 보여준다.
 */
export function meterName(
  lang: Lang,
  meter: { nameKo: string; nameJa: string | null },
): string {
  if (lang === "ja") return meter.nameJa?.trim() || meter.nameKo;
  return meter.nameKo;
}
