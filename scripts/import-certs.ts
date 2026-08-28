/**
 * NAS 의 교정 성적서를 시스템으로 옮긴다.
 *
 *   npm run import-certs            보기만 한다 (아무것도 바꾸지 않음)
 *   npm run import-certs -- --apply  실제로 넣는다
 *   npm run import-certs -- --apply --reset   이전 이관분을 지우고 다시 넣는다
 *
 * 원본 폴더는 읽기만 한다. 복사만 하고 손대지 않는다.
 *
 * 교정 기관은 BCS 한 곳이다. 파일명의 BNB014 · BCC260626 은 업체명이 아니라
 * BCS 가 파일마다 매기는 고유번호다.
 *
 * 계측기를 찾는 순서
 *   1) 파일명에 S/N 이 들어 있으면 그것으로 (예: "... (289) (42050017).pdf")
 *   2) 없으면 BNB 번호로. 이 번호는 계측기마다 고정이라 표를 만들 수 있다.
 *   3) 둘 다 없으면 "미등록 성적서"로 넣는다. 버리지 않는다.
 *
 * 주의: 2026년 6월부터 BCS 가 파일명 양식을 바꿨다. 계측기명도 S/N 도 없어서
 * 자동으로 붙일 수 없다. 앞으로는 계측기 상세 화면에서 직접 올리는 것이 맞다.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  webAuditLogs,
  webMeterCalibrations,
  webMeterCertificates,
  webMeters,
  webUsers,
} from "../src/lib/db/schema";

process.loadEnvFile(".env.local");

const DATABASE_URL = required("DATABASE_URL");
const FILE_STORAGE_ROOT = required("FILE_STORAGE_ROOT");
const CERT_SOURCE_ROOT = required("CERT_SOURCE_ROOT");

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다.`);
  }
  return value.trim();
}

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

/* ------------------------------------------------------------------ */
/* 파일명 읽기                                                          */
/* ------------------------------------------------------------------ */

function normalize(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
}

/** 앞의 0 을 뗀다. 엑셀에는 042050017, 성적서에는 42050017 로 적혀 있다. */
function stripLeadingZeros(value: string): string {
  return value.replace(/^0+/, "") || value;
}

const BNB = /BNB(\d{3})/i;
const DATE_IN_NAME = [/[-_](\d{6})(?:[A-Za-z]|\.)/, /(\d{6})[A-Za-z]\d{2}/];
const YEAR_IN_PATH = /성적서\((\d{4})\)/;
const MONTH_IN_PATH = /[\\/](\d{1,2})월/;
const CERT_NO = /BNB\d{3}-\d{6}[A-Za-z]\d{2}-\d{3}/i;

/** 성적서에서 교정 날짜를 뽑는다. 파일명이 우선, 없으면 폴더 이름. */
function readDate(fullPath: string): { on: string; exact: boolean } | null {
  const name = path.basename(fullPath);

  for (const pattern of DATE_IN_NAME) {
    const match = pattern.exec(name);
    if (!match) continue;
    const raw = match[1];
    const [yy, mm, dd] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
    const month = Number(mm);
    const day = Number(dd);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { on: `20${yy}-${mm}-${dd}`, exact: true };
    }
  }

  const year = YEAR_IN_PATH.exec(fullPath);
  if (!year) return null;
  const month = MONTH_IN_PATH.exec(fullPath);
  const mm = month ? String(Number(month[1])).padStart(2, "0") : "01";
  // 날짜를 모르면 그 달 1일로 둔다. 화면에서 "정확하지 않음"으로 보이게 한다.
  return { on: `${year[1]}-${mm}-01`, exact: false };
}

function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

async function walk(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) found.push(full);
    }
  }
  await visit(root);
  return found;
}

/** 진짜 PDF 인지 앞부분을 읽어 확인한다. 확장자를 믿지 않는다. */
async function isPdf(file: string): Promise<boolean> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    return buffer.toString("latin1") === "%PDF-";
  } finally {
    await handle.close();
  }
}

/* ------------------------------------------------------------------ */

type Meter = {
  id: string;
  assetNo: string;
  model: string | null;
  serialNo: string | null;
  calibrationDueYm: string | null;
  sn: string;
};

type Match = {
  file: string;
  meter: Meter | null;
  how: "SERIAL" | "AGENCY" | "NONE";
  agencyNo: string | null;
  on: string | null;
  exact: boolean;
  certNo: string | null;
};

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    const rows = await db
      .select({
        id: webMeters.id,
        assetNo: webMeters.assetNo,
        model: webMeters.model,
        serialNo: webMeters.serialNo,
        calibrationDueYm: webMeters.calibrationDueYm,
      })
      .from(webMeters)
      .where(eq(webMeters.isDeleted, false));

    const meters: Meter[] = rows.map((r) => ({
      ...r,
      sn: stripLeadingZeros(normalize(r.serialNo ?? "")),
    }));

    console.log(`계측기 ${meters.length}대`);
    console.log(`성적서 폴더: ${CERT_SOURCE_ROOT}`);

    const files = await walk(CERT_SOURCE_ROOT);
    console.log(`성적서 PDF ${files.length}건\n`);

    /* ---------------------------------------------- 1단계: S/N 으로 찾기 */
    const bySerial = new Map<string, Meter>();
    const agencyVotes = new Map<string, Map<string, number>>();

    for (const file of files) {
      const name = normalize(path.basename(file));
      const hits = meters.filter((m) => m.sn.length >= 5 && name.includes(m.sn));
      if (hits.length !== 1) continue;

      bySerial.set(file, hits[0]);

      const code = BNB.exec(path.basename(file));
      if (!code) continue;
      const key = `BNB${code[1]}`;
      if (!agencyVotes.has(key)) agencyVotes.set(key, new Map());
      const votes = agencyVotes.get(key)!;
      votes.set(hits[0].id, (votes.get(hits[0].id) ?? 0) + 1);
    }

    /* ------------------------------------- 2단계: 교정업체 번호 표 만들기 */
    const agencyTable = new Map<string, Meter>();
    const conflicts: string[] = [];

    for (const [code, votes] of agencyVotes) {
      if (votes.size > 1) {
        conflicts.push(code);
        continue;
      }
      const meterId = [...votes.keys()][0];
      const meter = meters.find((m) => m.id === meterId);
      if (meter) agencyTable.set(code, meter);
    }

    console.log(`교정업체 관리번호 표 ${agencyTable.size}개 (충돌 ${conflicts.length}개)`);

    /* ------------------------------------------- 3단계: 전체 짝짓기 */
    const matches: Match[] = [];
    for (const file of files) {
      const date = readDate(file);
      const codeMatch = BNB.exec(path.basename(file));
      const code = codeMatch ? `BNB${codeMatch[1]}` : null;
      const certNo = CERT_NO.exec(path.basename(file))?.[0] ?? null;

      const bySn = bySerial.get(file);
      const byAgency = !bySn && code ? agencyTable.get(code) : undefined;

      matches.push({
        file,
        meter: bySn ?? byAgency ?? null,
        how: bySn ? "SERIAL" : byAgency ? "AGENCY" : "NONE",
        agencyNo: code,
        on: date?.on ?? null,
        exact: date?.exact ?? false,
        certNo,
      });
    }

    const linked = matches.filter((m) => m.meter);
    const orphans = matches.filter((m) => !m.meter);
    const coveredMeters = new Set(linked.map((m) => m.meter!.id));

    /* --------------------------------------- 4단계: 교정 이력으로 묶기 */
    // 같은 계측기가 같은 달에 여러 성적서를 받았으면 교정 한 건으로 본다.
    const events = new Map<
      string,
      { meter: Meter; on: string; certNo: string | null; files: Match[] }
    >();

    for (const m of linked) {
      if (!m.on) continue;
      const key = `${m.meter!.id}|${m.on.slice(0, 7)}`;
      const existing = events.get(key);
      if (existing) {
        existing.files.push(m);
        // 정확한 날짜를 아는 쪽을 택한다.
        if (m.exact && existing.on.endsWith("-01")) existing.on = m.on;
        if (!existing.certNo) existing.certNo = m.certNo;
      } else {
        events.set(key, {
          meter: m.meter!,
          on: m.on,
          certNo: m.certNo,
          files: [m],
        });
      }
    }

    /* --------------------------------------------------------- 보고 */
    console.log("");
    console.log("─".repeat(60));
    console.log(`성적서 총             ${files.length}건`);
    console.log(`  S/N 으로 연결       ${matches.filter((m) => m.how === "SERIAL").length}건`);
    console.log(`  업체번호로 연결     ${matches.filter((m) => m.how === "AGENCY").length}건`);
    console.log(`  미등록              ${orphans.length}건`);
    console.log(`연결되는 계측기       ${coveredMeters.size} / ${meters.length}대`);
    console.log(`만들어질 교정 이력    ${events.size}건`);

    const byYear = new Map<string, number>();
    for (const e of events.values()) {
      const y = e.on.slice(0, 4);
      byYear.set(y, (byYear.get(y) ?? 0) + 1);
    }
    console.log(
      `  연도별: ${[...byYear.entries()].sort().map(([y, n]) => `${y}:${n}`).join("  ")}`,
    );

    // 엑셀에 적힌 기한과 성적서에서 계산한 기한이 다른 계측기
    const mismatches: string[] = [];
    const latest = new Map<string, string>();
    for (const e of events.values()) {
      const current = latest.get(e.meter.id);
      if (!current || e.on > current) latest.set(e.meter.id, e.on);
    }
    for (const [meterId, on] of latest) {
      const meter = meters.find((m) => m.id === meterId)!;
      const computed = addMonths(on.slice(0, 7), 12);
      if (meter.calibrationDueYm && meter.calibrationDueYm !== computed) {
        mismatches.push(
          `  ${meter.assetNo}  엑셀 ${meter.calibrationDueYm}  ↔  최근교정 ${on} + 1년 = ${computed}`,
        );
      }
    }
    if (mismatches.length) {
      console.log(`\n기한이 다른 계측기 ${mismatches.length}대 (계측기 기한은 그대로 둡니다)`);
      for (const line of mismatches.slice(0, 12)) console.log(line);
      if (mismatches.length > 12) console.log(`  ... 외 ${mismatches.length - 12}대`);
    }

    console.log(`\n미등록 성적서 ${orphans.length}건 (예시)`);
    for (const o of orphans.slice(0, 8)) console.log(`  ${path.basename(o.file)}`);
    if (orphans.length > 8) console.log(`  ... 외 ${orphans.length - 8}건`);

    let bytes = 0;
    for (const m of matches) bytes += (await stat(m.file)).size;
    console.log(`\n복사할 용량 ${(bytes / 1024 / 1024).toFixed(0)}MB`);
    console.log("─".repeat(60));

    if (!APPLY) {
      console.log("\n보기만 했습니다. 아무것도 바꾸지 않았습니다.");
      console.log("실제로 넣으려면:  npm run import-certs -- --apply");
      return;
    }

    /* --------------------------------------------------------- 반영 */
    const existing = await db
      .select({ id: webMeterCertificates.id })
      .from(webMeterCertificates)
      .where(eq(webMeterCertificates.source, "IMPORT"));

    if (existing.length > 0 && !RESET) {
      console.log(
        `\n이미 이관된 성적서가 ${existing.length}건 있습니다. 다시 넣으려면 --reset 을 붙이세요.`,
      );
      return;
    }
    if (existing.length > 0 && RESET) {
      console.log(`\n--reset : 이전 이관분 ${existing.length}건을 지웁니다.`);
      await db
        .delete(webMeterCertificates)
        .where(eq(webMeterCertificates.source, "IMPORT"));
      // 이관으로 만든 교정 이력도 함께 지운다.
      await db
        .delete(webMeterCalibrations)
        .where(eq(webMeterCalibrations.agency, "BCS"));
    }

    const [admin] = await db
      .select()
      .from(webUsers)
      .where(eq(webUsers.role, "ADMIN"))
      .limit(1);

    console.log("\n넣는 중...");

    // 교정 이력 먼저
    const calibrationIdByKey = new Map<string, string>();
    for (const [key, event] of events) {
      const [created] = await db
        .insert(webMeterCalibrations)
        .values({
          meterId: event.meter.id,
          calibratedOn: event.on,
          nextDueYm: addMonths(event.on.slice(0, 7), 12),
          agency: "BCS", // 교정 기관. BNB/BCC 는 BCS 가 매기는 파일 고유번호다
          certificateNo: event.certNo,
          result: "PASS", // 성적서가 발행되면 합격으로 본다
          note: "NAS 성적서에서 옮김",
        })
        .returning({ id: webMeterCalibrations.id });
      calibrationIdByKey.set(key, created.id);
    }
    console.log(`  교정 이력 ${events.size}건`);

    // 성적서 파일
    let copied = 0;
    let skipped = 0;
    for (const m of matches) {
      if (!(await isPdf(m.file))) {
        skipped += 1;
        continue;
      }

      const certificateId = randomUUID().toLowerCase();
      const relPath = m.meter
        ? `meters/${m.meter.id.toLowerCase()}/certs/${certificateId}.pdf`
        : `certs-unassigned/${certificateId}.pdf`;
      const target = path.join(FILE_STORAGE_ROOT, ...relPath.split("/"));

      // 파일이 먼저, DB 기록이 나중.
      await mkdir(path.dirname(target), { recursive: true });
      await pipeline(createReadStream(m.file), createWriteStream(target));
      const info = await stat(target);

      const key = m.meter && m.on ? `${m.meter.id}|${m.on.slice(0, 7)}` : null;

      await db.insert(webMeterCertificates).values({
        id: certificateId,
        meterId: m.meter?.id ?? null,
        calibrationId: key ? (calibrationIdByKey.get(key) ?? null) : null,
        filePath: relPath,
        originalName: path.basename(m.file),
        mimeType: "application/pdf",
        sizeBytes: info.size,
        source: "IMPORT",
      });
      copied += 1;
    }
    console.log(`  성적서 ${copied}건 복사${skipped ? ` (PDF 가 아니라 건너뜀 ${skipped}건)` : ""}`);

    // 계측기에 교정업체 관리번호 채우기
    let agencyFilled = 0;
    for (const [code, meter] of agencyTable) {
      await db
        .update(webMeters)
        .set({ agencyNo: code, updatedAt: new Date() })
        .where(and(eq(webMeters.id, meter.id), eq(webMeters.isDeleted, false)));
      agencyFilled += 1;
    }
    console.log(`  교정업체 관리번호 ${agencyFilled}대`);

    await db.insert(webAuditLogs).values({
      actorUserId: admin?.id ?? null,
      actorName: admin?.displayName ?? "(이관 스크립트)",
      action: "DATA_IMPORT",
      entityType: "web_meter_certificates",
      summary: `NAS 성적서 이관: 파일 ${copied}건, 교정 이력 ${events.size}건, 미등록 ${orphans.length}건`,
      changes: {
        source: CERT_SOURCE_ROOT,
        bySerial: matches.filter((m) => m.how === "SERIAL").length,
        byAgency: matches.filter((m) => m.how === "AGENCY").length,
      },
    });

    console.log("\n완료. 미등록 성적서는 화면의 '미등록 성적서'에서 붙일 수 있습니다.");
  } finally {
    await sql.end();
  }
}

main().catch((error: Error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
