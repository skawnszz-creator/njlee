import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteMeterForm } from "@/components/DeleteMeterForm";
import { StatusBadge } from "@/components/StatusBadge";
import { isAdmin } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { getDictionary, meterName } from "@/lib/i18n";
import { getMeter, getMeterPhotos } from "@/lib/meters";
import type { WebMeterPhoto } from "@/lib/db/schema";

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

export default async function MeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lang, t } = await getDictionary();

  const meter = await getMeter(id);
  if (!meter) notFound();

  const photos = await getMeterPhotos(meter.id);
  const user = await getSessionUser();

  const body = photos.filter((p) => p.kind === "BODY");
  const accessory = photos.filter((p) => p.kind === "ACCESSORY");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← {t.common.back}
        </Link>

        {isAdmin(user) && (
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

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
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
    </div>
  );
}
