"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webNotifyRecipients, webNotifyTemplates } from "@/lib/db/schema";
import { LANGUAGES, type Lang } from "@/lib/i18n";

export type NotifyFormState = { error?: string; ok?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * id 를 UUID 로 확인한 뒤에 DB 로 보낸다.
 * 빈 값이나 엉뚱한 값을 그대로 넘기면 Postgres 가 uuid 변환에서 터져
 * 화면에 500 이 뜬다. 없는 것은 없는 것으로 다루는 편이 맞다.
 */
function uuid(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function lang(formData: FormData, key: string): Lang {
  const value = text(formData, key);
  return (LANGUAGES as readonly string[]).includes(value) ? (value as Lang) : "ko";
}

/* ------------------------------------------------------------------ */
/* 수신자                                                               */
/* ------------------------------------------------------------------ */

export async function addRecipientAction(
  _prev: NotifyFormState,
  formData: FormData,
): Promise<NotifyFormState> {
  const admin = await requireAdmin();

  const email = text(formData, "email").toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "메일 주소 형식이 아닙니다." };
  }

  // 지운 적 있는 주소는 되살린다. 유니크 인덱스가 지운 것은 세지 않기 때문에
  // 그냥 넣으면 같은 주소가 두 줄이 된다.
  const existing = (
    await db
      .select()
      .from(webNotifyRecipients)
      .where(eq(webNotifyRecipients.email, email))
      .limit(1)
  )[0];

  const values = {
    email,
    name: text(formData, "name") || null,
    lang: lang(formData, "lang"),
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    updatedAt: new Date(),
  };

  if (existing && !existing.isDeleted) {
    return { error: "이미 등록된 주소입니다." };
  }

  const [saved] = existing
    ? await db
        .update(webNotifyRecipients)
        .set(values)
        .where(eq(webNotifyRecipients.id, existing.id))
        .returning()
    : await db.insert(webNotifyRecipients).values(values).returning();

  await writeAudit({
    actor: admin,
    action: "NOTIFY_RECIPIENT_ADD",
    entityType: "web_notify_recipients",
    entityId: saved.id,
    summary: `알림 수신자 추가: ${email}`,
    changes: { lang: values.lang },
  });

  revalidatePath("/settings/notify");
  return { ok: `${email} 을(를) 추가했습니다.` };
}

/** 잠시 끄고 켜기. 지우지 않는다. */
export async function toggleRecipientAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = uuid(formData, "id");
  if (!id) redirect("/settings/notify");

  const target = (
    await db
      .select()
      .from(webNotifyRecipients)
      .where(
        and(
          eq(webNotifyRecipients.id, id),
          eq(webNotifyRecipients.isDeleted, false),
        ),
      )
      .limit(1)
  )[0];
  if (!target) redirect("/settings/notify");

  const next = !target.isActive;
  await db
    .update(webNotifyRecipients)
    .set({ isActive: next, updatedAt: new Date() })
    .where(eq(webNotifyRecipients.id, id));

  await writeAudit({
    actor: admin,
    action: "NOTIFY_RECIPIENT_UPDATE",
    entityType: "web_notify_recipients",
    entityId: id,
    summary: `알림 수신자 ${next ? "켜기" : "끄기"}: ${target.email}`,
  });

  revalidatePath("/settings/notify");
}

export async function deleteRecipientAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = uuid(formData, "id");
  if (!id) redirect("/settings/notify");

  const target = (
    await db
      .select()
      .from(webNotifyRecipients)
      .where(eq(webNotifyRecipients.id, id))
      .limit(1)
  )[0];
  if (!target || target.isDeleted) redirect("/settings/notify");

  await db
    .update(webNotifyRecipients)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: admin.id,
      updatedAt: new Date(),
    })
    .where(eq(webNotifyRecipients.id, id));

  await writeAudit({
    actor: admin,
    action: "NOTIFY_RECIPIENT_DELETE",
    entityType: "web_notify_recipients",
    entityId: id,
    summary: `알림 수신자 삭제: ${target.email}`,
  });

  revalidatePath("/settings/notify");
}

/* ------------------------------------------------------------------ */
/* 메일 본문                                                            */
/* ------------------------------------------------------------------ */

export async function saveTemplateAction(
  _prev: NotifyFormState,
  formData: FormData,
): Promise<NotifyFormState> {
  const admin = await requireAdmin();

  const target = lang(formData, "lang");
  const subject = text(formData, "subject");
  const lead = text(formData, "lead");
  const footer = text(formData, "footer");

  if (!subject) return { error: "메일 제목을 입력하세요." };
  if (!lead) return { error: "본문 앞말을 입력하세요." };

  const existing = (
    await db
      .select()
      .from(webNotifyTemplates)
      .where(eq(webNotifyTemplates.lang, target))
      .limit(1)
  )[0];

  const values = { lang: target, subject, lead, footer, updatedBy: admin.id };

  if (existing) {
    await db
      .update(webNotifyTemplates)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(webNotifyTemplates.id, existing.id));
  } else {
    await db.insert(webNotifyTemplates).values(values);
  }

  await writeAudit({
    actor: admin,
    action: "NOTIFY_TEMPLATE_UPDATE",
    entityType: "web_notify_templates",
    summary: `알림 메일 문구 수정 (${target})`,
    changes: { subject, lead, footer },
  });

  revalidatePath("/settings/notify");
  return { ok: "저장했습니다." };
}
