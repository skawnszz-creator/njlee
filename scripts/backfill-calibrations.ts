/**
 * 계측기에는 붙었지만 교정 이력이 없는 성적서를 이력에 이어 붙인다.
 *
 *   npm run backfill-calibrations            보기만 한다
 *   npm run backfill-calibrations -- --apply  실제로 넣는다
 *
 * 화면에서 "미등록 성적서"를 계측기에 지정할 때 파일만 연결되고
 * 교정 이력은 만들어지지 않던 시기가 있었다. 그때 붙인 것들을 채운다.
 * (앞으로는 지정할 때 자동으로 연결된다)
 *
 * 계측기의 교정 기한은 건드리지 않는다 — 옛 성적서를 뒤늦게 붙였다고 해서
 * 기한이 과거로 되돌아가면 안 되기 때문이다.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { addMonths, readCertificateInfo } from "../src/lib/cert-filename";
import {
  webAuditLogs,
  webMeterCalibrations,
  webMeterCertificates,
  webMeters,
  webUsers,
} from "../src/lib/db/schema";

process.loadEnvFile(".env.local");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("환경변수 DATABASE_URL 이 없습니다.");

const APPLY = process.argv.includes("--apply");

async function main() {
  const sql_ = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql_);

  try {
    const rows = await db
      .select({
        certId: webMeterCertificates.id,
        originalName: webMeterCertificates.originalName,
        meterId: webMeters.id,
        assetNo: webMeters.assetNo,
      })
      .from(webMeterCertificates)
      .innerJoin(webMeters, eq(webMeters.id, webMeterCertificates.meterId))
      .where(
        and(
          isNotNull(webMeterCertificates.meterId),
          isNull(webMeterCertificates.calibrationId),
          eq(webMeterCertificates.isDeleted, false),
          eq(webMeters.isDeleted, false),
        ),
      );

    console.log(`이력이 없는 성적서 ${rows.length}건`);

    const readable: typeof rows = [];
    const unreadable: typeof rows = [];
    const months = new Map<string, { meterId: string; assetNo: string; on: string }>();

    for (const row of rows) {
      const info = readCertificateInfo(row.originalName);
      if (!info.calibratedOn) {
        unreadable.push(row);
        continue;
      }
      readable.push(row);
      const key = `${row.meterId}|${info.calibratedOn.slice(0, 7)}`;
      if (!months.has(key)) {
        months.set(key, {
          meterId: row.meterId,
          assetNo: row.assetNo,
          on: info.calibratedOn,
        });
      }
    }

    console.log(`  날짜를 읽은 것   ${readable.length}건`);
    console.log(`  날짜를 못 읽은 것 ${unreadable.length}건`);
    console.log(`  묶으면 교정 ${months.size}건 (이미 있는 이력은 새로 만들지 않음)`);

    const byMeter = new Map<string, number>();
    for (const row of readable) {
      byMeter.set(row.assetNo, (byMeter.get(row.assetNo) ?? 0) + 1);
    }
    console.log("\n계측기별:");
    for (const [assetNo, n] of [...byMeter.entries()].sort()) {
      console.log(`  ${assetNo}  ${n}건`);
    }

    if (unreadable.length > 0) {
      console.log("\n날짜를 못 읽어 건너뛸 파일:");
      for (const row of unreadable) {
        console.log(`  ${row.assetNo}  ${row.originalName}`);
      }
    }

    if (!APPLY) {
      console.log("\n보기만 했습니다. 아무것도 바꾸지 않았습니다.");
      console.log("실제로 넣으려면:  npm run backfill-calibrations -- --apply");
      return;
    }

    console.log("\n넣는 중...");
    let created = 0;
    let reused = 0;
    let linked = 0;

    // 같은 계측기·같은 달이면 교정 한 건으로 묶는다.
    const calibrationIdByKey = new Map<string, string>();

    for (const [key, event] of months) {
      const month = event.on.slice(0, 7);

      const existing = await db
        .select({ id: webMeterCalibrations.id })
        .from(webMeterCalibrations)
        .where(
          and(
            eq(webMeterCalibrations.meterId, event.meterId),
            eq(webMeterCalibrations.isDeleted, false),
            sql`to_char(${webMeterCalibrations.calibratedOn}, 'YYYY-MM') = ${month}`,
          ),
        )
        .limit(1);

      if (existing[0]) {
        calibrationIdByKey.set(key, existing[0].id);
        reused += 1;
        continue;
      }

      const [row] = await db
        .insert(webMeterCalibrations)
        .values({
          meterId: event.meterId,
          calibratedOn: event.on,
          nextDueYm: addMonths(month, 12),
          agency: "BCS",
          result: "PASS",
          note: "성적서에서 자동 생성",
        })
        .returning({ id: webMeterCalibrations.id });

      calibrationIdByKey.set(key, row.id);
      created += 1;
    }

    for (const row of readable) {
      const info = readCertificateInfo(row.originalName);
      const key = `${row.meterId}|${info.calibratedOn!.slice(0, 7)}`;
      const calibrationId = calibrationIdByKey.get(key);
      if (!calibrationId) continue;

      await db
        .update(webMeterCertificates)
        .set({ calibrationId, updatedAt: new Date() })
        .where(eq(webMeterCertificates.id, row.certId));
      linked += 1;

      // 성적서 번호가 비어 있으면 파일명에서 읽은 값을 채운다.
      if (info.certificateNo) {
        await db
          .update(webMeterCalibrations)
          .set({ certificateNo: info.certificateNo })
          .where(
            and(
              eq(webMeterCalibrations.id, calibrationId),
              isNull(webMeterCalibrations.certificateNo),
            ),
          );
      }
    }

    console.log(`  교정 이력 새로 만듦 ${created}건 · 기존 이력에 붙임 ${reused}건`);
    console.log(`  성적서 연결 ${linked}건`);

    const [admin] = await db
      .select()
      .from(webUsers)
      .where(eq(webUsers.role, "ADMIN"))
      .limit(1);

    await db.insert(webAuditLogs).values({
      actorUserId: admin?.id ?? null,
      actorName: admin?.displayName ?? "(스크립트)",
      action: "DATA_FIX",
      entityType: "web_meter_calibrations",
      summary: `성적서만 붙어 있던 것들을 교정 이력에 연결: 이력 ${created}건 생성, 성적서 ${linked}건 연결`,
      changes: { created, reused, linked, skipped: unreadable.length },
    });

    console.log("\n완료.");
  } finally {
    await sql_.end();
  }
}

main().catch((error: Error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
