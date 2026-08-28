/**
 * 계측기 리스트 엑셀.
 *
 * 화면의 목록 표를 그대로 옮긴다. 열 순서·색 기준을 화면과 같이 두어야
 * "화면에서 본 것"과 "보낸 파일"이 다른 문서처럼 보이지 않는다.
 * 손으로 관리하던 원본 엑셀의 제목·구역·범례는 따라 하지 않는다.
 *
 * 색은 화면과 같은 기준이다 — 줄 배경은 상태가 아니라 **교정기한**으로 정한다.
 * (dueLevel 과 짝이다. 한쪽을 고치면 다른 쪽도 봐야 한다)
 *
 * **인쇄에서 열이 잘리지 않는 것이 이 파일의 요건이다.**
 * A4 가로 한 장 너비에 모든 열이 들어가도록 배율을 자동으로 낮추고(fitToWidth),
 * 페이지가 넘어가도 머리글이 다시 나오게 한다(printTitlesRow).
 */
import ExcelJS from "exceljs";

import type { MeterStatus, WebMeter } from "@/lib/db/schema";
import { dictionaryFor, meterName, type Lang } from "@/lib/i18n";
import { dueLevel, type DueLevel } from "@/lib/meters";

/**
 * 열 너비. 합이 A4 가로 한 장(약 113칸)보다 조금 넓다.
 * 모자란 만큼은 엑셀이 배율을 낮춰 맞춘다 — 잘리는 것보다 작아지는 편이 낫다.
 */
const COLUMNS = [
  { key: "assetNo", width: 11 },
  { key: "name", width: 26 },
  { key: "maker", width: 13 },
  { key: "model", width: 15 },
  { key: "owner", width: 9 },
  { key: "controlNo", width: 13 },
  { key: "due", width: 9 },
  { key: "quantity", width: 5 },
  { key: "serialNo", width: 14 },
  { key: "status", width: 12 },
  { key: "note", width: 16 },
] as const;

/** 화면(Tailwind)에서 쓰는 색을 그대로 가져왔다. */
const COLOR = {
  headerBg: "FFF1F5F9", // slate-100
  headerText: "FF334155", // slate-700
  line: "FFE2E8F0", // slate-200
  overdueBg: "FFFEF2F2", // red-50
  soonBg: "FFFFFBEB", // amber-50
  overdueText: "FFB91C1C", // red-700
  soonText: "FFB45309", // amber-700
  muted: "FF94A3B8", // slate-400
} as const;

/** 상태 글자색 — 화면의 배지 색과 같은 계열로 맞췄다. */
const STATUS_COLOR: Record<MeterStatus, string> = {
  IN_USE: "FF047857", // emerald-700
  CALIBRATING: "FF0369A1", // sky-700
  EXPIRED: "FFB91C1C", // red-700
  BROKEN: "FF334155", // slate-700
  NOT_SUBJECT: "FF64748B", // slate-500
  RETURNED: "FF6D28D9", // violet-700
};

const DUE_BG: Partial<Record<DueLevel, string>> = {
  OVERDUE: COLOR.overdueBg,
  SOON: COLOR.soonBg,
};

const DUE_TEXT: Partial<Record<DueLevel, string>> = {
  OVERDUE: COLOR.overdueText,
  SOON: COLOR.soonText,
};

const THIN = { style: "thin" as const, color: { argb: COLOR.line } };

export type WorkbookInput = {
  meters: WebMeter[];
  /** 화면 언어를 따른다. 교산에 보낼 때는 일본어 화면에서 내려받는다. */
  lang: Lang;
  /** YYYY-MM-DD */
  today: string;
  /** 지금 걸려 있는 조건. 문서 위에 한 줄로 적어 둔다. */
  condition: string;
  /** 내려받은 사람 */
  author?: string | null;
};

export async function buildMeterListWorkbook({
  meters,
  lang,
  today,
  condition,
  author,
}: WorkbookInput): Promise<ArrayBuffer> {
  const t = dictionaryFor(lang);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DSS";

  const sheet = workbook.addWorksheet(t.list.printTitle, {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  COLUMNS.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });

  /* ------------------------------------------------------------ 머리말 */
  sheet.getCell("A1").value = t.list.printTitle;
  sheet.getCell("A1").font = { bold: true, size: 14 };

  sheet.getCell("A2").value = condition;
  sheet.getCell("A2").font = { size: 9, color: { argb: COLOR.muted } };

  sheet.getCell("A3").value = [
    `${t.list.total} ${meters.length}${t.common.unit}`,
    today,
    author,
  ]
    .filter(Boolean)
    .join("   ·   ");
  sheet.getCell("A3").font = { size: 9, color: { argb: COLOR.muted } };

  /* -------------------------------------------------------------- 표 */
  const HEADER_ROW = 4;
  const labels = [
    t.field.assetNo,
    t.field.name,
    t.field.maker,
    t.field.model,
    t.field.assetOwner,
    t.field.controlNo,
    t.field.calibrationDueYm,
    t.field.quantity,
    t.field.serialNo,
    t.field.status,
    t.field.note,
  ];

  const header = sheet.getRow(HEADER_ROW);
  labels.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: COLOR.headerText } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.headerBg },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  });
  header.height = 22;

  meters.forEach((meter, index) => {
    const level = dueLevel(meter, today.slice(0, 7));
    const row = sheet.getRow(HEADER_ROW + 1 + index);

    const values = [
      meter.assetNo,
      meterName(lang, meter),
      meter.maker ?? "",
      meter.model ?? "",
      t.owner[meter.assetOwner],
      meter.controlNo ?? "",
      meter.calibrationDueYm ?? "",
      meter.quantity,
      meter.serialNo ?? "",
      t.status[meter.status],
      meter.note ?? "",
    ];

    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      cell.value = value;
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      cell.alignment = {
        // 계측기명·모델·비고는 길다. 열을 넓히는 대신 줄을 접는다.
        wrapText: i === 1 || i === 3 || i === 10,
        vertical: "middle",
        horizontal: i === 7 ? "center" : "left",
      };
      cell.font = { size: 10 };

      const background = DUE_BG[level];
      if (background) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: background },
        };
      }
    });

    // 교정기한과 상태만 글자색을 준다. 화면에서 눈이 가는 두 칸이다.
    const dueText = DUE_TEXT[level];
    if (dueText) row.getCell(7).font = { size: 10, bold: true, color: { argb: dueText } };
    row.getCell(10).font = { size: 10, color: { argb: STATUS_COLOR[meter.status] } };
  });

  const lastRow = HEADER_ROW + meters.length;

  /* ---------------------------------------------------------- 인쇄 설정 */
  // 열이 잘려서 다음 장으로 넘어가지 않게 한다. 이게 이 파일의 요건이다.
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1, // 가로는 반드시 한 장
    fitToHeight: 0, // 세로는 몇 장이든
    horizontalCentered: true,
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`, // 장마다 머리글 반복
    // 인쇄 범위는 적지 않는다. 표 말고는 쓴 칸이 없어 엑셀이 알아서 잡는다.
    // 직접 적으면 exceljs 가 $ 를 어중간하게 붙여 범위가 어긋난다.
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
  sheet.headerFooter = { oddFooter: "&C&9&P / &N" };

  if (meters.length > 0) {
    sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: lastRow, column: COLUMNS.length } };
  }

  // exceljs 는 자기 Buffer 타입을 돌려준다. 실제로는 Node 의 Buffer 다.
  // Response 에 그대로 실을 수 있게 ArrayBuffer 로 옮겨 담는다.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  const out = new ArrayBuffer(written.byteLength);
  new Uint8Array(out).set(written);
  return out;
}
