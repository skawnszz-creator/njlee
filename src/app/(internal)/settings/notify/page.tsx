import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteRecipientAction,
  toggleRecipientAction,
} from "@/app/actions/notify";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MailTemplateForm } from "@/components/MailTemplateForm";
import { RecipientForm } from "@/components/RecipientForm";
import { isAdmin } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { getDictionary, LANGUAGE_LABEL, LANGUAGES } from "@/lib/i18n";
import { loadTemplate } from "@/lib/mail/notify-mail";
import { addMonths, currentDate } from "@/lib/meters";
import { listNotifications, listRecipients } from "@/lib/notify-admin";
import { listNotifyTargets, notifyTargetYm } from "@/lib/notify";

const CARD = "rounded-lg border border-slate-200 bg-white";
const CARD_HEAD =
  "flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3";

const TH =
  "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500";
const TD = "whitespace-nowrap px-3 py-2 text-sm";

/**
 * 교정 기한 알림 설정.
 *
 * 관리자만 본다. 여기서 정하는 것은 세 가지다 —
 * 누가 받을지, 어떤 말로 보낼지, 지금까지 무엇이 나갔는지.
 */
export default async function NotifySettingsPage() {
  const { lang, t } = await getDictionary();
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  const today = currentDate();
  // 미리보기용 숫자. 오늘이 1일이 아니어도 감이 오도록 다음 달을 쓴다.
  const sampleYm = notifyTargetYm(today) ?? addMonths(today.slice(0, 7), 1);

  const [recipients, history, targets, koTemplate, jaTemplate] =
    await Promise.all([
      listRecipients(),
      listNotifications(),
      listNotifyTargets(sampleYm),
      loadTemplate("ko"),
      loadTemplate("ja"),
    ]);

  const templates = { ko: koTemplate, ja: jaTemplate };
  const active = recipients.filter((r) => r.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← {t.common.back}
        </Link>
      </div>

      {/* 언제 무엇이 나가는지 */}
      <div className={`${CARD} px-5 py-4`}>
        <h1 className="text-lg font-semibold text-slate-900">교정 기한 알림</h1>
        <p className="mt-1 text-sm text-slate-600">
          교정 기한이 <strong>다음 달</strong>인 계측기를 매달{" "}
          <strong>1일</strong>에 메일로 알립니다. 기한이 닥쳐서 알리면 교정을 보낼
          시간이 없기 때문입니다.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          지금 기준으로 다음에 나갈 것은{" "}
          <strong className="text-slate-900">
            {sampleYm} 기한 {targets.length}
            {t.common.unit}
          </strong>
          , 받는 사람은 <strong className="text-slate-900">{active}명</strong>
          입니다.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          교정대상아님 · 고장(교정불가) · 반납·발송 · 교정진행중 상태는 알리지
          않습니다.
        </p>
      </div>

      {/* 받는 사람 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h2 className="text-base font-semibold text-slate-900">받는 사람</h2>
          <span className="tabular text-sm text-slate-400">
            {recipients.length}
          </span>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <RecipientForm />
        </div>

        {recipients.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            받는 사람이 없습니다. 한 명도 없으면 메일이 나가지 않습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className={TH}>메일 주소</th>
                  <th className={TH}>이름</th>
                  <th className={TH}>메일 언어</th>
                  <th className={TH}>받기</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipients.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "bg-slate-50"}>
                    <td className={`${TD} text-slate-900`}>{r.email}</td>
                    <td className={`${TD} text-slate-600`}>
                      {r.name ?? t.common.none}
                    </td>
                    <td className={`${TD} text-slate-600`}>
                      {LANGUAGE_LABEL[r.lang as "ko" | "ja"] ?? r.lang}
                    </td>
                    <td className={TD}>
                      {/* 지우지 않고 잠시 끄고 켜는 자리 */}
                      <form action={toggleRecipientAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            r.isActive
                              ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                              : "bg-slate-200 text-slate-500 ring-slate-300"
                          }`}
                        >
                          {r.isActive ? "받음" : "받지 않음"}
                        </button>
                      </form>
                    </td>
                    <td className={`${TD} text-right`}>
                      <form action={deleteRecipientAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton
                          message={`${r.email}\n\n${t.common.delete}?`}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          {t.common.delete}
                        </ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 메일 문구 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h2 className="text-base font-semibold text-slate-900">메일 문구</h2>
          <span className="text-xs text-slate-400">
            계측기 표는 자동으로 붙습니다. 여기서는 말만 고칩니다.
          </span>
        </div>
        <div className="grid gap-8 px-5 py-4 lg:grid-cols-2">
          {LANGUAGES.map((l) => (
            <MailTemplateForm
              key={l}
              lang={l}
              langLabel={LANGUAGE_LABEL[l]}
              template={templates[l]}
              sampleYm={sampleYm}
              sampleCount={targets.length}
            />
          ))}
        </div>
      </div>

      {/* 발송 기록 */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h2 className="text-base font-semibold text-slate-900">발송 기록</h2>
          <span className="tabular text-sm text-slate-400">
            {history.length}
          </span>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            아직 보낸 적이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className={TH}>보낸 날</th>
                  <th className={TH}>대상 기한</th>
                  <th className={TH}>계측기</th>
                  <th className={TH}>받은 사람</th>
                  <th className={TH}>결과</th>
                  <th className={TH}>비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className={`${TD} tabular text-slate-900`}>{h.sentOn}</td>
                    <td className={`${TD} tabular text-slate-700`}>
                      {h.targetYm}
                    </td>
                    <td className={`${TD} tabular text-slate-600`}>
                      {h.meterCount}
                      {t.common.unit}
                    </td>
                    <td className={`${TD} tabular text-slate-600`}>
                      {h.recipientCount}명
                    </td>
                    <td className={TD}>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          h.result === "SENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {h.result === "SENT" ? "보냄" : "실패"}
                      </span>
                    </td>
                    <td
                      className={`${TD} max-w-[22rem] truncate text-slate-500`}
                      title={h.error ?? ""}
                    >
                      {h.error ?? formatDateTime(h.createdAt, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
