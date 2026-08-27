/**
 * 올라온 파일 검사.
 *
 * 확장자를 믿지 않는다. 브라우저가 보낸 MIME 타입도 믿지 않는다.
 * 파일 앞부분(매직 넘버)을 직접 읽어서 무엇인지 판단한다.
 */

/** 한 건당 최대 크기. 교정 성적서는 보통 1MB 정도다. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 매직 넘버를 읽기 위해 앞에서 확보해야 하는 바이트 수 */
export const MAGIC_PROBE_BYTES = 16;

export type DetectedType = {
  ext: ".pdf" | ".jpg" | ".png";
  mime: string;
};

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

/**
 * 실행 파일이면 어떤 확장자로 위장해도 거부한다.
 *   MZ  — Windows 실행 파일 (.exe, .dll)
 *   ELF — Linux 실행 파일
 */
export function looksExecutable(head: Buffer): boolean {
  return (
    startsWith(head, [0x4d, 0x5a]) || // "MZ"
    startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) // 0x7F "ELF"
  );
}

/**
 * 파일 앞부분을 보고 종류를 판단한다.
 * 허용 목록에 없으면 null 을 돌려준다 (= 거부).
 */
export function detectType(head: Buffer): DetectedType | null {
  if (looksExecutable(head)) return null;

  // %PDF-
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { ext: ".pdf", mime: "application/pdf" };
  }
  // JPEG
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  // PNG
  if (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return { ext: ".png", mime: "image/png" };
  }

  return null;
}

/** 확장자와 실제 내용이 맞는지. 다르면 실제 내용을 따른다. */
export function extensionMatches(
  originalName: string,
  detected: DetectedType,
): boolean {
  const lower = originalName.toLowerCase();
  if (detected.ext === ".jpg") {
    return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
  }
  return lower.endsWith(detected.ext);
}

/**
 * 원본 파일명을 안전하게 다듬는다.
 * 디스크에는 UUID 로 저장하므로 이 값은 DB 와 화면 표시에만 쓴다.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  return (
    base
      // 경로 조작·제어문자 제거
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 200) || "이름없음"
  );
}
