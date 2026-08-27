"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { safeReturnTo } from "@/lib/auth/guards";
import {
  devLoginEnabled,
  findDevUser,
  touchLogin,
  upsertDevViewer,
} from "@/lib/auth/dev-login";
import {
  createSession,
  destroySession,
  getSessionUser,
} from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { LANG_COOKIE, LANGUAGES, type Lang } from "@/lib/i18n";

/** 화면 언어를 바꾼다. */
export async function setLanguageAction(formData: FormData): Promise<void> {
  const value = String(formData.get("lang") ?? "");
  const lang: Lang = (LANGUAGES as readonly string[]).includes(value)
    ? (value as Lang)
    : "ko";

  const store = await cookies();
  store.set(LANG_COOKIE, lang, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/* 아래 두 개는 dss-auth OIDC 연결 시 폐기 대상                          */
/* ------------------------------------------------------------------ */

export async function devLoginAsAction(formData: FormData): Promise<void> {
  if (!devLoginEnabled()) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/"));

  const user = await findDevUser(userId);
  if (!user || !user.isActive) redirect("/login?error=1");

  await touchLogin(user.id);
  await createSession(user.id);
  await writeAudit({
    actor: user,
    action: "LOGIN",
    summary: `${user.displayName} 로그인 (임시 로그인)`,
  });

  redirect(returnTo);
}

export async function devLoginNewAction(formData: FormData): Promise<void> {
  if (!devLoginEnabled()) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/"));

  if (!name) redirect("/login?error=1");

  const user = await upsertDevViewer(name);
  await createSession(user.id);
  await writeAudit({
    actor: user,
    action: "LOGIN",
    summary: `${user.displayName} 로그인 (임시 로그인 · 신규 열람자)`,
  });

  redirect(returnTo);
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await writeAudit({
      actor: user,
      action: "LOGOUT",
      summary: `${user.displayName} 로그아웃`,
    });
  }
  await destroySession();
  redirect("/login");
}
