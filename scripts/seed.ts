/**
 * 엑셀에서 뽑아 둔 seed-data 를 DB 로 옮긴다.
 *
 *   npm run seed             처음 한 번
 *   npm run seed -- --reset  기존 계측기 데이터를 지우고 다시 넣는다 (승인 후에만)
 *
 * 원본 엑셀과 NAS 폴더는 읽지 않는다 — 이미 seed-data 로 추출해 두었다.
 * PowerShell 이 아니라 TypeScript 로 작성한다 (NAS 리눅스 컨테이너에서도 돌아야 함).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  webAuditLogs,
  webMeterPhotos,
  webMeters,
  webUsers,
  type AssetOwner,
  type MeterStatus,
  type PhotoKind,
} from "../src/lib/db/schema";

process.loadEnvFile(".env.local");

const DATABASE_URL = process.env.DATABASE_URL;
const FILE_STORAGE_ROOT = process.env.FILE_STORAGE_ROOT;

if (!DATABASE_URL) throw new Error("환경변수 DATABASE_URL 이 없습니다.");
if (!FILE_STORAGE_ROOT) throw new Error("환경변수 FILE_STORAGE_ROOT 이 없습니다.");

/** 임시 로그인용 관리자 계정. dss-auth 연결 후 실제 sub 로 바꾼다. */
const ADMIN_AUTH_SUB = "00000000-0000-4000-8000-000000000001";
const ADMIN_NAME = "이남준";
const ADMIN_EMAIL = "njlee@dss21.com";

const SEED_DIR = path.join(process.cwd(), "scripts", "seed-data");

type SeedMeter = {
  assetNo: string;
  nameKo: string;
  nameJa: string | null;
  maker: string | null;
  model: string | null;
  assetOwner: AssetOwner;
  controlNo: string | null;
  calibrationDueYm: string | null;
  quantity: number;
  serialNo: string | null;
  status: MeterStatus;
  note: string | null;
  sortOrder: number;
};

type SeedPhoto = {
  assetNo: string;
  kind: PhotoKind;
  file: string;
  sortOrder: number;
};

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(SEED_DIR, name), "utf8")) as T;
}

async function main() {
  const reset = process.argv.includes("--reset");

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    const existing = await db.select({ id: webMeters.id }).from(webMeters);
    if (existing.length > 0 && !reset) {
      console.log(
        `이미 계측기 ${existing.length}건이 들어 있습니다. 다시 넣으려면 --reset 을 붙이세요.`,
      );
      return;
    }
    if (existing.length > 0 && reset) {
      console.log(`--reset : 기존 계측기 ${existing.length}건과 사진 기록을 지웁니다.`);
      await db.delete(webMeterPhotos);
      await db.delete(webMeters);
    }

    /* -------------------------------------------------- 관리자 계정 */
    let [admin] = await db
      .select()
      .from(webUsers)
      .where(eq(webUsers.authSub, ADMIN_AUTH_SUB));

    if (!admin) {
      [admin] = await db
        .insert(webUsers)
        .values({
          authSub: ADMIN_AUTH_SUB,
          displayName: ADMIN_NAME,
          email: ADMIN_EMAIL,
          role: "ADMIN",
        })
        .returning();
      console.log(`관리자 계정 생성: ${ADMIN_NAME} (${ADMIN_EMAIL})`);
    } else {
      console.log(`관리자 계정 확인: ${admin.displayName}`);
    }

    /* -------------------------------------------------- 계측기 */
    const seedMeters = await readJson<SeedMeter[]>("meters.json");
    const inserted = await db.insert(webMeters).values(seedMeters).returning({
      id: webMeters.id,
      assetNo: webMeters.assetNo,
    });
    const idByAsset = new Map(inserted.map((m) => [m.assetNo, m.id]));
    console.log(`계측기 ${inserted.length}건 등록`);

    /* -------------------------------------------------- 사진 */
    const seedPhotos = await readJson<SeedPhoto[]>("photo-map.json");
    let photoCount = 0;
    let skipped = 0;

    for (const p of seedPhotos) {
      const meterId = idByAsset.get(p.assetNo);
      if (!meterId) {
        skipped += 1;
        continue;
      }

      const source = path.join(SEED_DIR, "photos", p.file);
      const ext = path.extname(p.file).toLowerCase();
      const photoId = randomUUID().toLowerCase();

      // DB 에는 상대경로만. 구분자는 항상 '/', 전부 소문자.
      const relPath = `meters/${meterId.toLowerCase()}/${photoId}${ext}`;
      // 실제 파일시스템에 닿을 때만 path.join 을 쓴다.
      const target = path.join(FILE_STORAGE_ROOT!, ...relPath.split("/"));

      // 파일이 먼저, DB 기록이 나중. 반대로 하면 DB 에는 있는데 디스크에 없는
      // 파일이 생긴다. 이 순서면 최악의 경우 DB 에 없는 파일만 남는다.
      await mkdir(path.dirname(target), { recursive: true });
      await pipeline(createReadStream(source), createWriteStream(target));

      const info = await stat(target);
      await db.insert(webMeterPhotos).values({
        id: photoId,
        meterId,
        kind: p.kind,
        filePath: relPath,
        originalName: p.file,
        mimeType: MIME[ext] ?? "application/octet-stream",
        sizeBytes: info.size,
        sortOrder: p.sortOrder,
      });
      photoCount += 1;
    }
    console.log(
      `사진 ${photoCount}건 등록${skipped ? ` (목록에 없는 자산번호 ${skipped}건 건너뜀)` : ""}`,
    );

    /* -------------------------------------------------- 감사 로그 */
    await db.insert(webAuditLogs).values({
      actorUserId: admin.id,
      actorName: ADMIN_NAME,
      action: "DATA_IMPORT",
      entityType: "web_meters",
      summary: `엑셀 이관: 계측기 ${inserted.length}건, 사진 ${photoCount}건`,
      changes: { source: "DSS_計測器校正品 2026.06(version 1).xlsx" },
    });

    console.log("\n이관 완료.");
    console.log(`  저장 루트 : ${FILE_STORAGE_ROOT}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
