"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { diffChanges, writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  ASSET_OWNERS,
  METER_STATUSES,
  webMeters,
  type AssetOwner,
  type MeterStatus,
} from "@/lib/db/schema";
import { getDictionary } from "@/lib/i18n";
import { YM_PATTERN } from "@/lib/meters";

export type MeterFormState = { error?: string };

const EDITABLE_FIELDS = [
  "assetNo",
  "nameKo",
  "nameJa",
  "maker",
  "model",
  "assetOwner",
  "controlNo",
  "calibrationDueYm",
  "quantity",
  "serialNo",
  "status",
  "note",
] as const;

type ParsedMeter = {
  assetNo: string;
  nameKo: string;
  nameJa: string | null;
  maker: string | null;
  model: string | null;
  assetOwner: AssetOwner;
  controlNo: string | null;
  calibrationDueYm: string | null;
  quantity: number;
  serialNo: string | null;
  status: MeterStatus;
  note: string | null;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

async function parse(
  formData: FormData,
): Promise<{ value: ParsedMeter } | { error: string }> {
  const { t } = await getDictionary();

  const assetNo = text(formData, "assetNo");
  if (!assetNo) return { error: t.form.assetNoInvalid };

  const nameKo = text(formData, "nameKo");
  if (!nameKo) return { error: t.form.nameRequired };

  const due = optional(formData, "calibrationDueYm");
  if (due && !YM_PATTERN.test(due)) return { error: t.form.dueInvalid };

  const owner = text(formData, "assetOwner") as AssetOwner;
  if (!(ASSET_OWNERS as readonly string[]).includes(owner)) {
    return { error: t.form.assetNoInvalid };
  }

  const status = text(formData, "status") as MeterStatus;
  if (!(METER_STATUSES as readonly string[]).includes(status)) {
    return { error: t.form.assetNoInvalid };
  }

  const quantityRaw = text(formData, "quantity");
  const quantity = quantityRaw === "" ? 1 : Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { error: t.form.assetNoInvalid };
  }

  return {
    value: {
      assetNo,
      nameKo,
      nameJa: optional(formData, "nameJa"),
      maker: optional(formData, "maker"),
      model: optional(formData, "model"),
      assetOwner: owner,
      controlNo: optional(formData, "controlNo"),
      calibrationDueYm: due,
      quantity,
      serialNo: optional(formData, "serialNo"),
      status,
      note: optional(formData, "note"),
    },
  };
}

/** 살아 있는 계측기 중에 같은 자산번호가 있는지. */
async function assetNoTaken(assetNo: string, exceptId?: string) {
  const rows = await db
    .select({ id: webMeters.id })
    .from(webMeters)
    .where(
      and(
        eq(webMeters.assetNo, assetNo),
        eq(webMeters.isDeleted, false),
        exceptId ? ne(webMeters.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createMeterAction(
  _prev: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const admin = await requireAdmin();
  const { t } = await getDictionary();

  const parsed = await parse(formData);
  if ("error" in parsed) return parsed;

  if (await assetNoTaken(parsed.value.assetNo)) {
    return { error: t.form.assetNoTaken };
  }

  const [created] = await db.insert(webMeters).values(parsed.value).returning();

  await writeAudit({
    actor: admin,
    action: "METER_CREATE",
    entityType: "web_meters",
    entityId: created.id,
    summary: `계측기 등록: ${created.assetNo} ${created.nameKo}`,
    changes: { ...parsed.value },
  });

  revalidatePath("/");
  redirect(`/meters/${created.id}`);
}

export async function updateMeterAction(
  _prev: MeterFormState,
  formData: FormData,
): Promise<MeterFormState> {
  const admin = await requireAdmin();
  const { t } = await getDictionary();

  const id = text(formData, "id");
  if (!id) return { error: t.error.notFound };

  const before = (
    await db.select().from(webMeters).where(eq(webMeters.id, id)).limit(1)
  )[0];
  if (!before || before.isDeleted) return { error: t.error.notFound };

  const parsed = await parse(formData);
  if ("error" in parsed) return parsed;

  if (await assetNoTaken(parsed.value.assetNo, id)) {
    return { error: t.form.assetNoTaken };
  }

  const [after] = await db
    .update(webMeters)
    .set({ ...parsed.value, updatedAt: new Date() })
    .where(eq(webMeters.id, id))
    .returning();

  const changes = diffChanges(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    [...EDITABLE_FIELDS],
  );

  if (Object.keys(changes).length > 0) {
    await writeAudit({
      actor: admin,
      action: "METER_UPDATE",
      entityType: "web_meters",
      entityId: id,
      summary: `계측기 수정: ${after.assetNo} ${after.nameKo}`,
      changes,
    });
  }

  revalidatePath("/");
  revalidatePath(`/meters/${id}`);
  redirect(`/meters/${id}`);
}

/**
 * 소프트 삭제. 실제로 지우지 않고 목록에서만 감춘다.
 */
export async function deleteMeterAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) redirect("/");

  const before = (
    await db.select().from(webMeters).where(eq(webMeters.id, id)).limit(1)
  )[0];
  if (!before || before.isDeleted) redirect("/");

  await db
    .update(webMeters)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: admin.id,
      deleteReason: reason || null,
      updatedAt: new Date(),
    })
    .where(eq(webMeters.id, id));

  await writeAudit({
    actor: admin,
    action: "METER_DELETE",
    entityType: "web_meters",
    entityId: id,
    summary: `계측기 삭제: ${before.assetNo} ${before.nameKo}`,
    changes: { reason: reason || null },
  });

  revalidatePath("/");
  redirect("/");
}
