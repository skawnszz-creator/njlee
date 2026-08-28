/**
 * 알림 메일 문구의 뼈대.
 *
 * **여기에는 DB 를 들이지 않는다.** 문구 편집 화면(클라이언트 컴포넌트)이
 * 이 파일을 가져다 쓰기 때문이다. DB 를 건드리는 코드가 섞이면
 * postgres 드라이버가 브라우저 번들에 딸려 들어가 빌드가 깨진다.
 *
 * 실제로 저장된 문구를 읽는 일(loadTemplate)은 notify-mail.ts 에 있다.
 */
import type { Lang } from "@/lib/i18n";

export type MailTemplate = {
  subject: string;
  lead: string;
  footer: string;
};

/**
 * 문구 안에서 실제 값으로 바뀌는 자리.
 * 사람이 문구를 고칠 때 이 두 개만 기억하면 된다.
 */
export const PLACEHOLDERS = ["{ym}", "{count}"] as const;

/** 아무것도 저장하지 않았을 때 쓰는 문구 */
export const DEFAULT_TEMPLATE: Record<Lang, MailTemplate> = {
  ko: {
    subject: "[DSS 계측기] {ym} 교정 기한 {count}대 — 다음 달입니다",
    lead: "교정 기한이 {ym} 인 계측기가 {count}대 있습니다. 다음 달이므로 지금 교정을 준비해야 합니다.",
    footer: "이 메일은 계측기 관리 시스템이 매달 1일에 자동으로 보냅니다.",
  },
  ja: {
    subject: "[DSS 計測器] {ym} 校正期限 {count}台 — 来月です",
    lead: "校正期限が {ym} の計測器が {count}台 あります。来月ですので、今から準備してください。",
    footer: "このメールは計測器管理システムが毎月1日に自動送信しています。",
  },
};

/** {ym} · {count} 를 실제 값으로 바꾼다. */
export function fill(text: string, ym: string, count: number): string {
  return text.split("{ym}").join(ym).split("{count}").join(String(count));
}
