/**
 * 교정 이력과 성적서 조회.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  webMeterCalibrations,
  webMeterCertificates,
  webMeters,
  type WebMeterCalibration,
  type WebMeterCertificate,
} from "@/lib/db/schema";

/** 한 계측기의 교정 이력. 최근 것이 위로. */
export async function listCalibrations(
  meterId: string,
): Promise<WebMeterCalibration[]> {
  return db
    .select()
    .from(webMeterCalibrations)
    .where(
      and(
        eq(webMeterCalibrations.meterId, meterId),
        eq(webMeterCalibrations.isDeleted, false),
      ),
    )
    .orderBy(desc(webMeterCalibrations.calibratedOn));
}

/** 한 계측기의 성적서. */
export async function listCertificates(
  meterId: string,
): Promise<WebMeterCertificate[]> {
  return db
    .select()
    .from(webMeterCertificates)
    .where(
      and(
        eq(webMeterCertificates.meterId, meterId),
        eq(webMeterCertificates.isDeleted, false),
      ),
    )
    .orderBy(desc(webMeterCertificates.createdAt));
}

/** 아직 어느 계측기 것인지 모르는 성적서 (2020년 파일 등) */
export async function listUnassignedCertificates(): Promise<
  WebMeterCertificate[]
> {
  return db
    .select()
    .from(webMeterCertificates)
    .where(
      and(
        isNull(webMeterCertificates.meterId),
        eq(webMeterCertificates.isDeleted, false),
      ),
    )
    .orderBy(asc(webMeterCertificates.originalName));
}

export async function countUnassignedCertificates(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webMeterCertificates)
    .where(
      and(
        isNull(webMeterCertificates.meterId),
        eq(webMeterCertificates.isDeleted, false),
      ),
    );
  return rows[0]?.n ?? 0;
}

/** 목록 화면에서 "성적서 있음" 표시에 쓴다. */
export async function meterIdsWithCertificates(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ meterId: webMeterCertificates.meterId })
    .from(webMeterCertificates)
    .where(eq(webMeterCertificates.isDeleted, false));

  const set = new Set<string>();
  for (const row of rows) if (row.meterId) set.add(row.meterId);
  return set;
}

/** 계측기 고르기 목록 (성적서를 붙일 때 쓴다) */
export async function listMeterChoices(): Promise<
  { id: string; assetNo: string; nameKo: string }[]
> {
  return db
    .select({
      id: webMeters.id,
      assetNo: webMeters.assetNo,
      nameKo: webMeters.nameKo,
    })
    .from(webMeters)
    .where(eq(webMeters.isDeleted, false))
    .orderBy(asc(webMeters.assetNo));
}

/**
 * 계측기의 교정 기한을 가장 최근 교정 이력에 맞춰 다시 계산한다.
 *
 * 교정 이력을 등록·수정·삭제할 때마다 부른다.
 * 이렇게 해야 두 군데를 따로 고치지 않아도 된다.
 */
export async function syncDueFromCalibrations(meterId: string): Promise<void> {
  const latest = await db
    .select({ nextDueYm: webMeterCalibrations.nextDueYm })
    .from(webMeterCalibrations)
    .where(
      and(
        eq(webMeterCalibrations.meterId, meterId),
        eq(webMeterCalibrations.isDeleted, false),
      ),
    )
    .orderBy(desc(webMeterCalibrations.calibratedOn))
    .limit(1);

  // 이력이 하나도 없으면 계측기에 직접 적어 둔 기한을 그대로 둔다.
  if (latest.length === 0) return;
  const nextDue = latest[0].nextDueYm;
  if (!nextDue) return;

  await db
    .update(webMeters)
    .set({ calibrationDueYm: nextDue, updatedAt: new Date() })
    .where(eq(webMeters.id, meterId));
}
