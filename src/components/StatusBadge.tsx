import type { MeterStatus } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";

const STYLES: Record<MeterStatus, string> = {
  IN_USE: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  CALIBRATING: "bg-sky-100 text-sky-800 ring-sky-200",
  EXPIRED: "bg-red-100 text-red-800 ring-red-200",
  BROKEN: "bg-slate-200 text-slate-700 ring-slate-300",
  NOT_SUBJECT: "bg-slate-100 text-slate-500 ring-slate-200",
  RETURNED: "bg-violet-100 text-violet-800 ring-violet-200",
};

export function StatusBadge({
  status,
  t,
}: {
  status: MeterStatus;
  t: Dictionary;
}) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {t.status[status]}
    </span>
  );
}
