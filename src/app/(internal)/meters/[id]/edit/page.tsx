import { notFound } from "next/navigation";

import { updateMeterAction } from "@/app/actions/meters";
import { MeterForm } from "@/components/MeterForm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";
import { getMeter } from "@/lib/meters";

export default async function EditMeterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin(`/meters/${id}/edit`);

  const { t } = await getDictionary();
  const meter = await getMeter(id);
  if (!meter) notFound();

  return (
    <MeterForm
      action={updateMeterAction}
      title={t.form.editTitle}
      cancelHref={`/meters/${meter.id}`}
      t={t}
      values={{
        id: meter.id,
        assetNo: meter.assetNo,
        nameKo: meter.nameKo,
        nameJa: meter.nameJa ?? "",
        maker: meter.maker ?? "",
        model: meter.model ?? "",
        assetOwner: meter.assetOwner,
        controlNo: meter.controlNo ?? "",
        calibrationDueYm: meter.calibrationDueYm ?? "",
        quantity: meter.quantity,
        serialNo: meter.serialNo ?? "",
        status: meter.status,
        note: meter.note ?? "",
      }}
    />
  );
}
