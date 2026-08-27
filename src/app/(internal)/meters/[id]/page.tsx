import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteCalibrationAction,
  deleteCertificateAction,
} from "@/app/actions/calibrations";
import { AddCalibrationForm } from "@/components/AddCalibrationForm";
import { CertificateUpload } from "@/components/CertificateUpload";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DeleteMeterForm } from "@/components/DeleteMeterForm";
import { StatusBadge } from "@/components/StatusBadge";
import { isAdmin } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { listCalibrations, listCertificates } from "@/lib/calibrations";
import type {
  WebMeterCalibration,
  WebMeterCertificate,
  WebMeterPhoto,
} from "@/lib/db/schema";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getDictionary, meterName, type Dictionary } from "@/lib/i18n";
import { addMonths, currentDate, getMeter, getMeterPhotos } from "@/lib/meters";

const CARD = "rounded-lg border border-slate-200 bg-white";
const CARD_HEAD =
  "flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="w-28 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function PhotoGroup({
  title,
  photos,
  emptyLabel,
}: {
  title: string;
  photos: WebMeterPhoto[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-500">{title}</p>
      {photos.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={`/api/photos/${photo.id}`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-md border border-slate-200 hover:border-slate-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}`}
                alt={photo.originalName}
                className="h-40 w-40 object-cover"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const RESULT_STYLE = {
  PASS: "bg-emerald-100 text-emerald-800",
  FAIL: "bg-red-100 text-red-800",
  UNKNOWN: "bg-slate-100 text-slate-500",
} as const;

function CalibrationTable({
  calibrations,
  certificates,
  admin,
  t,
}: {
  calibrations: WebMeterCalibration[];
  certificates: WebMeterCertificate[];
  admin: boolean;
  t: Dictionary;
}) {
  if (calibrations.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-slate-400">
        {t.calibration.empty}
      </p>
    );
  }

  const th =
    "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500";
  const td = "whitespace-nowrap px-3 py-2 text-sm";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            <th className={th}>{t.calibration.date}</th>
            <th className={th}>{t.calibration.nextDue}</th>
            <th className={th}>{t.calibration.result}</th>
            <th className={th}>{t.calibration.agency}</th>
            <th className={th}>{t.calibration.certNo}</th>
            <th className={th}>{t.cert.title}</th>
            <th className={th}>{t.calibration.note}</th>
            {admin && <th className={th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {calibrations.map((row) => {
            const linked = certificates.filter(
              (c) => c.calibrationId === row.id,
            );
            return (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={`${td} tabular font-medium text-slate-900`}>
                  {row.calibratedOn}
                </td>
                <td className={`${td} tabular text-slate-600`}>
                  {row.nextDueYm ?? t.common.none}
                </td>
                <td className={td}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[row.result]}`}
                  >
                    {t.result[row.result]}
                  </span>
                </td>
                <td className={`${td} text-slate-600`}>
                  {row.agency ?? t.common.none}
                </td>
                <td className={`${td} tabular text-slate-500`}>
                  {row.certificateNo ?? t.common.none}
                </td>
                <td className={td}>
                  {linked.length === 0 ? (
                    <span className="text-slate-300">{t.common.none}</span>
                  ) : (
                    linked.map((c) => (
                      <a
                        key={c.id}
                        href={`/api/certificates/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-2 text-sky-700 underline-offset-2 hover:underline"
                      >
                        📄
                      </a>
                    ))
                  )}
                </td>
                <td
                  className={`${td} max-w-[16rem] truncate text-slate-500`}
                  title={row.note ?? ""}
                >
                  {row.note ?? ""}
                </td>
                {admin && (
                  <td className={`${td} text-right`}>
                    <form action={deleteCalibrationAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <ConfirmButton
                        message={t.calibration.deleteConfirm}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        {t.common.delete}
                      </ConfirmButton>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function MeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lang, t } = await getDictionary();

  const meter = await getMeter(id);
  if (!meter) notFound();

  const [photos, calibrations, certificates, user] = await Promise.all([
    getMeterPhotos(meter.id),
    listCalibrations(meter.id),
    listCertificates(meter.id),
    getSessionUser(),
  ]);

  const admin = isAdmin(user);
  const body = photos.filter((p) => p.kind === "BODY");
  const accessory = photos.filter((p) => p.kind === "ACCESSORY");

  // 교정 등록 폼의 기본값 — 오늘 날짜, 1년 뒤 기한
  const today = currentDate();
  const defaultNextDue = addMonths(today.slice(0, 7), 12);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← {t.common.back}
        </Link>

        {admin && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/meters/${meter.id}/edit`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t.common.edit}
            </Link>
            <DeleteMeterForm id={meter.id} t={t} />
          </div>
        )}
      </div>

      {/* 기본 정보 + 사진 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <span className="tabular rounded bg-slate-900 px-2 py-1 text-sm font-medium text-white">
            {meter.assetNo}
          </span>
          <h1 className="text-lg font-semibold text-slate-900">
            {meterName(lang, meter)}
          </h1>
          <div className="ml-auto">
            <StatusBadge status={meter.status} t={t} />
          </div>
        </div>

        <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
          <dl>
            <Row label={t.field.assetOwner} value={t.owner[meter.assetOwner]} />
            <Row label={t.field.maker} value={meter.maker ?? t.common.none} />
            <Row label={t.field.model} value={meter.model ?? t.common.none} />
            <Row
              label={t.field.controlNo}
              value={meter.controlNo ?? t.common.none}
            />
            <Row
              label={t.calibration.agency}
              value={meter.agencyNo ?? t.common.none}
            />
            <Row
              label={t.field.calibrationDueYm}
              value={meter.calibrationDueYm ?? t.due.none}
            />
            <Row label={t.field.quantity} value={String(meter.quantity)} />
            <Row
              label={t.field.serialNo}
              value={meter.serialNo ?? t.common.none}
            />
            <Row label={t.field.note} value={meter.note ?? t.common.none} />
            <Row
              label={t.field.updatedAt}
              value={formatDateTime(meter.updatedAt, lang)}
            />
          </dl>

          <div className="space-y-4">
            <PhotoGroup
              title={t.detail.photoBody}
              photos={body}
              emptyLabel={t.detail.noPhoto}
            />
            <PhotoGroup
              title={t.detail.photoAccessory}
              photos={accessory}
              emptyLabel={t.detail.noPhoto}
            />
          </div>
        </div>
      </div>

      {/* 교정 이력 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h2 className="text-base font-semibold text-slate-900">
            {t.calibration.title}
          </h2>
          <span className="tabular text-sm text-slate-400">
            {calibrations.length}
          </span>
          {admin && (
            <div className="ml-auto">
              <AddCalibrationForm
                meterId={meter.id}
                defaultDate={today}
                defaultNextDue={defaultNextDue}
                defaultAgency={meter.agencyNo ? "BNB" : ""}
                t={t}
              />
            </div>
          )}
        </div>
        <CalibrationTable
          calibrations={calibrations}
          certificates={certificates}
          admin={admin}
          t={t}
        />
      </div>

      {/* 성적서 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h2 className="text-base font-semibold text-slate-900">
            {t.cert.title}
          </h2>
          <span className="tabular text-sm text-slate-400">
            {certificates.length}
          </span>
          {admin && (
            <div className="ml-auto">
              <CertificateUpload meterId={meter.id} t={t} />
            </div>
          )}
        </div>

        {certificates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            {t.cert.empty}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {certificates.map((cert) => (
              <li
                key={cert.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-slate-50"
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
                {cert.source === "IMPORT" && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {t.cert.imported}
                  </span>
                )}
                <a
                  href={`/api/certificates/${cert.id}?download=1`}
                  className="shrink-0 text-xs text-slate-500 hover:text-slate-900"
                >
                  {t.cert.download}
                </a>
                {admin && (
                  <form action={deleteCertificateAction} className="shrink-0">
                    <input type="hidden" name="id" value={cert.id} />
                    <ConfirmButton
                      message={`${cert.originalName}\n\n${t.common.delete}?`}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      {t.common.delete}
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
