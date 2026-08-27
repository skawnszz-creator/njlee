/**
 * 교정 이력과 성적서 조회.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { addMonths, readCertificateInfo } from "@/lib/cert-filename";
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
 * 성적서를 계측기에 붙일 때, 그 성적서가 속한 교정 건을 찾아 준다.
 * 없으면 파일명에서 읽은 날짜로 새로 만든다.
 *
 * 이게 없으면 성적서만 쌓이고 교정 이력은 비어 있게 된다.
 *
 * 계측기의 교정 기한은 건드리지 않는다 — 옛 성적서를 뒤늦게 붙였다고 해서
 * 기한이 과거로 되돌아가면 안 되기 때문이다. 기한은 사람이 정한다.
 */
export async function ensureCalibrationForCertificate(
  meterId: string,
  originalName: string,
): Promise<string | null> {
  const { calibratedOn, certificateNo } = readCertificateInfo(originalName);
  if (!calibratedOn) return null;

  const month = calibratedOn.slice(0, 7);

  // 같은 달에 이미 교정 이력이 있으면 그걸 쓴다. 하루 차이로 두 건이 생기지 않게.
  const existing = await db
    .select({ id: webMeterCalibrations.id })
    .from(webMeterCalibrations)
    .where(
      and(
        eq(webMeterCalibrations.meterId, meterId),
        eq(webMeterCalibrations.isDeleted, false),
        sql`to_char(${webMeterCalibrations.calibratedOn}, 'YYYY-MM') = ${month}`,
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(webMeterCalibrations)
    .values({
      meterId,
      calibratedOn,
      nextDueYm: addMonths(month, 12),
      agency: "BCS",
      certificateNo,
      result: "PASS", // 성적서가 발행되면 합격으로 본다
      note: "성적서에서 자동 생성",
    })
    .returning({ id: webMeterCalibrations.id });

  return created.id;
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
