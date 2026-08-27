import Link from "next/link";

import { assignCertificateAction } from "@/app/actions/calibrations";
import { requireAdmin } from "@/lib/auth/guards";
import {
  listMeterChoices,
  listUnassignedCertificates,
} from "@/lib/calibrations";
import { formatBytes } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";

/**
 * 주인 없는 성적서.
 *
 * 파일명에 S/N 도 교정업체 번호도 없어 자동으로 붙이지 못한 것들이다.
 * 버리지 않고 여기 모아 두었다가 사람이 계측기를 골라 붙인다.
 */
export default async function UnassignedCertificatesPage() {
  await requireAdmin("/certificates");
  const { t } = await getDictionary();

  const [certificates, meters] = await Promise.all([
    listUnassignedCertificates(),
    listMeterChoices(),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← {t.common.back}
      </Link>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-slate-200 px-5 py-3">
          <h1 className="text-base font-semibold text-slate-900">
            {t.cert.unassigned}
          </h1>
          <span className="tabular text-sm text-slate-400">
            {certificates.length}
          </span>
        </div>

        <p className="border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          {t.cert.unassignedHint}
        </p>

        {certificates.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            {t.cert.empty}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {certificates.map((cert) => (
              <li
                key={cert.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 hover:bg-slate-50"
              >
                <a
                  href={`/api/certificates/${cert.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-slate-900 underline-offset-2 hover:underline"
                  title={cert.originalName}
                >
                  📄 {cert.originalName}
                </a>
                <span className="tabular shrink-0 text-xs text-slate-400">
                  {formatBytes(cert.sizeBytes)}
                </span>

                <form
                  action={assignCertificateAction}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <input type="hidden" name="id" value={cert.id} />
                  <select
                    name="meterId"
                    required
                    defaultValue=""
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
                  >
                    <option value="" disabled>
                      {t.cert.pick}
                    </option>
                    {meters.map((meter) => (
                      <option key={meter.id} value={meter.id}>
                        {meter.assetNo} · {meter.nameKo}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    {t.cert.assign}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
