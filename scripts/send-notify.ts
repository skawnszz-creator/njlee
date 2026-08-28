/**
 * 교정 기한 알림 메일 발송.
 *
 *   npm run send-notify                  매달 1일에만 실제로 나간다
 *   npm run send-notify -- --dry         보내지 않고 무엇이 나갈지만 본다
 *   npm run send-notify -- --force       1일이 아니어도, 이미 보냈어도 보낸다
 *   npm run send-notify -- --ym=2027-01  그 기한을 대상으로 (재발송·확인용)
 *
 * 작업 스케줄러에 **매일** 걸어 두면 된다. 1일이 아닌 날은 아무것도 하지 않는다.
 * 날짜 계산을 스케줄러가 아니라 이 안에서 하는 이유는, 스케줄러 설정이
 * 어딘가에서 조용히 바뀌어도 규칙은 코드에 남아 있게 하기 위해서다.
 *
 * 같은 기한을 두 번 보내지 않는다 — web_notifications 에 성공 기록이 있으면 건너뛴다.
 * PowerShell 이 아니라 TypeScript 로 작성한다 — NAS 리눅스 컨테이너에서도 돌아야 한다.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { EOL } from "node:os";
import path from "node:path";

import postgres from "postgres";

process.loadEnvFile(".env.local");

/**
 * 화면에 찍은 것을 그대로 로그 파일에도 남긴다 (백업 스크립트와 같은 방식).
 * 작업 스케줄러로 돌 때는 아무도 화면을 보지 않는다. 1일이 아니라 그냥
 * 끝난 날도 남겨 두어야 "돌기는 했는지" 를 나중에 알 수 있다.
 */
const logLines: string[] = [];
function say(line = ""): void {
  console.log(line);
  logLines.push(line);
}

async function flushLog(ok: boolean): Promise<void> {
  try {
    const dir = path.join(process.cwd(), "logs");
    await mkdir(dir, { recursive: true });
    const head = `===== ${new Date().toISOString()} ${ok ? "성공" : "실패"} =====`;
    await appendFile(
      path.join(dir, "notify.log"),
      [head, ...logLines, ""].join(EOL),
      "utf8",
    );
  } catch {
    // 로그를 못 남기는 것이 발송 자체를 실패로 만들지는 않게 한다.
  }
}

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

/** --ym=2027-01 로 기한을 직접 정한다. 없으면 오늘로부터 계산한다. */
const GIVEN_YM = (() => {
  const arg = process.argv.find((a) => a.startsWith("--ym="));
  if (!arg) return null;
  const value = arg.slice("--ym=".length);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    console.error(`--ym 은 YYYY-MM 형식이어야 합니다: ${value}`);
    process.exit(1);
  }
  return value;
})();

async function main() {
  // 배치 전용 연결. 앱과 같은 풀을 쓰지 않는다.
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    const { addMonths, currentDate } = await import("../src/lib/meters");
    const { listNotifyTargets, notifyTargetYm } = await import("../src/lib/notify");
    const { alreadySent, listActiveRecipients } = await import(
      "../src/lib/notify-admin"
    );
    const { loadTemplate, renderNotifyMail } = await import(
      "../src/lib/mail/notify-mail"
    );
    const { createTransport, fromAddress } = await import(
      "../src/lib/mail/transport"
    );
    const { db } = await import("../src/lib/db");
    const { webAuditLogs, webNotifications } = await import(
      "../src/lib/db/schema"
    );

    const today = currentDate();
    const scheduled = notifyTargetYm(today);

    if (!scheduled && !FORCE && !GIVEN_YM) {
      say(`${today} — 매달 1일이 아닙니다. 보낼 것이 없습니다.`);
      return;
    }

    const ym = GIVEN_YM ?? scheduled ?? addMonths(today.slice(0, 7), 1);

    if (!FORCE && (await alreadySent(ym))) {
      say(`${ym} 기한은 이미 보냈습니다. 두 번 보내지 않습니다.`);
      return;
    }

    const [meters, recipients] = await Promise.all([
      listNotifyTargets(ym),
      listActiveRecipients(),
    ]);

    say(`오늘        ${today}`);
    say(`대상 기한   ${ym}`);
    say(`계측기      ${meters.length}대`);
    say(`받는 사람   ${recipients.length}명`);
    say("");

    if (meters.length === 0) {
      say("알릴 계측기가 없습니다. 메일을 보내지 않습니다.");
      return;
    }
    if (recipients.length === 0) {
      say("받는 사람이 없습니다. 설정 화면에서 등록하세요.");
      say("  http://localhost:3200/settings/notify");
      return;
    }

    const url = (process.env.SITE_URL ?? "http://localhost:3200").replace(
      /\/$/,
      "",
    );

    // 언어별로 한 번씩만 만든다. 같은 언어를 쓰는 사람이 여럿이어도 본문은 하나다.
    const bodies = new Map<string, Awaited<ReturnType<typeof renderNotifyMail>>>();
    for (const lang of new Set(recipients.map((r) => r.lang))) {
      const l = lang === "ja" ? "ja" : "ko";
      bodies.set(
        lang,
        renderNotifyMail({
          meters,
          ym,
          lang: l,
          url,
          template: await loadTemplate(l),
        }),
      );
    }

    if (DRY) {
      for (const [lang, mail] of bodies) {
        const who = recipients.filter((r) => r.lang === lang).map((r) => r.email);
        say(`[${lang}] ${mail.subject}`);
        say(`      → ${who.join(", ")}`);
      }
      say("");
      say("--dry 라서 실제로 보내지 않았습니다.");
      return;
    }

    const transport = createTransport();
    let sent = 0;
    const failures: string[] = [];

    try {
      for (const person of recipients) {
        const mail = bodies.get(person.lang)!;
        try {
          await transport.sendMail({
            from: fromAddress(),
            to: person.name ? `${person.name} <${person.email}>` : person.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
          sent += 1;
          say(`  보냄  ${person.email}`);
        } catch (error) {
          // 한 사람에게 실패해도 나머지는 보낸다.
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${person.email}: ${message}`);
          say(`  실패  ${person.email} — ${message}`);
        }
      }
    } finally {
      transport.close();
    }

    // 한 명이라도 보냈으면 성공으로 남긴다. 전부 실패면 실패로 남기고
    // 다음 번 실행에서 다시 시도할 수 있게 한다.
    await db.insert(webNotifications).values({
      targetYm: ym,
      sentOn: today,
      meterCount: meters.length,
      recipientCount: sent,
      result: sent > 0 ? "SENT" : "FAILED",
      error: failures.length > 0 ? failures.join(" / ").slice(0, 2000) : null,
    });

    // 중요한 행위는 감사 로그에도 남긴다. 배치라 사람(actor)이 없다.
    // writeAudit 는 next/headers 를 쓰므로 여기서는 직접 넣는다.
    await db.insert(webAuditLogs).values({
      actorUserId: null,
      actorName: "(알림 배치)",
      action: "NOTIFY_SEND",
      entityType: "web_notifications",
      summary: `교정 기한 알림: ${ym} ${meters.length}대 → ${sent}명`,
      changes: { targetYm: ym, sent, failed: failures.length },
    });

    say("");
    say(
      sent > 0
        ? `=> ${sent}명에게 보냈습니다.${failures.length ? ` (${failures.length}명 실패)` : ""}`
        : "=> 아무에게도 보내지 못했습니다. npm run check-smtp 로 확인하세요.",
    );
    if (sent === 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main()
  .then(() => flushLog(process.exitCode !== 1))
  .catch(async (error) => {
    // 터져도 조용히 끝나지 않게 한다. 스케줄러는 화면을 보지 않는다.
    say(`오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    await flushLog(false);
  });
