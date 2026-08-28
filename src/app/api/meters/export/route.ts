/**
 * 계측기 리스트 엑셀 내려받기.
 *
 *   GET /api/meters/export?q=...&owner=...&status=...
 *
 * 목록 화면과 **같은 조건**을 받는다. 화면에서 보고 있는 것이 그대로 나와야
 * "이걸 보내면 되겠다" 가 눈으로 확인되기 때문이다.
 *
 * 정렬은 화면을 따르지 않는다. 보내는 문서는 늘 자산번호 순이다.
 * 문서의 언어는 화면 언어를 따른다 — 교산에 보낼 때는 일본어 화면에서 내려받는다.
 */
import { writeAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import {
  ASSET_OWNERS,
  METER_STATUSES,
  type AssetOwner,
  type MeterStatus,
} from "@/lib/db/schema";
import { buildMeterListWorkbook } from "@/lib/excel";
import { getDictionary } from "@/lib/i18n";
import { currentDate, describeFilter, listMeters } from "@/lib/meters";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | "ALL" {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : "ALL";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const query = new URL(request.url).searchParams;
  const filter = {
    q: query.get("q") ?? "",
    owner: pick<AssetOwner>(query.get("owner"), ASSET_OWNERS),
    status: pick<MeterStatus>(query.get("status"), METER_STATUSES),
  };

  const { lang, t } = await getDictionary();
  const meters = await listMeters(filter, { key: "assetNo", dir: "asc" }, lang);
  const today = currentDate();

  const buffer = await buildMeterListWorkbook({
    meters,
    lang,
    today,
    condition: describeFilter(filter, t),
    author: user.displayName,
  });

  await writeAudit({
    actor: user,
    action: "METER_EXPORT",
    entityType: "web_meters",
    summary: `엑셀 내보내기: ${meters.length}대`,
    changes: { ...filter, count: meters.length },
  });

  // 파일명에 한글·일본어가 들어가 그대로는 헤더에 넣을 수 없다. RFC 5987 로 적는다.
  const fileName = `DSS_${t.list.printTitle}_${today}.xlsx`;
  const encoded = encodeURIComponent(fileName);

  return new Response(buffer, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="meters-${today}.xlsx"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
