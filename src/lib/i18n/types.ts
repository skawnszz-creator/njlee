import type { ko } from "./ko";

/** 한국어 사전이 기준. 일본어 사전은 이 구조를 그대로 채워야 한다. */
export type Dictionary = {
  -readonly [K in keyof typeof ko]: {
    -readonly [P in keyof (typeof ko)[K]]: string;
  };
};

export const LANGUAGES = ["ko", "ja"] as const;
export type Lang = (typeof LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<Lang, string> = {
  ko: "한국어",
  ja: "日本語",
};
