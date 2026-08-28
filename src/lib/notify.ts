/**
 * 교정 기한 알림 — 누구에게 무엇을 보낼지 정하는 곳.
 *
 * 실제로 보내는 일(SMTP)은 여기서 하지 않는다. 이 파일은 "대상을 고르고
 * 본문을 만드는" 것까지만 한다. 그래야 메일 서버 없이도 시험할 수 있다.
 *
 * **보내는 시점은 기한 전달 1일이다.** 예를 들어 기한이 2027-02 인 계측기는
 * 2027-01-01 에 알린다. 기한이 닥쳐서 알리면 교정을 보낼 시간이 없다.
 */
import { and, asc, eq, inArray, not } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  webMeters,
  type MeterStatus,
  type WebMeter,
} from "@/lib/db/schema";
import { addMonths, currentDate } from "@/lib/meters";

/**
 * 알리지 않는 상태.
 *
 *   교정대상아님  더미로드 등 — 애초에 교정을 받지 않는다
 *   고장(교정불가) 고쳐서 쓸 수 없는 것
 *   반납·발송     이미 교산으로 돌려보냈다
 *   교정진행중    이미 교정 업체에 보냈다 — 또 알리면 잔소리가 된다
 */
export const NOT_NOTIFIED: MeterStatus[] = [
  "NOT_SUBJECT",
  "BROKEN",
  "RETURNED",
  "CALIBRATING",
];

/**
 * 오늘 알릴 기한(YYYY-MM). 매달 1일이 아니면 null 이다.
 *
 * null 을 돌려주는 것이 정상 동작이다. 배치는 매일 돌아도 되고,
 * 1일이 아니면 아무것도 하지 않고 끝난다.
 */
export function notifyTargetYm(today: string = currentDate()): string | null {
  if (!today.endsWith("-01")) return null;
  return addMonths(today.slice(0, 7), 1);
}

/** 그 기한에 걸린 계측기들. 자산번호 순. */
export async function listNotifyTargets(ym: string): Promise<WebMeter[]> {
  return db
    .select()
    .from(webMeters)
    .where(
      and(
        eq(webMeters.isDeleted, false),
        eq(webMeters.calibrationDueYm, ym),
        not(inArray(webMeters.status, NOT_NOTIFIED)),
      ),
    )
    .orderBy(asc(webMeters.assetNo));
}
