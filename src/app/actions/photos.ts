"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webMeterPhotos } from "@/lib/db/schema";

/**
 * 계측기 사진 삭제.
 *
 * 성적서와 같다 — 기록만 감추고 파일은 디스크에 그대로 둔다.
 * 실수로 지웠을 때 되살릴 수 있어야 한다.
 */
export async function deletePhotoAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) redirect("/");

  const target = (
    await db
      .select()
      .from(webMeterPhotos)
      .where(eq(webMeterPhotos.id, id))
      .limit(1)
  )[0];
  if (!target || target.isDeleted) redirect("/");

  await db
    .update(webMeterPhotos)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: admin.id,
      deleteReason: reason || null,
      updatedAt: new Date(),
    })
    .where(eq(webMeterPhotos.id, id));

  await writeAudit({
    actor: admin,
    action: "PHOTO_DELETE",
    entityType: "web_meter_photos",
    entityId: id,
    summary: `사진 삭제: ${target.originalName}`,
    changes: { kind: target.kind },
  });

  // 목록 썸네일도 이 사진을 쓰고 있을 수 있다.
  revalidatePath("/");
  revalidatePath(`/meters/${target.meterId}`);
}
