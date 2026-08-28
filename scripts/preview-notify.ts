/**
 * 알림 메일이 어떻게 나갈지 미리 본다.
 *
 *   npm run preview-notify            오늘 기준 (1일이 아니면 다음 달로 가정)
 *   npm run preview-notify 2027-01    그 기한을 대상으로
 *
 * **메일은 보내지 않는다.** 대상을 뽑고 본문만 만들어 logs/ 에 저장한다.
 * 메일 서버가 아직 안 열려 있어도 본문과 대상 선정을 확인할 수 있다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

process.loadEnvFile(".env.local");

const OUT = "logs/notify-preview";

async function main() {
  // 미리보기 전용 연결. 앱과 같은 풀을 쓰지 않는다.
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    const { listNotifyTargets, notifyTargetYm } = await import("../src/lib/notify");
    const { loadTemplate, renderNotifyMail } = await import(
      "../src/lib/mail/notify-mail"
    );
    const { currentDate } = await import("../src/lib/meters");
    const { addMonths } = await import("../src/lib/meters");

    const today = currentDate();
    // 1일이 아닌 날 돌려도 뭔가 보이도록, 인자가 없으면 다음 달로 가정한다.
    const ym =
      process.argv[2] ?? notifyTargetYm(today) ?? addMonths(today.slice(0, 7), 1);

    const meters = await listNotifyTargets(ym);
    const url = (process.env.SITE_URL ?? "http://localhost:3200").replace(/\/$/, "");

    console.log(`오늘        ${today}`);
    console.log(`보내는 날   ${notifyTargetYm(today) ? "오늘 (매달 1일)" : "오늘 아님 — 실제로는 안 나간다"}`);
    console.log(`대상 기한   ${ym}`);
    console.log(`대상        ${meters.length}대`);
    console.log("");

    if (meters.length === 0) {
      console.log("보낼 것이 없습니다. 이 경우 메일을 만들지 않습니다.");
      return;
    }

    for (const m of meters) {
      console.log(`  ${m.assetNo}  ${m.nameKo}  [${m.status}]`);
    }
    console.log("");

    await mkdir(OUT, { recursive: true });
    for (const lang of ["ko", "ja"] as const) {
      const template = await loadTemplate(lang);
      const mail = renderNotifyMail({ meters, ym, lang, url, template });
      const file = path.join(OUT, `${ym}-${lang}.html`);
      await writeFile(file, mail.html, "utf8");
      console.log(`[${lang}] 제목: ${mail.subject}`);
      console.log(`      본문: ${file}`);
    }

    console.log("");
    console.log("--- 글자 본문 (한국어) ---");
    console.log(
      renderNotifyMail({
        meters,
        ym,
        lang: "ko",
        url,
        template: await loadTemplate("ko"),
      }).text,
    );
  } finally {
    await sql.end();
  }
}

void main();
