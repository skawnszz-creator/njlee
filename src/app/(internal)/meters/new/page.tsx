import { createMeterAction } from "@/app/actions/meters";
import { MeterForm } from "@/components/MeterForm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";

export default async function NewMeterPage() {
  await requireAdmin("/meters/new");
  const { t } = await getDictionary();

  return (
    <MeterForm
      action={createMeterAction}
      title={t.form.newTitle}
      cancelHref="/"
      t={t}
      values={{
        assetNo: "",
        nameKo: "",
        nameJa: "",
        maker: "",
        model: "",
        assetOwner: "DSS",
        controlNo: "",
        calibrationDueYm: "",
        quantity: 1,
        serialNo: "",
        status: "IN_USE",
        note: "",
      }}
    />
  );
}
