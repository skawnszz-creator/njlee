/**
 * 교정 성적서 파일명에서 정보를 읽는다.
 *
 * 교정 기관(BCS)이 파일명에 날짜와 성적서 번호를 넣어 준다.
 *   Copies_BNB014-260120B01-026 (289) (42050017).pdf
 *          └번호┘ └날짜┘         └모델┘ └─S/N─┘
 *
 * 이 파일은 다른 것을 불러오지 않는다 — 화면과 배치 스크립트 양쪽에서 쓴다.
 */

/** BNB014-260120B01-026 같은 성적서 번호 */
const CERTIFICATE_NO = /BNB\d{3}-\d{6}[A-Za-z]\d{2}-\d{3}/i;

/**
 * 날짜(YYMMDD)가 들어 있을 만한 자리들. 앞에서부터 먼저 맞는 것을 쓴다.
 * BCS 가 해마다 파일명 양식을 바꿔서 종류가 여럿이다.
 */
const DATE_PATTERNS = [
  /BNB\d{3}-(\d{6})/i, // Copies_BNB014-260120B01-026
  /(?:BNB|BCC)(\d{6})(?!\d)/i, // 0402_BCC260626-0009_R.pdf (2026년 6월부터)
  /^(\d{6})(?=[A-Za-z_.-])/, // 250529BA49.pdf
  /[-_](\d{6})(?:[A-Za-z]|\.)/, // BNB003_250131.pdf
  /(\d{6})[A-Za-z]\d{2}/, // 260120B01
];

/** 파일명에 연월일이 그대로 적혀 있는 경우: 2020.01.13 */
const FULL_DATE = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/;

export type CertificateInfo = {
  /** 교정일 'YYYY-MM-DD'. 파일명에서 못 읽으면 null */
  calibratedOn: string | null;
  certificateNo: string | null;
};

function toDate(raw: string): string | null {
  const [yy, mm, dd] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

export function readCertificateInfo(fileName: string): CertificateInfo {
  let calibratedOn: string | null = null;

  // 연월일이 그대로 적혀 있으면 그게 가장 확실하다.
  const full = FULL_DATE.exec(fileName);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      calibratedOn = `${full[1]}-${String(month).padStart(2, "0")}-${String(
        day,
      ).padStart(2, "0")}`;
    }
  }

  for (const pattern of calibratedOn ? [] : DATE_PATTERNS) {
    const match = pattern.exec(fileName);
    if (!match) continue;
    const parsed = toDate(match[1]);
    if (parsed) {
      calibratedOn = parsed;
      break;
    }
  }

  return {
    calibratedOn,
    certificateNo: CERTIFICATE_NO.exec(fileName)?.[0] ?? null,
  };
}

/** 'YYYY-MM' 에 개월 수를 더한다. */
export function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String(
    (total % 12) + 1,
  ).padStart(2, "0")}`;
}
