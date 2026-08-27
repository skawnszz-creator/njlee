/**
 * 교정 성적서 내려주기.
 *
 * 사진과 같은 원칙이다 — 정적 폴더로 노출하지 않고 여기를 거쳐 세션을 확인한다.
 * 열람은 전 직원이 할 수 있다.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { and, eq } from "drizzle-orm";

import { writeAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { webMeterCertificates, webMeters } from "@/lib/db/schema";
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

  let absolute: string;
  try {
    absolute = absoluteFilePath(row.cert.filePath);
    await stat(absolute);
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  // 성적서를 누가 언제 열어봤는지 남긴다.
  await writeAudit({
    actor: user,
    action: "CERT_DOWNLOAD",
    entityType: "web_meter_certificates",
    entityId: row.cert.id,
    summary: `성적서 열람: ${row.assetNo ?? "(계측기 미지정)"} ${row.cert.originalName}`,
  });

  // ?download=1 이면 저장 대화상자가 뜨고, 없으면 브라우저에서 바로 열린다.
  const download =
    new URL(request.url).searchParams.get("download") === "1";

  const stream = Readable.toWeb(
    createReadStream(absolute),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": row.cert.mimeType,
      "Content-Length": String(row.cert.sizeBytes),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(
        row.cert.originalName,
      )}`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
