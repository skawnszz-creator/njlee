/**
 * 알림 설정 화면이 쓰는 조회들.
 *
 * 화면(page.tsx)에서 DB 를 직접 만지지 않는다. 발송 배치도 같은 함수를 써서
 * "화면에서 본 수신자"와 "실제로 받는 사람"이 어긋나지 않게 한다.
 */
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  webNotifications,
  webNotifyRecipients,
  type WebNotification,
  type WebNotifyRecipient,
} from "@/lib/db/schema";

/** 실제로 메일을 받을 사람들. 꺼 둔 사람과 지운 사람은 빠진다. */
export async function listActiveRecipients(): Promise<WebNotifyRecipient[]> {
  return db
    .select()
    .from(webNotifyRecipients)
    .where(
      and(
        eq(webNotifyRecipients.isDeleted, false),
        eq(webNotifyRecipients.isActive, true),
      ),
    )
    .orderBy(asc(webNotifyRecipients.email));
}

/** 설정 화면에 보일 목록. 꺼 둔 사람도 보인다. */
export async function listRecipients(): Promise<WebNotifyRecipient[]> {
  return db
    .select()
    .from(webNotifyRecipients)
    .where(eq(webNotifyRecipients.isDeleted, false))
    .orderBy(asc(webNotifyRecipients.email));
}

/** 최근 발송 기록 */
export async function listNotifications(limit = 12): Promise<WebNotification[]> {
  return db
    .select()
    .from(webNotifications)
    .orderBy(desc(webNotifications.createdAt))
    .limit(limit);
}

/** 그 기한을 이미 성공적으로 보냈는지. 배치가 두 번 도는 것을 막는다. */
export async function alreadySent(targetYm: string): Promise<boolean> {
  const rows = await db
    .select({ id: webNotifications.id })
    .from(webNotifications)
    .where(
      and(
        eq(webNotifications.targetYm, targetYm),
        eq(webNotifications.result, "SENT"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
