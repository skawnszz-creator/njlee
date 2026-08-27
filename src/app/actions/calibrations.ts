"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import {
  ensureCalibrationForCertificate,
  syncDueFromCalibrations,
} from "@/lib/calibrations";
import { db } from "@/lib/db";
import {
  CALIBRATION_RESULTS,
  webMeterCalibrations,
  webMeterCertificates,
  webMeters,
  type CalibrationResult,
} from "@/lib/db/schema";
import { YM_PATTERN } from "@/lib/meters";

export type CalibrationFormState = { error?: string };

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

async function loadMeter(meterId: string) {
  const rows = await db
    .select()
    .from(webMeters)
    .where(and(eq(webMeters.id, meterId), eq(webMeters.isDeleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* 교정 이력                                                            */
/* ------------------------------------------------------------------ */

export async function createCalibrationAction(
  _prev: CalibrationFormState,
  formData: FormData,
): Promise<CalibrationFormState> {
  const admin = await requireAdmin();

  const meterId = text(formData, "meterId");
  const meter = await loadMeter(meterId);
  if (!meter) return { error: "계측기를 찾을 수 없습니다." };

  const calibratedOn = text(formData, "calibratedOn");
  if (!DATE_PATTERN.test(calibratedOn)) {
    return { error: "교정일을 YYYY-MM-DD 형식으로 입력하세요." };
  }

  const nextDueYm = optional(formData, "nextDueYm");
  if (nextDueYm && !YM_PATTERN.test(nextDueYm)) {
    return { error: "다음 교정기한은 YYYY-MM 형식으로 입력하세요." };
  }

  const result = text(formData, "result") as CalibrationResult;
  if (!(CALIBRATION_RESULTS as readonly string[]).includes(result)) {
    return { error: "교정 결과를 선택하세요." };
  }

  const [created] = await db
    .insert(webMeterCalibrations)
    .values({
      meterId: meter.id,
      calibratedOn,
      nextDueYm,
      agency: optional(formData, "agency"),
      certificateNo: optional(formData, "certificateNo"),
      result,
      note: optional(formData, "note"),
    })
    .returning();

  // 계측기의 교정 기한을 가장 최근 이력에 맞춘다.
  await syncDueFromCalibrations(meter.id);

  await writeAudit({
    actor: admin,
    action: "CALIBRATION_CREATE",
    entityType: "web_meter_calibrations",
    entityId: created.id,
    summary: `교정 이력 등록: ${meter.assetNo} ${calibratedOn} (다음 기한 ${nextDueYm ?? "없음"})`,
    changes: { calibratedOn, nextDueYm, result },
  });

  revalidatePath("/");
  revalidatePath(`/meters/${meter.id}`);
  return {};
}

export async function deleteCalibrationAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();

  const id = text(formData, "id");
  const rows = await db
    .select()
    .from(webMeterCalibrations)
    .where(eq(webMeterCalibrations.id, id))
    .limit(1);

  const target = rows[0];
  if (!target || target.isDeleted) redirect("/");

  await db
    .update(webMeterCalibrations)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: admin.id,
      deleteReason: optional(formData, "reason"),
      updatedAt: new Date(),
    })
    .where(eq(webMeterCalibrations.id, id));

  await syncDueFromCalibrations(target.meterId);

  await writeAudit({
    actor: admin,
    action: "CALIBRATION_DELETE",
    entityType: "web_meter_calibrations",
    entityId: id,
    summary: `교정 이력 삭제: ${target.calibratedOn}`,
  });

  revalidatePath("/");
  revalidatePath(`/meters/${target.meterId}`);
}

/* ------------------------------------------------------------------ */
/* 성적서                                                               */
/* ------------------------------------------------------------------ */

export async function deleteCertificateAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();

  const id = text(formData, "id");
  const rows = await db
    .select()
    .from(webMeterCertificates)
    .where(eq(webMeterCertificates.id, id))
    .limit(1);

  const target = rows[0];
  if (!target || target.isDeleted) redirect("/");

  // 기록만 감춘다. 파일은 지우지 않는다 — 되살릴 수 있어야 한다.
  await db
    .update(webMeterCertificates)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: admin.id,
      deleteReason: optional(formData, "reason"),
      updatedAt: new Date(),
    })
    .where(eq(webMeterCertificates.id, id));

  await writeAudit({
    actor: admin,
    action: "CERT_DELETE",
    entityType: "web_meter_certificates",
    entityId: id,
    summary: `성적서 삭제: ${target.originalName}`,
  });

  if (target.meterId) revalidatePath(`/meters/${target.meterId}`);
  revalidatePath("/certificates");
}

/** 주인 없는 성적서를 계측기에 붙인다. */
export async function assignCertificateAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();

  const id = text(formData, "id");
  const meterId = text(formData, "meterId");

  const meter = await loadMeter(meterId);
  if (!meter) redirect("/certificates");

  const rows = await db
    .select()
    .from(webMeterCertificates)
    .where(
      and(
        eq(webMeterCertificates.id, id),
        eq(webMeterCertificates.isDeleted, false),
      ),
    )
    .limit(1);

  const target = rows[0];
  if (!target) redirect("/certificates");

  // 파일명에서 교정일을 읽어 그 교정 건에 함께 붙인다.
  // 이게 없으면 성적서만 쌓이고 교정 이력은 계속 비어 있게 된다.
  const calibrationId = await ensureCalibrationForCertificate(
    meter.id,
    target.originalName,
  );

  await db
    .update(webMeterCertificates)
    .set({ meterId: meter.id, calibrationId, updatedAt: new Date() })
    .where(eq(webMeterCertificates.id, id));

  await writeAudit({
    actor: admin,
    action: "CERT_ASSIGN",
    entityType: "web_meter_certificates",
    entityId: id,
    summary: `성적서 연결: ${target.originalName} → ${meter.assetNo}${
      calibrationId ? " (교정 이력 연결됨)" : " (파일명에 날짜가 없어 이력은 못 만듦)"
    }`,
    changes: { from: target.meterId, to: meter.id, calibrationId },
  });

  revalidatePath("/certificates");
  revalidatePath(`/meters/${meter.id}`);
}
