/**
 * 감사 로그. append-only — 화면에서 개별 레코드를 지울 수 있게 만들지 않는다.
 *
 * 2020년부터 엑셀 시트 아래쪽에 손으로 적어 오던 변경 이력을 이것이 대신한다.
 */
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { webAuditLogs, type WebUser } from "@/lib/db/schema";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "METER_CREATE"
  | "METER_UPDATE"
  | "METER_DELETE"
  | "METER_RESTORE"
  | "PHOTO_DOWNLOAD"
  | "CALIBRATION_CREATE"
  | "CALIBRATION_UPDATE"
  | "CALIBRATION_DELETE"
  | "CERT_UPLOAD"
  | "CERT_DOWNLOAD"
  | "CERT_DELETE"
  | "CERT_ASSIGN"
  | "DATA_IMPORT"
  | "DATA_FIX";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export async function writeAudit(input: {
  actor: Pick<WebUser, "id" | "displayName"> | null;
  action: AuditAction;
  summary: string;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(webAuditLogs).values({
      actorUserId: input.actor?.id ?? null,
      actorName: input.actor?.displayName ?? "(알 수 없음)",
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary,
      changes: input.changes ?? null,
      ip: await clientIp(),
    });
  } catch (error) {
    // 감사 로그 실패가 본 작업을 막지는 않게 한다. 대신 서버 로그에는 남긴다.
    console.error("감사 로그 기록 실패", error);
  }
}

/** 수정 전후를 비교해 바뀐 항목만 추린다. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[String(field)] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}
