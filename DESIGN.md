# DSS 계측기 관리 시스템 — 설계안

- 작성일: 2026-08-27
- 근거: `REQUIREMENTS.md` (2026-08-27 승인)
- 상태: **승인 대기**

---

## 1. 화면 흐름

```
                    로그인 안 된 상태
                          |
                          v
                    /login  (공개 구간)
        1차: 임시 로그인 폼  →  나중에: 포털로 리다이렉트
                          |
                     세션 쿠키 발급
                          v
   ============ 여기부터 사내 구간 (세션 필수) ============
                          |
                          v
                  /  계측기 목록  ← 첫 화면
                  |
      +-----------+-----------+------------------+
      |                       |                  |
      v                       v                  v
 /meters/[id]           /meters/new        (목록에서 삭제)
   상세 보기              등록 [관리자]        [관리자]
      |
      v
 /meters/[id]/edit
   수정 [관리자]
```

- **공개 구간은 `/login` 하나뿐이다.** 나머지 전부 세션 검증 필수.
- 세션 없이 보호된 주소에 접근하면 `/login?returnTo=...` 로 보낸다.
  `returnTo`는 **`/`로 시작하고 `//`·역슬래시가 없는 경로만** 허용한다 (오픈 리다이렉트 차단).

---

## 2. 화면별 설계

### 2-1. 계측기 목록 `/` — 첫 화면

```
┌────────────────────────────────────────────────────────────────────┐
│  계측기 관리                          [한국어 ▾]  이남준 님  로그아웃 │
├────────────────────────────────────────────────────────────────────┤
│  전체 79대 · 기한초과 8 · 이번달~다음달 3 · 교정진행중 0            │
├────────────────────────────────────────────────────────────────────┤
│ [검색: 자산번호·명칭·제조사·모델·S/N        ]                       │
│ 자산: (전체) DSS  교산      상태: (전체) 사용중 교정중 기한초과 …    │
│                                              [+ 계측기 등록] 관리자만│
├────────────────────────────────────────────────────────────────────┤
│ 자산번호 │ 계측기명           │ 제조사   │ 모델    │ 교정기한│ 상태 │
│ DS0008   │ Power Sensor       │ BIRD     │ 4027A   │ 2021-04 │ 기한 │ ← 빨강
│ DS0053   │ HV-PROBE           │NorthStar │PVM-12HF │ 2026-08 │ 사용중│ ← 주황
│ DS0006   │ Power Sensor       │ BIRD     │ 4028A   │ 2026-10 │ 사용중│
│ DS0004   │ DIGITAL OSCILLO…   │Tektronix │TDS3054C │ 2027-01 │ 사용중│
│ DS0002   │ 56kW Dummy load    │ -        │ TP-370  │    -    │ 대상외│ ← 회색
└────────────────────────────────────────────────────────────────────┘
```

- **기본 정렬**: 교정기한 오름차순 (기한 없는 것은 맨 뒤)
- **색상 규칙**

  | 조건 | 표시 |
  |---|---|
  | 교정기한이 이번 달보다 이전 | 빨강 (행 전체) |
  | 교정기한이 이번 달 또는 다음 달 | 주황 |
  | 상태가 `교정대상아님` 또는 기한 없음 | 회색 |
  | 그 외 | 기본 |

- **검색**: 자산번호 · 계측기명(한/일) · 제조사 · 모델명 · S/N · 관리번호 부분일치
- **행 클릭** → 상세 화면
- 79건뿐이라 **페이지 나누기 없이 한 화면에** 전부 보여준다

> ⚠️ **제가 추가한 것**: 맨 위 한 줄 요약 배지(`전체 79대 · 기한초과 8 …`).
> "첫 화면은 전체 목록"이라고 하셨으니 목록은 그대로 두되, 한 줄만 얹었습니다.
> 필요 없으시면 빼겠습니다.

### 2-2. 계측기 상세 `/meters/[id]`

```
┌────────────────────────────────────────────────────────────────────┐
│ ← 목록으로                                    [수정] [삭제] 관리자만│
├────────────────────────────────────────────────────────────────────┤
│  DS0004   DIGITAL OSCILLOSCOPE                        ● 사용중      │
├──────────────────────────────┬─────────────────────────────────────┤
│  자산 구분   DSS 자산         │   [ 본체 사진 ]   [ 부속품 사진 ]   │
│  제작회사    Tektronix        │                                     │
│  모델/규격   TDS 3054C        │      (클릭하면 크게)                │
│  관리번호    DSS 資産         │                                     │
│  교정기한    2027-01          │                                     │
│  수량        1                │                                     │
│  S/N         C010695          │                                     │
│  비고        -                │                                     │
├──────────────────────────────┴─────────────────────────────────────┤
│  마지막 수정  2026-08-27  이남준                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2-3. 등록 `/meters/new` · 수정 `/meters/[id]/edit` — 관리자만

- 입력 항목: 자산번호* · 계측기명(한국어)* · 계측기명(일본어) · 제작회사 · 모델/규격 ·
  자산구분* · 관리번호 · 교정기한(`YYYY-MM`) · 수량 · S/N · 상태* · 비고
- **자산번호 중복 검사** (삭제되지 않은 것 중에서)
- 교정기한은 **년·월 선택기** (달력 아님)
- 사진 등록은 **2차** — 1차에서는 이관된 사진 보기만

### 2-4. 삭제

- 실제로 지우지 않는다. **삭제 사유를 입력받고** 목록에서 감춘다.
- 복원은 1차에서 화면으로 제공하지 않는다 (DB에 남아 있으므로 필요 시 복구 가능).

### 2-5. 로그인 `/login`

- **1차(임시)**: 이름 입력 + 역할 선택(관리자/열람자) → 세션 발급
  - `DEV_FAKE_LOGIN_ENABLED=true` 일 때만 이 폼이 뜬다. **기본값은 꺼짐.**
- **나중에**: 버튼 하나 → 포털 `/authorize` 로 리다이렉트

### 2-6. 언어 전환

- 우측 상단 드롭다운 `한국어 / 日本語`
- 선택값은 **쿠키 `lang`** 에 저장 (URL은 바뀌지 않음)
- 번역 대상: **화면 글자 전체 + 계측기명 + 상태**
- 일본어 계측기명이 비어 있으면 **한국어를 그대로 표시**

---

## 3. 데이터 구조

### 3-1. `web_meters` — 계측기 (중심 테이블)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `asset_no` | text | 자산번호 `DS0002`. 삭제되지 않은 것 중 **중복 불가** |
| `name_ko` | text NOT NULL | 계측기명 (한국어) |
| `name_ja` | text NULL | 계측기명 (일본어). 비면 한국어 표시 |
| `maker` | text NULL | 제작회사 |
| `model` | text NULL | 모델명 / 규격 |
| `asset_owner` | text NOT NULL | `DSS` 또는 `KYOSAN` |
| `control_no` | text NULL | 관리번호 |
| `calibration_due_ym` | char(7) NULL | **`2027-01` 형식.** CHECK 제약으로 형식 강제 |
| `quantity` | integer NOT NULL default 1 | |
| `serial_no` | text NULL | S/N |
| `status` | text NOT NULL default `IN_USE` | 아래 6가지 |
| `note` | text NULL | 비고 |
| `sort_order` | integer | 엑셀 원래 순서 보존 |
| `created_at` / `updated_at` | timestamptz | |
| `is_deleted` / `deleted_at` / `deleted_by` / `delete_reason` | | 소프트 삭제 4종 |

**상태값** (DB에는 영문 코드, 화면 글자는 번역 파일에서)

| 코드 | 한국어 | 日本語 |
|---|---|---|
| `IN_USE` | 사용중 | 使用中 |
| `CALIBRATING` | 교정진행중 | 校正進行中 |
| `EXPIRED` | 기한초과(사용금지) | 期限切れ（使用禁止） |
| `BROKEN` | 고장(교정불가) | 故障（校正不可） |
| `NOT_SUBJECT` | 교정대상아님 | 校正対象外 |
| `RETURNED` | 반납·발송 | 返却・発送 |

> **왜 `2027-01`을 날짜가 아닌 글자로 저장하나:**
> 날짜 타입으로 넣으면 "1일"이라는 없는 정보가 생기고, 서버와 NAS의 시간대가 다를 때
> 하루씩 밀리는 문제가 생깁니다. 글자로 저장해도 정렬·비교는 그대로 됩니다.

**인덱스**

- `asset_no` 부분 UNIQUE (`WHERE is_deleted = false`)
- `WHERE is_deleted = false` 부분 인덱스
- `calibration_due_ym`, `status`, `asset_owner`

### 3-2. `web_meter_photos` — 계측기 사진

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `meter_id` | uuid → web_meters | |
| `kind` | text | `BODY`(본체) 또는 `ACCESSORY`(부속품) |
| `file_path` | text | **상대경로만.** `meters/<계측기uuid>/<사진uuid>.jpg` |
| `original_name` | text | 원본 파일명 (DB에만 보관) |
| `mime_type` | text | |
| `size_bytes` | integer | |
| `sort_order` | integer | |
| `created_at` / `updated_at` + 소프트 삭제 4종 | | |

### 3-3. `web_users` — 이 사이트 이용자

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `auth_sub` | uuid UNIQUE | **포털 사용자 ID.** 사람을 잇는 유일한 열쇠 |
| `display_name` | text | 로그인할 때마다 갱신 |
| `email` | text NULL | 로그인할 때마다 갱신 |
| `role` | text | `ADMIN` 또는 `VIEWER`. **기본값 `VIEWER`** |
| `is_active` | boolean | |
| `last_login_at` | timestamptz NULL | |
| `created_at` / `updated_at` + 소프트 삭제 4종 | | |

- 처음 보는 사람이 로그인하면 **자동으로 행을 만들되 역할은 `VIEWER`**.
- `ADMIN` 승격은 DB에서 직접 (1차에는 화면 없음). 이남준 님 계정은 초기 데이터로 넣는다.

### 3-4. `web_sessions` — 세션 (서버 저장형)

| 컬럼 | 설명 |
|---|---|
| `id` uuid PK | |
| `user_id` uuid → web_users | |
| `token_hash` text UNIQUE | 쿠키에는 **원문**, DB에는 **sha256만** |
| `expires_at` timestamptz | **최대 12시간** (포털 SSO 세션을 넘지 않음) |
| `revoked_at` timestamptz NULL | 즉시 차단용 |
| `ip` / `user_agent` | |
| `created_at` | |

- 쿠키 이름 **`meters_session`** (포털의 `dss_sso`와 절대 겹치지 않게)
- `httpOnly` · `sameSite: lax` · `path: /` · **`secure`는 HTTPS일 때만**
- 세션을 읽는 코드는 **`src/lib/auth/session.ts` 한 파일에만** 둔다

> **소프트 삭제 4종을 붙이지 않는 예외 테이블**: `web_sessions`, `web_audit_logs`.
> 세션은 만료·회수로 관리하고, 감사 로그는 애초에 지우지 않습니다.

### 3-5. `web_audit_logs` — 감사 로그 (append-only)

| 컬럼 | 설명 |
|---|---|
| `id` uuid PK | |
| `actor_user_id` uuid NULL | |
| `actor_name` text | 그때의 이름을 그대로 박아둠 |
| `action` text | `LOGIN` `METER_CREATE` `METER_UPDATE` `METER_DELETE` `PHOTO_DOWNLOAD` … |
| `entity_type` / `entity_id` | 대상 |
| `summary` text | 사람이 읽을 한 줄 |
| `changes` jsonb NULL | 무엇이 무엇으로 바뀌었는지 |
| `ip` text NULL | |
| `created_at` timestamptz | |

→ 2020년부터 엑셀에 손으로 적어 온 변경 이력을 **이것이 자동으로 대신한다.**

### 3-6. 관계도

```
   web_users ─┬─< web_sessions
              └─< web_audit_logs   (actor)

   web_meters ──< web_meter_photos
```

---

## 4. 파일 저장 구조

```
FILE_STORAGE_ROOT/                 ← 환경변수 (Windows: C:\WEB-DATA\dss-meters, NAS: /data)
└─ meters/
   └─ 8f3a...c1/                   ← 계측기 UUID (소문자)
      ├─ 2b91...ee.jpg             ← 사진 UUID (소문자)
      └─ 7c04...a5.jpg
```

- DB에는 **`meters/8f3a.../2b91....jpg`** 상대경로만 저장 (`/` 구분자, 전부 소문자)
- 사진은 **`GET /api/photos/[id]`** 로만 내려준다 — 세션 검증 후 스트림 전송
- `X-Content-Type-Options: nosniff` 부착
- 정적 폴더로 노출하지 않는다

---

## 5. 데이터 이관 방법

**추가 라이브러리 없이** 처리합니다. (엑셀 파싱 라이브러리를 넣지 않기 위해)

```
1단계 (지금, 1회성)   엑셀 → JSON + 사진 파일로 추출
   scripts/seed-data/meters.json      79대 정보
   scripts/seed-data/photos/*.jpg     68장
   scripts/seed-data/photo-map.json   자산번호 ↔ 사진 연결표

2단계 (TS 스크립트)   npx tsx scripts/seed.ts
   JSON을 읽어 DB에 넣고, 사진을 UUID 이름으로 저장소에 복사
```

- 규칙대로 **PowerShell 스크립트는 만들지 않습니다** (NAS에서 안 돌아감).
- `DS0016~DS0035` 처럼 **여러 대가 공유하는 사진 3건**은 해당 계측기 전부에 복사합니다.
- 원본 엑셀·NAS 폴더는 **읽기만 하고 건드리지 않습니다.**

---

## 6. 폴더 구조

```
dss-meters/
├─ REQUIREMENTS.md
├─ DESIGN.md
├─ Dockerfile                    ← NAS 배포용 (멀티스테이지)
├─ docker-compose.yml            ← 개발용 PostgreSQL
├─ drizzle.config.ts
├─ next.config.ts                ← output: "standalone"
├─ .env.example                  ← .env.local 은 git 제외
├─ drizzle/                      ← 마이그레이션 SQL (손으로 고치지 않음)
├─ scripts/
│  ├─ seed.ts                    ← 이관 스크립트
│  └─ seed-data/
└─ src/
   ├─ app/
   │  ├─ (public)/login/         ← 공개 구간
   │  ├─ (internal)/             ← 사내 구간 (layout에서 세션 가드)
   │  │  ├─ page.tsx                계측기 목록
   │  │  └─ meters/[id]/…           상세 · 등록 · 수정
   │  └─ api/
   │     ├─ auth/                   login · logout · callback(자리)
   │     └─ photos/[id]/            사진 서빙 (권한 검사)
   ├─ lib/
   │  ├─ auth/                    ← ★ OIDC 연동을 여기에만 가둔다
   │  │  ├─ session.ts               세션 읽기/쓰기 (여기 한 곳만)
   │  │  ├─ guards.ts                requireSession() · requireAdmin()
   │  │  ├─ dev-login.ts             // dss-auth OIDC 연결 시 폐기 대상
   │  │  └─ oidc.ts                  discovery · 토큰검증 (나중에 채움)
   │  ├─ db/  schema.ts · index.ts
   │  ├─ i18n/  ko.ts · ja.ts
   │  ├─ audit.ts                    감사 로그 기록
   │  └─ storage.ts                  파일 경로 계산 (path.join은 여기서만)
   └─ components/
```

---

## 7. 환경변수

| 이름 | 1차 값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `postgres://…/dss_meters` | |
| `PORT` | `3200` | |
| `FILE_STORAGE_ROOT` | `C:\WEB-DATA\dss-meters` | NAS에서는 `/data` |
| `SESSION_COOKIE_SECURE` | `false` | 사내망 HTTP 단계. HTTPS 붙이면 `true` |
| `DEV_FAKE_LOGIN_ENABLED` | `true` (개발 중만) | **기본값 꺼짐.** 포털 연결되면 삭제 |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | (비움) | 포털 완성 후 |
| `SMTP_*` | (비움) | 3차 알림용 |

- 비밀값이 없으면 **조용히 넘어가지 않고 즉시 오류를 낸다.**
- `client_secret`에 `NEXT_PUBLIC_` 을 붙이지 않는다.

---

## 8. 만드는 순서

| 순서 | 내용 |
|---|---|
| 1 | 프로젝트 생성 + Next.js 16 문서 확인 + docker compose로 DB 띄우기 |
| 2 | DB 스키마 작성 → 마이그레이션 **생성** (적용은 승인 후) |
| 3 | 세션 · 가드 · 임시 로그인 |
| 4 | 엑셀 → JSON/사진 추출 + 이관 스크립트 |
| 5 | 계측기 목록 화면 (검색·필터·색상) |
| 6 | 상세 화면 + 사진 보기 |
| 7 | 등록 / 수정 / 삭제 (관리자) |
| 8 | 한국어/일본어 전환 |
| 9 | 감사 로그 |
| 10 | Dockerfile + 배포 절차 문서 (실행은 하지 않음) |

---

## 9. 확인이 필요한 3가지

1. **목록 맨 위 한 줄 요약 배지** — 넣을까요, 뺄까요? (2-1절)
2. **삭제 복원 화면** — 1차에는 안 만들 예정입니다. 괜찮으신가요?
3. **관리자 승격** — 1차에는 화면이 없고 DB에서 직접 바꿉니다. 괜찮으신가요?

---

## 10. 승인 요청

이대로 진행해도 될지 알려주세요. 승인하시면 바로 프로젝트를 만들고 코드를 시작하겠습니다.
