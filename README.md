# DSS 계측기 관리 시스템

사내 계측기 목록과 교정 기한을 관리하는 웹사이트.

- 요구사항: [REQUIREMENTS.md](./REQUIREMENTS.md)
- 설계: [DESIGN.md](./DESIGN.md)

---

## 매일 쓰는 방법

### 1. 데이터베이스 켜기

PC를 껐다 켜면 PostgreSQL 이 꺼져 있다. 아래를 실행한다.

```
"C:\Users\이남준\pgsql\bin\pg_ctl.exe" -D C:\pgdata -l C:\pgdata\server.log start
```

이미 켜져 있는지 확인:

```
"C:\Users\이남준\pgsql\bin\pg_ctl.exe" -D C:\pgdata status
```

### 2. 웹사이트 켜기

```
cd C:\Users\이남준\dss-meters
npm run dev
```

브라우저에서 **http://localhost:3200** 으로 접속한다.

같은 사무실의 다른 PC 에서 보려면 `http://<이 PC 의 IP>:3200` 으로 접속한다.
(윈도우 방화벽에서 3200 포트를 열어야 할 수 있다)

### 3. 끄기

웹사이트는 `Ctrl+C`. 데이터베이스는:

```
"C:\Users\이남준\pgsql\bin\pg_ctl.exe" -D C:\pgdata stop
```

---

## 로그인

지금은 **임시 로그인**이다. 통합 로그인 포털(dss-auth)의 OIDC 기능이 완성되면
`src/lib/auth/dev-login.ts` 와 로그인 화면의 임시 UI 를 지우고 `oidc.ts` 로 갈아끼운다.

- 임시 로그인은 `.env.local` 의 `DEV_FAKE_LOGIN_ENABLED=true` 일 때만 뜬다. 기본값은 꺼짐.
- 이남준 님 계정은 **관리자**로 등록되어 있다. 새 이름으로 들어오면 **열람자**가 된다.

---

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (3200 포트) |
| `npm run build` | 배포용 빌드 |
| `npm run db:generate` | 스키마를 고친 뒤 마이그레이션 SQL 생성 |
| `npm run db:migrate` | 마이그레이션을 DB 에 적용 |
| `npm run db:studio` | 브라우저로 DB 내용 보기 |
| `npm run seed` | 엑셀 데이터 이관 (이미 들어 있으면 아무것도 하지 않음) |
| `npm run seed -- --reset` | **기존 계측기 데이터를 지우고** 다시 이관 |

빌드가 SWC/Turbopack 에서 막히면 `next dev --webpack` / `next build --webpack` 을 쓴다.

---

## 지금까지 만든 것 (1차)

- 계측기 목록 — 검색 · 자산구분/상태 필터 · 교정기한 임박순 정렬 · 색상 경고
- 계측기 상세 — 본체/부속품 사진 포함
- 계측기 등록 / 수정 / 삭제 (관리자만, 삭제는 소프트 삭제)
- 한국어 ↔ 일본어 화면 전환 (계측기명·상태 번역)
- 엑셀 이관 — 계측기 79대, 사진 113건
- 임시 로그인, 관리자/열람자 권한 분리, 감사 로그

## 아직 안 만든 것

- **2차**: 교정 이력 누적, 교정 성적서 PDF 업로드·조회, 엑셀 내보내기, 사진 등록 화면
- **3차**: 교정 기한 메일 알림(cafe24 SMTP), dss-auth 통합 로그인 실제 연결

---

## 주의

- `.env.local` 에 DB 비밀번호가 들어 있다. **git 에 올리지 않는다.**
- 사진·성적서 파일은 DB 가 아니라 `FILE_STORAGE_ROOT`(현재 `C:/WEB-DATA/dss-meters`) 아래에 있다.
  **DB 를 백업할 때 이 폴더도 함께 백업해야 한다.**
- 원본 엑셀과 NAS 의 성적서 폴더는 읽기만 했고 손대지 않았다.
