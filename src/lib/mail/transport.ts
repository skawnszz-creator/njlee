/**
 * cafe24 SMTP 연결.
 *
 * 이 파일이 cafe24 서버의 특이한 점을 혼자 떠안는다. 부르는 쪽은 몰라도 된다.
 *
 *   - 465(SSL) 포트는 아예 열려 있지 않다. **587 로 붙어 STARTTLS 로 올린다.**
 *   - 서버가 TLSv1 까지만 하고 RFC 5746(안전한 재협상)을 지원하지 않는다.
 *     요즘 Node/OpenSSL 은 이런 서버를 기본으로 거절하므로 예외를 열어 준다.
 *     사내에서 우리 메일 서버로만 나가는 연결이라 이 정도로 둔다.
 *   - smtp.cafe24.com 은 서버 3대로 분산되어 있다. 비밀번호를 바꾸면
 *     서버마다 반영 시점이 다를 수 있다 (최대 30분).
 */
import { constants } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/env";

export function createTransport(): Transporter {
  const smtp = env.smtp;

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // 587 은 평문으로 붙어 STARTTLS 로 올린다. secure:true 는 465 전용이다.
    secure: smtp.port === 465,
    requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.password },
    tls: {
      servername: smtp.host,
      minVersion: "TLSv1",
      ciphers: "DEFAULT:@SECLEVEL=0",
      secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      // 공유 호스팅이라 인증서 이름이 smtp.cafe24.com 과 다를 수 있다.
      rejectUnauthorized: false,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** 보내는 사람 표기. 받는 쪽에서 누구인지 알아보게 이름을 붙인다. */
export function fromAddress(): string {
  return `DSS 계측기 관리 <${env.smtp.from}>`;
}
