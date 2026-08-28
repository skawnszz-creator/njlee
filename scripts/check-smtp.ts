/**
 * 메일 서버에 로그인만 해 본다.
 *
 *   npm run check-smtp
 *
 * **메일은 보내지 않는다.** 접속 → STARTTLS → 로그인까지만 하고 끊는다.
 * cafe24 는 비밀번호를 바꾸면 서버에 반영될 때까지 최대 30분쯤 걸리고,
 * 웹메일의 「POP3/SMTP 사용설정」에서 SMTP 를 켜 두어야 한다.
 * 알림 메일이 안 나갈 때 가장 먼저 돌려 볼 것.
 *
 * PowerShell 이 아니라 TypeScript 로 작성한다 — NAS 리눅스 컨테이너에서도 돌아야 한다.
 */
import { constants } from "node:crypto";

import nodemailer from "nodemailer";

process.loadEnvFile(".env.local");

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`환경변수 ${name} 이(가) 없습니다. .env.local 을 확인하세요.`);
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  const host = required("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? 587) || 587;
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASSWORD");

  console.log("메일 서버 확인");
  console.log(`  서버   ${host}:${port}`);
  console.log(`  계정   ${user}`);
  console.log(`  비번   ${"*".repeat(pass.length)} (${pass.length}자)`);
  console.log("");

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: {
      servername: host,
      minVersion: "TLSv1",
      ciphers: "DEFAULT:@SECLEVEL=0",
      secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      rejectUnauthorized: false,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    await transport.verify();
    console.log("=> 로그인 성공. 알림 메일을 보낼 수 있습니다.");
    process.exit(0);
  } catch (error) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    console.log(`=> 실패: ${e.message ?? error}`);
    console.log("");

    if (e.responseCode === 535) {
      console.log("비밀번호를 거절당했습니다. 이 순서로 확인하세요.");
      console.log("  1) 웹메일에 그 비밀번호로 직접 로그인이 되는지");
      console.log("  2) 환경설정 → POP3/SMTP 사용설정 에서 SMTP 연결이 '사용함' 인지");
      console.log("  3) 비밀번호를 방금 바꿨다면 30분쯤 기다렸다가 다시");
    } else if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      console.log("서버에 닿지 못했습니다. 주소와 포트를 확인하세요.");
      console.log("  cafe24 는 465 가 닫혀 있습니다. 587 을 씁니다.");
    } else if (e.code === "ESOCKET") {
      console.log("TLS 협상에서 막혔습니다. 포트가 587 인지 확인하세요.");
    }
    process.exit(1);
  } finally {
    transport.close();
  }
}

void main();
