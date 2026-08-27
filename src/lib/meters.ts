/**
 * 계측기 조회와 교정 기한 판정.
 *
 * 교정 기한은 'YYYY-MM' 글자다. 날짜 타입이 아니므로 시간대에 흔들리지 않는다.
 */
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import type { Lang } from "@/lib/i18n";
import {
  webMeterPhotos,
  webMeters,
  type AssetOwner,
  type MeterStatus,
  type WebMeter,
  type WebMeterPhoto,
} from "@/lib/db/schema";

/** 오늘이 속한 달. 서버가 NAS(UTC)여도 한국 기준으로 계산한다. */
export function currentYm(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}`;
}

/** 오늘 날짜(YYYY-MM-DD). 서버가 NAS(UTC)여도 한국 기준으로 계산한다. */
export function currentDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 'YYYY-MM' 에 개월 수를 더한다. */
export function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type DueLevel = "OVERDUE" | "SOON" | "OK" | "NONE";

/**
 * 목록에서 색을 정하는 기준.
 *
 * 상태는 사람이 직접 정한다. 여기서는 색만 계산하고 상태를 바꾸지 않는다.
 * 실제로 교정을 보냈는지는 사람만 알기 때문이다.
 */
export function dueLevel(
  meter: Pick<WebMeter, "calibrationDueYm" | "status">,
  today: string = currentYm(),
): DueLevel {
  if (meter.status === "NOT_SUBJECT") return "NONE";

  // 사람이 직접 '기한초과(사용금지)'로 지정한 것은 적힌 기한과 상관없이 빨갛게 둔다.
  // 그러지 않으면 빨간 배지가 붙은 채 줄만 멀쩡해 보인다.
  if (meter.status === "EXPIRED") return "OVERDUE";

  if (!meter.calibrationDueYm) return "NONE";
  if (meter.calibrationDueYm < today) return "OVERDUE";
  if (meter.calibrationDueYm <= addMonths(today, 1)) return "SOON";
  return "OK";
}

/* ------------------------------------------------------------------ */
/* 정렬                                                                 */
/* ------------------------------------------------------------------ */

export const SORT_KEYS = [
  "priority", // 기본 정렬. 표 머리글에는 없다.
  "assetNo",
  "name",
  "maker",
  "model",
  "controlNo",
  "due",
  "status",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: SortKey = "priority";
export const DEFAULT_DIR: SortDir = "asc";

/**
 * 기본 정렬 순서 — 먼저 손봐야 할 것이 위로 온다.
 *
 *   1  교정기한 임박            (반납·발송은 제외)
 *   2  사용중                   자산번호순
 *   3  그 외 (교정진행중·교정대상아님·고장 등)
 *   4  임박인데 반납·발송        기한초과 바로 위
 *   5  기한초과                  맨 아래
 *
 * dueLevel() 과 같은 판정을 SQL 로 옮긴 것이다. 둘을 함께 고쳐야 한다.
 */
function priorityExpression(): SQL {
  const today = currentYm();
  const nextMonth = addMonths(today, 1);

  return sql`CASE
    WHEN ${webMeters.status} = 'NOT_SUBJECT' THEN 3
    WHEN ${webMeters.status} = 'EXPIRED' THEN 5
    WHEN ${webMeters.calibrationDueYm} IS NULL
      THEN CASE WHEN ${webMeters.status} = 'IN_USE' THEN 2 ELSE 3 END
    WHEN ${webMeters.calibrationDueYm} < ${today} THEN 5
    WHEN ${webMeters.calibrationDueYm} <= ${nextMonth}
      THEN CASE WHEN ${webMeters.status} = 'RETURNED' THEN 4 ELSE 1 END
    WHEN ${webMeters.status} = 'IN_USE' THEN 2
    ELSE 3
  END`;
}

/**
 * 상태 정렬은 영문 코드 순서가 아니라 "먼저 봐야 할 것" 순서로 한다.
 * 기한초과 → 고장 → 교정진행중 → 사용중 → 반납·발송 → 교정대상아님
 */
const STATUS_ORDER = sql`CASE ${webMeters.status}
  WHEN 'EXPIRED' THEN 1
  WHEN 'BROKEN' THEN 2
  WHEN 'CALIBRATING' THEN 3
  WHEN 'IN_USE' THEN 4
  WHEN 'RETURNED' THEN 5
  ELSE 6 END`;

function sortExpression(key: SortKey, lang: Lang): SQL {
  switch (key) {
    case "priority":
      return priorityExpression();
    case "assetNo":
      return sql`${webMeters.assetNo}`;
    case "name":
      // 일본어 화면에서는 실제로 보이는 이름(일본어명이 없으면 한국어명)으로 정렬한다.
      return lang === "ja"
        ? sql`COALESCE(NULLIF(${webMeters.nameJa}, ''), ${webMeters.nameKo})`
        : sql`${webMeters.nameKo}`;
    case "maker":
      return sql`${webMeters.maker}`;
    case "model":
      return sql`${webMeters.model}`;
    case "controlNo":
      return sql`${webMeters.controlNo}`;
    case "due":
      return sql`${webMeters.calibrationDueYm}`;
    case "status":
      return STATUS_ORDER;
  }
}

export function parseSort(value: string | undefined): SortKey {
  return value && (SORT_KEYS as readonly string[]).includes(value)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

export function parseDir(value: string | undefined): SortDir {
  return value === "desc" ? "desc" : "asc";
}

export type MeterFilter = {
  q?: string;
  owner?: AssetOwner | "ALL";
  status?: MeterStatus | "ALL";
};

function buildWhere(filter: MeterFilter) {
  const conditions = [eq(webMeters.isDeleted, false)];

  if (filter.owner && filter.owner !== "ALL") {
    conditions.push(eq(webMeters.assetOwner, filter.owner));
  }
  if (filter.status && filter.status !== "ALL") {
    conditions.push(eq(webMeters.status, filter.status));
  }

  const q = filter.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(webMeters.assetNo, like),
        ilike(webMeters.nameKo, like),
        ilike(webMeters.nameJa, like),
        ilike(webMeters.maker, like),
        ilike(webMeters.model, like),
        ilike(webMeters.serialNo, like),
        ilike(webMeters.controlNo, like),
        ilike(webMeters.note, like),
      )!,
    );
  }

  return and(...conditions);
}

/**
 * 기본은 priorityExpression() 의 순서(임박 → 사용중 → 그 외 → 임박·반납 → 기한초과).
 * 표 머리글을 누르면 그 열 기준으로 바뀐다.
 * 값이 비어 있는 것은 오름/내림 어느 쪽이든 맨 뒤에 둔다.
 */
export async function listMeters(
  filter: MeterFilter,
  sort: { key: SortKey; dir: SortDir } = { key: DEFAULT_SORT, dir: DEFAULT_DIR },
  lang: Lang = "ko",
): Promise<WebMeter[]> {
  const direction = sql.raw(sort.dir === "desc" ? "DESC" : "ASC");

  return db
    .select()
    .from(webMeters)
    .where(buildWhere(filter))
    .orderBy(
      sql`${sortExpression(sort.key, lang)} ${direction} NULLS LAST`,
      asc(webMeters.assetNo),
    );
}

export type MeterSummary = {
  total: number;
  overdue: number;
  soon: number;
  calibrating: number;
};

export async function summarize(meters: WebMeter[]): Promise<MeterSummary> {
  const today = currentYm();
  let overdue = 0;
  let soon = 0;
  let calibrating = 0;

  for (const meter of meters) {
    const level = dueLevel(meter, today);
    if (level === "OVERDUE") overdue += 1;
    else if (level === "SOON") soon += 1;
    if (meter.status === "CALIBRATING") calibrating += 1;
  }

  return { total: meters.length, overdue, soon, calibrating };
}

export async function getMeter(id: string): Promise<WebMeter | null> {
  const rows = await db
    .select()
    .from(webMeters)
    .where(and(eq(webMeters.id, id), eq(webMeters.isDeleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMeterPhotos(meterId: string): Promise<WebMeterPhoto[]> {
  return db
    .select()
    .from(webMeterPhotos)
    .where(
      and(
        eq(webMeterPhotos.meterId, meterId),
        eq(webMeterPhotos.isDeleted, false),
      ),
    )
    .orderBy(asc(webMeterPhotos.kind), asc(webMeterPhotos.sortOrder));
}

/** 목록 화면에서 썸네일을 함께 보여줄 때 쓴다. */
export async function getFirstPhotos(
  meterIds: string[],
): Promise<Map<string, WebMeterPhoto>> {
  if (meterIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(webMeterPhotos)
    .where(
      and(
        inArray(webMeterPhotos.meterId, meterIds),
        eq(webMeterPhotos.isDeleted, false),
        eq(webMeterPhotos.kind, "BODY"),
      ),
    )
    .orderBy(asc(webMeterPhotos.sortOrder));

  const map = new Map<string, WebMeterPhoto>();
  for (const row of rows) {
    if (!map.has(row.meterId)) map.set(row.meterId, row);
  }
  return map;
}
