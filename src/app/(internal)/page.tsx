import Link from "next/link";

import { FilterBar } from "@/components/FilterBar";
import { StatusBadge } from "@/components/StatusBadge";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/guards";
import {
  ASSET_OWNERS,
  METER_STATUSES,
  type AssetOwner,
  type MeterStatus,
} from "@/lib/db/schema";
import {
  countUnassignedCertificates,
  meterIdsWithCertificates,
} from "@/lib/calibrations";
import { getDictionary, meterName } from "@/lib/i18n";
import {
  currentYm,
  dueLevel,
  listMeters,
  parseDir,
  parseSort,
  summarize,
  type SortDir,
  type SortKey,
} from "@/lib/meters";

/** 목록 행의 배경색 — 상태가 아니라 교정기한으로 정한다. */
const ROW_STYLE = {
  OVERDUE: "bg-red-50 hover:bg-red-100/70",
  SOON: "bg-amber-50 hover:bg-amber-100/70",
  OK: "bg-white hover:bg-slate-50",
  NONE: "bg-white text-slate-400 hover:bg-slate-50",
} as const;

const DUE_STYLE = {
  OVERDUE: "font-semibold text-red-700",
  SOON: "font-semibold text-amber-700",
  OK: "text-slate-700",
  NONE: "text-slate-400",
} as const;

const TH =
  "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500";
const TD = "whitespace-nowrap px-3 py-2 text-sm";

function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | "ALL" {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : "ALL";
}

/**
 * 정렬 가능한 표 머리글.
 * 지금 정렬 중인 열은 진한 화살표(▲ 오름 / ▼ 내림), 나머지는 흐린 ▼ 로 표시한다.
 */
function SortHeader({
  label,
  column,
  sort,
  dir,
  base,
  align = "left",
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: SortDir;
  base: URLSearchParams;
  align?: "left" | "right";
}) {
  const active = sort === column;
  const nextDir: SortDir = active && dir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(base);
  params.set("sort", column);
  params.set("dir", nextDir);

  return (
    <th className={`${TH} ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={`/?${params.toString()}`}
        scroll={false}
        className={`group inline-flex items-center gap-1 hover:text-slate-900 ${
          active ? "text-slate-900" : ""
        }`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span
          aria-hidden
          className={`text-[0.65rem] leading-none ${
            active ? "text-slate-900" : "text-slate-300 group-hover:text-slate-500"
          }`}
        >
          {active && dir === "asc" ? "▲" : "▼"}
        </span>
      </Link>
    </th>
  );
}

export default async function MeterListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { lang, t } = await getDictionary();
  const user = await getSessionUser();

  const str = (key: string) =>
    typeof sp[key] === "string" ? (sp[key] as string) : undefined;

  const q = str("q") ?? "";
  const owner = pick<AssetOwner>(str("owner"), ASSET_OWNERS);
  const status = pick<MeterStatus>(str("status"), METER_STATUSES);
  const sort = parseSort(str("sort"));
  const dir = parseDir(str("dir"));

  // 정렬 링크가 검색·필터 조건을 잃어버리지 않게 한다.
  const base = new URLSearchParams();
  if (q) base.set("q", q);
  if (owner !== "ALL") base.set("owner", owner);
  if (status !== "ALL") base.set("status", status);

  const meters = await listMeters({ q, owner, status }, { key: sort, dir }, lang);
  const summary = await summarize(meters);
  const today = currentYm();

  const admin = isAdmin(user);
  const [withCerts, unassigned] = await Promise.all([
    meterIdsWithCertificates(),
    admin ? countUnassignedCertificates() : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-4">
      {/* 한 줄 요약 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
        <span className="text-slate-700">
          {t.list.total}{" "}
          <strong className="tabular text-base text-slate-900">
            {summary.total}
          </strong>
          {t.common.unit}
        </span>
        <span className="text-slate-300">·</span>
        <span className={summary.overdue > 0 ? "text-red-700" : "text-slate-400"}>
          {t.list.overdue} <strong className="tabular">{summary.overdue}</strong>
        </span>
        <span className="text-slate-300">·</span>
        <span className={summary.soon > 0 ? "text-amber-700" : "text-slate-400"}>
          {t.list.soon} <strong className="tabular">{summary.soon}</strong>
        </span>
        <span className="text-slate-300">·</span>
        <span
          className={summary.calibrating > 0 ? "text-sky-700" : "text-slate-400"}
        >
          {t.list.calibrating}{" "}
          <strong className="tabular">{summary.calibrating}</strong>
        </span>

        {admin && unassigned > 0 && (
          <Link
            href="/certificates"
            className="ml-auto rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            {t.cert.unassigned} {unassigned}
          </Link>
        )}

        {admin && (
          <Link
            href="/meters/new"
            className={`rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 ${unassigned > 0 ? "" : "ml-auto"}`}
          >
            + {t.list.add}
          </Link>
        )}
      </div>

      <FilterBar t={t} q={q} owner={owner} status={status} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <SortHeader
                label={t.field.assetNo}
                column="assetNo"
                sort={sort}
                dir={dir}
                base={base}
              />
              <SortHeader
                label={t.field.name}
                column="name"
                sort={sort}
                dir={dir}
                base={base}
              />
              <SortHeader
                label={t.field.maker}
                column="maker"
                sort={sort}
                dir={dir}
                base={base}
              />
              <SortHeader
                label={t.field.model}
                column="model"
                sort={sort}
                dir={dir}
                base={base}
              />
              <SortHeader
                label={t.field.controlNo}
                column="controlNo"
                sort={sort}
                dir={dir}
                base={base}
              />
              <SortHeader
                label={t.field.calibrationDueYm}
                column="due"
                sort={sort}
                dir={dir}
                base={base}
              />
              <th className={`${TH} text-right`}>{t.field.quantity}</th>
              <th className={TH}>{t.field.serialNo}</th>
              <SortHeader
                label={t.field.status}
                column="status"
                sort={sort}
                dir={dir}
                base={base}
              />
              <th className={TH}>{t.field.note}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meters.map((meter) => {
              const level = dueLevel(meter, today);
              return (
                <tr key={meter.id} className={ROW_STYLE[level]}>
                  <td className={`${TD} tabular font-medium`}>
                    <Link
                      href={`/meters/${meter.id}`}
                      className="text-slate-900 underline-offset-2 hover:underline"
                    >
                      {meter.assetNo}
                    </Link>
                  </td>
                  <td className={`${TD} max-w-[22rem] truncate`}>
                    <Link
                      href={`/meters/${meter.id}`}
                      className="hover:underline"
                      title={meterName(lang, meter)}
                    >
                      {meterName(lang, meter)}
                    </Link>
                    {withCerts.has(meter.id) && (
                      <span className="ml-1.5 text-xs" title={t.cert.title}>
                        📄
                      </span>
                    )}
                  </td>
                  <td className={TD}>{meter.maker ?? t.common.none}</td>
                  <td
                    className={`${TD} max-w-[14rem] truncate`}
                    title={meter.model ?? ""}
                  >
                    {meter.model ?? t.common.none}
                  </td>
                  <td className={`${TD} tabular text-slate-500`}>
                    {meter.controlNo ?? t.common.none}
                  </td>
                  <td className={`${TD} tabular ${DUE_STYLE[level]}`}>
                    {meter.calibrationDueYm ?? t.common.none}
                    {level === "OVERDUE" && (
                      <span className="ml-1.5 text-xs">({t.due.overdue})</span>
                    )}
                    {level === "SOON" && (
                      <span className="ml-1.5 text-xs">({t.due.soon})</span>
                    )}
                  </td>
                  <td className={`${TD} tabular text-right`}>{meter.quantity}</td>
                  <td className={`${TD} tabular text-slate-500`}>
                    {meter.serialNo ?? t.common.none}
                  </td>
                  <td className={TD}>
                    <StatusBadge status={meter.status} t={t} />
                  </td>
                  <td
                    className={`${TD} max-w-[16rem] truncate text-slate-500`}
                    title={meter.note ?? ""}
                  >
                    {meter.note ?? ""}
                  </td>
                </tr>
              );
            })}

            {meters.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-10 text-center text-sm text-slate-400"
                >
                  {t.list.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
