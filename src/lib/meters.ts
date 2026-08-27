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
  if (!meter.calibrationDueYm) return "NONE";
  if (meter.calibrationDueYm < today) return "OVERDUE";
  if (meter.calibrationDueYm <= addMonths(today, 1)) return "SOON";
  return "OK";
}

/* ------------------------------------------------------------------ */
/* 정렬                                                                 */
/* ------------------------------------------------------------------ */

export const SORT_KEYS = [
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

export const DEFAULT_SORT: SortKey = "due";
export const DEFAULT_DIR: SortDir = "asc";

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
 * 기본은 교정기한이 임박한 순. 값이 비어 있는 것은 오름/내림 어느 쪽이든 맨 뒤에 둔다.
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
