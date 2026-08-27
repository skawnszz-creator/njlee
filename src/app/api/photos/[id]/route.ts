/**
 * 계측기 사진 내려주기.
 *
 * 업로드 파일을 정적 폴더로 노출하지 않는다. 주소만 알면 누구나 받아갈 수 있기
 * 때문이다. 반드시 이 경로를 거쳐 세션을 확인한 뒤에 내려준다.
 */
import { and, eq } from "drizzle-orm";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webMeterPhotos } from "@/lib/db/schema";
import { serveFile } from "@/lib/http-file";
import { absoluteFilePath } from "@/lib/storage";

export async function GET(
  request: Request,
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

  try {
    return await serveFile({
      request,
      absolutePath: absoluteFilePath(photo.filePath),
      mimeType: photo.mimeType,
      fileName: photo.originalName,
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
