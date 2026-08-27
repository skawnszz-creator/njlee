/**
 * 업로드 파일의 경로 계산.
 *
 * DB 에는 저장 루트 기준 상대경로만 넣는다. 구분자는 항상 '/', 전부 소문자.
 * Windows 에서 역슬래시가 섞이면 리눅스(NAS)는 그 전체를 폴더 하나의 이름으로
 * 읽어 파일을 영영 못 찾는다.
 *
 * 그래서 path.join 은 "실제 파일시스템에 닿는" 이 파일에서만 쓴다.
 */
import path from "node:path";

import { env } from "@/lib/env";

/** DB 에 저장할 상대경로를 만든다. */
export function meterPhotoRelPath(
  meterId: string,
  photoId: string,
  ext: string,
): string {
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `meters/${meterId.toLowerCase()}/${photoId.toLowerCase()}${safeExt.toLowerCase()}`;
}

/** 상대경로 → 실제 파일시스템 절대경로. */
export function absoluteFilePath(relPath: string): string {
  const segments = relPath.split("/").filter(Boolean);

  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    throw new Error("허용되지 않는 파일 경로입니다.");
  }

  return path.join(env.fileStorageRoot, ...segments);
}
