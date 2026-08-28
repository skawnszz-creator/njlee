/**
 * 계측기 사진 올리기.
 *
 *   PUT /api/meters/<계측기id>/photos?name=<원본파일명>&kind=BODY|ACCESSORY
 *   본문: 파일 그 자체
 *
 * 성적서 업로드와 같은 방식이다. request.formData() 를 쓰지 않는다 —
 * 그건 파일 전체를 메모리에 올린다. 앞부분 16바이트만 확인하고
 * 나머지는 디스크로 흘려보낸다. 다만 사진이므로 PDF 는 받지 않는다.
 */
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { and, eq, max } from "drizzle-orm";

import { writeAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  PHOTO_KINDS,
  webMeterPhotos,
  webMeters,
  type PhotoKind,
} from "@/lib/db/schema";
import { absoluteFilePath, meterPhotoRelPath } from "@/lib/storage";
import {
  MAGIC_PROBE_BYTES,
  MAX_UPLOAD_BYTES,
  detectType,
  extensionMatches,
  sanitizeFileName,
} from "@/lib/upload";

class TooLarge extends Error {}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return json(401, "로그인이 필요합니다.");
  // 버튼을 숨기는 것과 별개로 여기서 다시 막는다.
  if (!isAdmin(user)) return json(403, "권한이 없습니다.");

  const { id: meterId } = await params;
  const query = new URL(request.url).searchParams;

  const kind = (query.get("kind") ?? "BODY") as PhotoKind;
  if (!(PHOTO_KINDS as readonly string[]).includes(kind)) {
    return json(400, "사진 종류가 올바르지 않습니다.");
  }

  const meter = (
    await db
      .select()
      .from(webMeters)
      .where(and(eq(webMeters.id, meterId), eq(webMeters.isDeleted, false)))
      .limit(1)
  )[0];
  if (!meter) return json(404, "계측기를 찾을 수 없습니다.");

  if (!request.body) return json(400, "파일이 비어 있습니다.");

  const originalName = sanitizeFileName(query.get("name") ?? "");

  /* ---------------------------------------------------- 앞부분만 먼저 확인 */
  const source = Readable.fromWeb(request.body as WebReadableStream);
  const iterator = source[Symbol.asyncIterator]();
  const headChunks: Buffer[] = [];
  let headLength = 0;

  while (headLength < MAGIC_PROBE_BYTES) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    headChunks.push(chunk);
    headLength += chunk.length;
  }

  const head = Buffer.concat(headChunks);
  const detected = detectType(head);

  // 사진 칸이다. PDF 는 성적서로 올려야 한다.
  if (!detected || detected.ext === ".pdf") {
    source.destroy();
    return json(
      400,
      "JPG · PNG 사진만 올릴 수 있습니다. (내용을 직접 확인했습니다)",
    );
  }
  if (!extensionMatches(originalName, detected)) {
    source.destroy();
    return json(
      400,
      `파일 내용은 ${detected.ext} 인데 파일명은 다릅니다. 확인해 주세요.`,
    );
  }

  /* ---------------------------------------------------- 파일 먼저, DB 나중 */
  const photoId = randomUUID().toLowerCase();
  const relPath = meterPhotoRelPath(meter.id, photoId, detected.ext);
  const target = absoluteFilePath(relPath);

  try {
    await mkdir(path.dirname(target), { recursive: true });

    let total = head.length;
    await pipeline(
      (async function* () {
        yield head;
        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          const chunk = Buffer.from(next.value);
          total += chunk.length;
          if (total > MAX_UPLOAD_BYTES) throw new TooLarge();
          yield chunk;
        }
      })(),
      createWriteStream(target),
    );

    const info = await stat(target);

    // 같은 칸의 맨 뒤에 붙인다. 지워진 것도 세어야 번호가 겹치지 않는다.
    const lastOrder = (
      await db
        .select({ value: max(webMeterPhotos.sortOrder) })
        .from(webMeterPhotos)
        .where(
          and(eq(webMeterPhotos.meterId, meter.id), eq(webMeterPhotos.kind, kind)),
        )
    )[0]?.value;

    const [created] = await db
      .insert(webMeterPhotos)
      .values({
        id: photoId,
        meterId: meter.id,
        kind,
        filePath: relPath,
        originalName,
        mimeType: detected.mime,
        sizeBytes: info.size,
        sortOrder: (lastOrder ?? 0) + 1,
      })
      .returning();

    await writeAudit({
      actor: user,
      action: "PHOTO_UPLOAD",
      entityType: "web_meter_photos",
      entityId: created.id,
      summary: `사진 등록: ${meter.assetNo} ${originalName}`,
      changes: { kind, sizeBytes: info.size, mimeType: detected.mime },
    });

    return Response.json(
      { id: created.id, originalName, sizeBytes: info.size },
      { status: 201 },
    );
  } catch (error) {
    // 반쯤 쓰다 만 파일은 치운다.
    await rm(target, { force: true }).catch(() => {});
    if (error instanceof TooLarge) {
      return json(
        413,
        `파일이 너무 큽니다. ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 까지 올릴 수 있습니다.`,
      );
    }
    console.error("사진 업로드 실패", error);
    return json(500, "파일을 저장하지 못했습니다.");
  }
}

function json(status: number, message: string) {
  return Response.json({ message }, { status });
}
