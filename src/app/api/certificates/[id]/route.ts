/**
 * 교정 성적서 내려주기.
 *
 * 사진과 같은 원칙이다 — 정적 폴더로 노출하지 않고 여기를 거쳐 세션을 확인한다.
 * 열람은 전 직원이 할 수 있다.
 */
import { and, eq } from "drizzle-orm";

import { writeAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webMeterCertificates, webMeters } from "@/lib/db/schema";
import { serveFile } from "@/lib/http-file";
import { absoluteFilePath } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const rows = await db
    .select({ cert: webMeterCertificates, assetNo: webMeters.assetNo })
    .from(webMeterCertificates)
    .leftJoin(webMeters, eq(webMeters.id, webMeterCertificates.meterId))
    .where(
      and(
        eq(webMeterCertificates.id, id),
        eq(webMeterCertificates.isDeleted, false),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return new Response("Not Found", { status: 404 });

  const url = new URL(request.url);

  try {
    const response = await serveFile({
      request,
      absolutePath: absoluteFilePath(row.cert.filePath),
      mimeType: row.cert.mimeType,
      fileName: row.cert.originalName,
      download: url.searchParams.get("download") === "1",
    });

    // 성적서를 누가 언제 열어봤는지 남긴다.
    // PDF 뷰어는 한 파일을 Range 로 여러 번 나눠 받으므로, 이어받기 요청은 세지 않는다.
    if (!request.headers.get("range") && request.method === "GET") {
      await writeAudit({
        actor: user,
        action: "CERT_DOWNLOAD",
        entityType: "web_meter_certificates",
        entityId: row.cert.id,
        summary: `성적서 열람: ${row.assetNo ?? "(계측기 미지정)"} ${row.cert.originalName}`,
      });
    }

    return response;
  } catch {
    // 파일이 없거나 읽을 수 없는 경우. 상세한 사유는 사용자에게 보여주지 않는다.
    return new Response("Not Found", { status: 404 });
  }
}
