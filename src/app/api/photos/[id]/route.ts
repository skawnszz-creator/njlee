/**
 * 계측기 사진 내려주기.
 *
 * 업로드 파일을 정적 폴더로 노출하지 않는다. 주소만 알면 누구나 받아갈 수 있기
 * 때문이다. 반드시 이 경로를 거쳐 세션을 확인한 뒤에 내려준다.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { and, eq } from "drizzle-orm";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webMeterPhotos } from "@/lib/db/schema";
import { absoluteFilePath } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const rows = await db
    .select()
    .from(webMeterPhotos)
    .where(and(eq(webMeterPhotos.id, id), eq(webMeterPhotos.isDeleted, false)))
    .limit(1);

  const photo = rows[0];
  if (!photo) {
    return new Response("Not Found", { status: 404 });
  }

  let absolute: string;
  try {
    absolute = absoluteFilePath(photo.filePath);
    await stat(absolute);
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  const stream = Readable.toWeb(
    createReadStream(absolute),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.sizeBytes),
      // 브라우저가 내용을 보고 타입을 바꿔 해석하지 못하게 한다.
      "X-Content-Type-Options": "nosniff",
      // 한글 파일명을 위해 filename* 형식을 쓴다.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        photo.originalName,
      )}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
