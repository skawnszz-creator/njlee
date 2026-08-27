/**
 * 계측기 관리 시스템 백업.
 *
 *   npm run backup
 *
 * 두 가지를 함께 백업한다. 하나만 있으면 복구가 안 되기 때문이다.
 *   1) 데이터베이스  — 계측기 정보·사용자·감사 로그   (pg_dump)
 *   2) 파일          — 계측기 사진, 나중에는 교정 성적서 PDF
 *
 * 파일은 날짜별로 통째로 복사하지 않고 한 폴더에 쌓아 올린다(미러).
 * 저장 파일 이름이 UUID 라 한 번 만들어진 파일은 절대 바뀌지 않으므로,
 * 새로 생긴 것만 복사하면 된다. NAS 용량도 아끼고 복구도 단순해진다.
 *
 * PowerShell 이 아니라 TypeScript 로 작성한다 — 나중에 NAS 리눅스 컨테이너에서도 돌아야 한다.
 */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

process.loadEnvFile(".env.local");

const DATABASE_URL = required("DATABASE_URL");
const FILE_STORAGE_ROOT = required("FILE_STORAGE_ROOT");
const BACKUP_ROOT = required("BACKUP_ROOT");
const PG_BIN = process.env.PG_BIN ?? "";
/** 남겨 둘 DB 백업 개수. 매일 돌리면 이 숫자가 곧 보관 일수다. */
const KEEP = Number(process.env.BACKUP_KEEP ?? 30) || 30;

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `환경변수 ${name} 이(가) 설정되지 않았습니다. .env.local 을 확인하세요.`,
    );
  }
  return value.trim();
}

/** 2026-08-27_1530 */
function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}`
  );
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (error) =>
      reject(
        new Error(
          `${path.basename(command)} 을(를) 실행하지 못했습니다: ${error.message}\n` +
            `PG_BIN 환경변수에 PostgreSQL bin 폴더 경로를 넣어 보세요.`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} 실패 (코드 ${code})\n${stderr.trim()}`));
    });
  });
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 1. 데이터베이스                                                      */
/* ------------------------------------------------------------------ */

async function backupDatabase(dbDir: string, at: string) {
  const url = new URL(DATABASE_URL);
  const outFile = path.join(dbDir, `dss_meters_${at}.dump`);

  // PG_BIN 이 비어 있으면 PATH 에서 찾는다 (NAS 컨테이너에서는 그쪽이 맞다).
  const pgDump = path.join(
    PG_BIN,
    process.platform === "win32" ? "pg_dump.exe" : "pg_dump",
  );

  await run(
    pgDump,
    [
      "-h", url.hostname,
      "-p", url.port || "5432",
      "-U", decodeURIComponent(url.username),
      "-d", url.pathname.replace(/^\//, ""),
      "-Fc", // 압축된 사용자 정의 형식. pg_restore 로 되돌린다.
      "-f", outFile,
    ],
    // 비밀번호는 명령줄이 아니라 환경변수로 넘긴다.
    // 명령줄에 넣으면 작업 관리자의 프로세스 목록에 그대로 보인다.
    { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  );

  const info = await stat(outFile);
  if (info.size === 0) throw new Error("DB 백업 파일이 비어 있습니다.");
  return { file: outFile, size: info.size };
}

/* ------------------------------------------------------------------ */
/* 2. 파일 (사진 · 앞으로는 성적서 PDF)                                  */
/* ------------------------------------------------------------------ */

async function mirrorFiles(sourceRoot: string, targetRoot: string) {
  let copied = 0;
  let skipped = 0;
  let bytes = 0;

  async function walk(relative: string) {
    const from = path.join(sourceRoot, relative);
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(next);
        continue;
      }
      if (!entry.isFile()) continue;

      const src = path.join(sourceRoot, ...next.split("/"));
      const dst = path.join(targetRoot, ...next.split("/"));
      const srcInfo = await stat(src);

      // 이름이 UUID 라 한 번 만들어진 파일은 바뀌지 않는다.
      // 크기까지 같으면 이미 백업된 것으로 본다.
      if (await exists(dst)) {
        const dstInfo = await stat(dst);
        if (dstInfo.size === srcInfo.size) {
          skipped += 1;
          continue;
        }
      }

      await mkdir(path.dirname(dst), { recursive: true });
      await copyFile(src, dst);
      copied += 1;
      bytes += srcInfo.size;
    }
  }

  if (!(await exists(sourceRoot))) {
    return { copied: 0, skipped: 0, bytes: 0, missing: true };
  }

  await walk("");
  return { copied, skipped, bytes, missing: false };
}

/* ------------------------------------------------------------------ */
/* 3. 오래된 DB 백업 정리                                               */
/* ------------------------------------------------------------------ */

async function pruneOldDumps(dbDir: string) {
  const dumps = (await readdir(dbDir))
    .filter((name) => name.startsWith("dss_meters_") && name.endsWith(".dump"))
    .sort() // 파일명이 날짜순이라 이름 정렬 = 시간 정렬
    .reverse();

  const stale = dumps.slice(KEEP);
  for (const name of stale) {
    await rm(path.join(dbDir, name), { force: true });
  }
  return { kept: Math.min(dumps.length, KEEP), removed: stale };
}

/* ------------------------------------------------------------------ */

async function main() {
  const startedAt = new Date();
  const at = stamp(startedAt);

  console.log("계측기 관리 시스템 백업");
  console.log(`  받는 곳 : ${BACKUP_ROOT}`);

  // NAS 가 꺼져 있거나 네트워크 드라이브가 끊겼을 때 원인을 바로 알 수 있게 한다.
  try {
    await mkdir(BACKUP_ROOT, { recursive: true });
  } catch (error) {
    throw new Error(
      `백업 폴더를 만들지 못했습니다: ${BACKUP_ROOT}\n` +
        `NAS 가 켜져 있는지, 폴더 주소가 맞는지 확인하세요.\n` +
        `원인: ${(error as Error).message}`,
    );
  }

  const dbDir = path.join(BACKUP_ROOT, "db");
  const filesDir = path.join(BACKUP_ROOT, "files");
  await mkdir(dbDir, { recursive: true });
  await mkdir(filesDir, { recursive: true });

  console.log("\n[1/3] 데이터베이스");
  const db = await backupDatabase(dbDir, at);
  console.log(`  ${path.basename(db.file)}  (${human(db.size)})`);

  console.log("\n[2/3] 파일");
  const files = await mirrorFiles(FILE_STORAGE_ROOT, filesDir);
  if (files.missing) {
    console.log(`  저장 폴더가 없습니다: ${FILE_STORAGE_ROOT}`);
  } else {
    console.log(
      `  새로 복사 ${files.copied}개 (${human(files.bytes)}) · 이미 있던 것 ${files.skipped}개`,
    );
  }

  console.log("\n[3/3] 오래된 백업 정리");
  const pruned = await pruneOldDumps(dbDir);
  console.log(`  보관 ${pruned.kept}개 · 삭제 ${pruned.removed.length}개`);
  for (const name of pruned.removed) console.log(`    - ${name}`);

  const manifest = {
    backedUpAt: startedAt.toISOString(),
    database: { file: path.basename(db.file), sizeBytes: db.size },
    files: {
      copied: files.copied,
      alreadyPresent: files.skipped,
      sourceRoot: FILE_STORAGE_ROOT,
    },
    keepCount: KEEP,
  };
  await writeFile(
    path.join(BACKUP_ROOT, "latest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n완료 (${seconds}초)`);
  console.log("\n복구 방법은 docs/BACKUP.md 를 보세요.");
}

main().catch((error: Error) => {
  console.error(`\n백업 실패\n${error.message}`);
  process.exit(1);
});
