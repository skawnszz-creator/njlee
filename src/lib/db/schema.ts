import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* 코드값 정의                                                          */
/* DB 에는 영문 코드를 저장하고, 화면에 보일 한국어/일본어 글자는          */
/* src/lib/i18n 의 사전에서 가져온다. (상태는 번역 대상)                  */
/* ------------------------------------------------------------------ */

export const METER_STATUSES = [
  "IN_USE", // 사용중
  "CALIBRATING", // 교정진행중
  "EXPIRED", // 기한초과(사용금지)
  "BROKEN", // 고장(교정불가)
  "NOT_SUBJECT", // 교정대상아님
  "RETURNED", // 반납·발송
] as const;
export type MeterStatus = (typeof METER_STATUSES)[number];

export const ASSET_OWNERS = [
  "DSS", // DSS 자산
  "KYOSAN", // 교산(京三) 자산
] as const;
export type AssetOwner = (typeof ASSET_OWNERS)[number];

export const USER_ROLES = [
  "ADMIN", // 관리자 — 계측기 등록·수정·삭제
  "VIEWER", // 열람자 — 보기만
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PHOTO_KINDS = [
  "BODY", // 계측기 본체
  "ACCESSORY", // 부속품
] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

/**
 * 교정 결과.
 * 교정업체에서는 성적서가 발행되면 기본적으로 합격으로 본다.
 * 그래서 기본값이 PASS 다.
 */
export const CALIBRATION_RESULTS = [
  "PASS", // 합격
  "FAIL", // 부적합
  "UNKNOWN", // 모름
] as const;
export type CalibrationResult = (typeof CALIBRATION_RESULTS)[number];

export const CERT_SOURCES = [
  "IMPORT", // NAS 의 기존 성적서를 옮겨 온 것
  "UPLOAD", // 화면에서 올린 것
] as const;
export type CertSource = (typeof CERT_SOURCES)[number];

/* ------------------------------------------------------------------ */
/* 공통 컬럼                                                            */
/* ------------------------------------------------------------------ */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** 소프트 삭제 4컬럼 — 이름과 개수가 고정이다. 물리 삭제는 하지 않는다. */
const softDelete = {
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by"),
  deleteReason: text("delete_reason"),
};

/* ------------------------------------------------------------------ */
/* web_users — 이 사이트의 이용자                                       */
/* dss-auth 의 users 테이블과는 별개다. auth_sub 로만 이어진다.          */
/* ------------------------------------------------------------------ */

export const webUsers = pgTable(
  "web_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** dss-auth ID 토큰의 sub (= dss-auth users.id). 사람의 영구 식별자. */
    authSub: uuid("auth_sub").notNull(),

    /** 화면 표시용. 로그인할 때마다 최신값으로 갱신한다. */
    displayName: text("display_name").notNull(),

    /** 화면 표시용. 카카오에서 이메일은 선택 동의라 없을 수 있다. */
    email: text("email"),

    role: text("role", { enum: USER_ROLES }).notNull().default("VIEWER"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("web_users_auth_sub_uq").on(t.authSub),
    index("web_users_alive_idx")
      .on(t.role)
      .where(sql`${t.isDeleted} = false`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_sessions — 이 사이트 전용 세션 (서버 저장형)                      */
/* 쿠키에는 랜덤 토큰 원문, DB 에는 그 sha256 만 둔다.                    */
/* 이렇게 해야 문제 계정을 즉시 끊을 수 있다.                             */
/* ------------------------------------------------------------------ */

export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => webUsers.id),

    /** sha256(쿠키 토큰 원문). 원문은 DB 에 저장하지 않는다. */
    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    ip: text("ip"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("web_sessions_token_hash_uq").on(t.tokenHash),
    index("web_sessions_user_idx").on(t.userId),
    index("web_sessions_expires_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* web_meters — 계측기 (중심 테이블)                                    */
/* ------------------------------------------------------------------ */

export const webMeters = pgTable(
  "web_meters",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** 자산번호. 예: DS0002, DS0014-1 */
    assetNo: text("asset_no").notNull(),

    /** 계측기명 (한국어) */
    nameKo: text("name_ko").notNull(),

    /** 계측기명 (일본어). 비어 있으면 화면에서 한국어를 그대로 보여준다. */
    nameJa: text("name_ja"),

    /** 제작회사 */
    maker: text("maker"),

    /** 모델명 or 규격 */
    model: text("model"),

    assetOwner: text("asset_owner", { enum: ASSET_OWNERS }).notNull(),

    /** 관리번호. DSS 자산은 "DSS자산", 교산 자산은 교산 측 번호가 들어간다. */
    controlNo: text("control_no"),

    /**
     * 교정업체가 매긴 관리번호 (예: BNB014).
     * 연도가 바뀌어도 같은 계측기는 같은 번호다.
     * 성적서 파일명에 이 번호가 들어 있어 자동 연결에 쓴다.
     */
    agencyNo: text("agency_no"),

    /**
     * 교정 기한. 'YYYY-MM' 형식의 글자로 저장한다.
     * 날짜 타입을 쓰면 존재하지 않는 "일"이 생기고, 서버와 NAS 의 시간대가
     * 다를 때 하루씩 밀린다. 글자로 두어도 정렬·비교는 그대로 된다.
     */
    calibrationDueYm: varchar("calibration_due_ym", { length: 7 }),

    quantity: integer("quantity").notNull().default(1),

    serialNo: text("serial_no"),

    status: text("status", { enum: METER_STATUSES }).notNull().default("IN_USE"),

    note: text("note"),

    /** 엑셀의 원래 순서를 보존한다. */
    sortOrder: integer("sort_order").notNull().default(0),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // 살아 있는 계측기 중에서만 자산번호가 중복되지 않게 한다.
    // (삭제된 계측기의 번호는 다시 쓸 수 있다)
    uniqueIndex("web_meters_asset_no_uq")
      .on(t.assetNo)
      .where(sql`${t.isDeleted} = false`),

    index("web_meters_alive_idx")
      .on(t.sortOrder)
      .where(sql`${t.isDeleted} = false`),

    index("web_meters_due_idx").on(t.calibrationDueYm),
    index("web_meters_status_idx").on(t.status),
    index("web_meters_owner_idx").on(t.assetOwner),

    check(
      "web_meters_due_ym_format",
      sql`${t.calibrationDueYm} IS NULL OR ${t.calibrationDueYm} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check("web_meters_quantity_positive", sql`${t.quantity} >= 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_meter_photos — 계측기 사진                                       */
/* ------------------------------------------------------------------ */

export const webMeterPhotos = pgTable(
  "web_meter_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meterId: uuid("meter_id")
      .notNull()
      .references(() => webMeters.id),

    kind: text("kind", { enum: PHOTO_KINDS }).notNull(),

    /**
     * FILE_STORAGE_ROOT 기준 상대경로. 예: meters/<계측기uuid>/<사진uuid>.jpg
     * 구분자는 항상 '/', 전부 소문자. 절대경로를 넣지 않는다.
     */
    filePath: text("file_path").notNull(),

    /** 원본 파일명. 디스크에는 쓰지 않고 여기에만 보관한다. */
    originalName: text("original_name").notNull(),

    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("web_meter_photos_meter_idx")
      .on(t.meterId, t.kind, t.sortOrder)
      .where(sql`${t.isDeleted} = false`),
  ],
);

/* ------------------------------------------------------------------ */
/* web_meter_calibrations — 교정 이력                                   */
/*                                                                     */
/* 지금까지는 계측기에 "다음 교정 기한" 한 칸만 있었다.                  */
/* 교정을 새로 받으면 그 칸을 덮어쓰게 되어 언제 어디서 받았는지가        */
/* 남지 않았다. 여기에 한 건씩 쌓는다.                                   */
/* ------------------------------------------------------------------ */

export const webMeterCalibrations = pgTable(
  "web_meter_calibrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meterId: uuid("meter_id")
      .notNull()
      .references(() => webMeters.id),

    /**
     * 실제로 교정받은 날. 성적서에 날짜가 찍혀 있어 정확히 알 수 있다.
     * 시간대에 흔들리지 않게 date 타입을 문자열('2026-01-20')로 다룬다.
     */
    calibratedOn: date("calibrated_on", { mode: "string" }).notNull(),

    /** 이 교정으로 정해진 다음 기한. 목록에는 이 값이 년-월로 보인다. */
    nextDueYm: varchar("next_due_ym", { length: 7 }),

    /** 교정 기관 (예: BNB) */
    agency: text("agency"),

    /** 성적서 번호 (예: BNB014-260120B01-026) */
    certificateNo: text("certificate_no"),

    result: text("result", { enum: CALIBRATION_RESULTS })
      .notNull()
      .default("PASS"),

    note: text("note"),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("web_meter_calibrations_meter_idx")
      .on(t.meterId, t.calibratedOn)
      .where(sql`${t.isDeleted} = false`),

    check(
      "web_meter_calibrations_next_due_format",
      sql`${t.nextDueYm} IS NULL OR ${t.nextDueYm} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* web_meter_certificates — 교정 성적서 파일                            */
/* ------------------------------------------------------------------ */

export const webMeterCertificates = pgTable(
  "web_meter_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * 어느 계측기 것인지.
     * NULL 을 허용한다 — 2020년 성적서처럼 파일명만으로는 알 수 없는
     * 것들이 있다. 버리지 않고 "미등록 성적서"로 두었다가 사람이 붙인다.
     */
    meterId: uuid("meter_id").references(() => webMeters.id),

    /** 어느 교정 건의 성적서인지. 모르면 NULL. */
    calibrationId: uuid("calibration_id").references(
      () => webMeterCalibrations.id,
    ),

    /** FILE_STORAGE_ROOT 기준 상대경로. meters/<계측기uuid>/certs/<파일uuid>.pdf */
    filePath: text("file_path").notNull(),

    /** 원본 파일명. 검색과 자동 연결에 쓰므로 그대로 보관한다. */
    originalName: text("original_name").notNull(),

    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),

    source: text("source", { enum: CERT_SOURCES }).notNull().default("UPLOAD"),

    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("web_meter_certificates_meter_idx")
      .on(t.meterId)
      .where(sql`${t.isDeleted} = false`),
    index("web_meter_certificates_calibration_idx").on(t.calibrationId),
    // 같은 파일을 두 번 옮겨오지 않게 한다.
    uniqueIndex("web_meter_certificates_file_path_uq").on(t.filePath),
  ],
);

/* ------------------------------------------------------------------ */
/* web_audit_logs — 감사 로그 (append-only)                             */
/* 2020년부터 엑셀에 손으로 적어 온 변경 이력을 이것이 대신한다.           */
/* 화면에서 개별 레코드를 지울 수 있게 만들지 않는다.                     */
/* ------------------------------------------------------------------ */

export const webAuditLogs = pgTable(
  "web_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    actorUserId: uuid("actor_user_id"),
    /** 그 시점의 이름을 그대로 박아둔다. 나중에 이름이 바뀌어도 기록은 남는다. */
    actorName: text("actor_name").notNull(),

    /** LOGIN / LOGOUT / METER_CREATE / METER_UPDATE / METER_DELETE / PHOTO_DOWNLOAD ... */
    action: text("action").notNull(),

    entityType: text("entity_type"),
    entityId: uuid("entity_id"),

    /** 사람이 읽을 한 줄 요약 */
    summary: text("summary").notNull(),

    /** 무엇이 무엇으로 바뀌었는지 */
    changes: jsonb("changes"),

    ip: text("ip"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("web_audit_logs_created_idx").on(t.createdAt),
    index("web_audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type WebUser = typeof webUsers.$inferSelect;
export type WebMeter = typeof webMeters.$inferSelect;
export type WebMeterPhoto = typeof webMeterPhotos.$inferSelect;
export type WebMeterCalibration = typeof webMeterCalibrations.$inferSelect;
export type WebMeterCertificate = typeof webMeterCertificates.$inferSelect;
