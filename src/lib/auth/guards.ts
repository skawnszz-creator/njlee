/**
 * 권한 판정은 여기서만 한다.
 *
 * 클라이언트가 보낸 사용자 ID·역할은 절대 믿지 않는다.
 * 폼 필드·쿼리스트링·요청 본문에 담겨 온 값으로 권한을 판정하지 않는다.
 * 화면에서 버튼을 숨기는 것은 UI 편의일 뿐이고, 실제 차단은 반드시 서버에서 한다.
 */
import { redirect } from "next/navigation";

import type { WebUser } from "@/lib/db/schema";
import { getSessionUser } from "./session";

/**
 * 로그인 후 돌아갈 주소를 안전하게 다듬는다.
 *
 * '/'로 시작하고 '//'로 시작하지 않는 경로만 허용한다.
 * '//evil.com' 은 브라우저가 프로토콜 상대 URL 로 해석하므로 반드시 함께 막는다.
 * 역슬래시가 섞인 값도 거절한다.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  return value;
}

/** 로그인 필수. 없으면 로그인 화면으로 보낸다. */
export async function requireSession(returnTo?: string): Promise<WebUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = safeReturnTo(returnTo);
    redirect(
      target === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(target)}`,
    );
  }
  return user;
}

/** 관리자 필수. 열람자가 접근하면 목록으로 돌려보낸다. */
export async function requireAdmin(returnTo?: string): Promise<WebUser> {
  const user = await requireSession(returnTo);
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}

export function isAdmin(user: Pick<WebUser, "role"> | null): boolean {
  return user?.role === "ADMIN";
}
