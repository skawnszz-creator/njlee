# 백업과 복구

## 왜 두 가지를 함께 백업하나

이 시스템의 데이터는 **두 곳에 나뉘어** 있다.

| | 무엇이 | 어디에 |
|---|---|---|
| 데이터베이스 | 계측기 정보 · 사용자 · 감사 로그 | `C:\pgdata` (PostgreSQL) |
| 파일 | 계측기 사진, 앞으로는 교정 성적서 PDF | `C:\WEB-DATA\dss-meters` |

**하나만 있으면 복구가 안 된다.** 사진 파일만 있으면 어느 계측기 것인지 알 수 없고,
DB 만 있으면 사진이 깨진다. 그래서 백업 스크립트가 둘을 항상 함께 가져간다.

---

## 백업하기

```
cd C:\Users\이남준\dss-meters
npm run backup
```

받는 곳은 `.env.local` 의 `BACKUP_ROOT` 다. 기본값은 NAS 안이다.

```
\\192.168.0.222\2_as센터\3. 계측기 관리\8. 계측기 관리 시스템 백업\
├─ db\
│  ├─ dss_meters_2026-08-27_1530.dump      ← 최근 30개 보관
│  └─ dss_meters_2026-08-28_0900.dump
├─ files\
│  └─ meters\<계측기uuid>\<사진uuid>.jpg    ← 새로 생긴 것만 쌓임
└─ latest.json                              ← 마지막 백업 기록
```

### 파일은 왜 날짜별로 나누지 않나

저장 파일 이름이 **UUID** 라서 한 번 만들어진 파일은 절대 바뀌지 않는다.
그래서 날짜별로 통째로 복사할 필요 없이 **새로 생긴 것만 얹으면** 된다.
NAS 용량도 아끼고, 복구할 때도 폴더 하나만 되돌리면 된다.

화면에서 사진을 지워도 백업 폴더에는 남는다. 실수로 지웠을 때 되살릴 수 있다는 뜻이다.

### 보관 기간

DB 백업은 기본 **30개**까지 보관하고 오래된 것부터 지운다.
매일 돌리면 30일치다. `.env.local` 의 `BACKUP_KEEP` 으로 바꿀 수 있다.

---

## 매일 자동으로 돌아간다 (Windows 작업 스케줄러)

**이미 등록되어 있다.** 손댈 것이 없다.

| 항목 | 값 |
|---|---|
| 작업 이름 | `계측기 관리 시스템 백업` |
| 실행 시각 | **매일 18:30** |
| 실행 내용 | `npm run backup` (시작 위치 `C:\Users\이남준\dss-meters`) |
| 놓친 실행 | PC 가 꺼져 있었으면 **다음에 켤 때 자동으로 실행**한다 |
| 실패 시 | 15분 뒤 최대 2번까지 다시 시도한다 |

### 시각을 바꾸려면

작업 스케줄러(시작 메뉴 → "작업 스케줄러") → `계측기 관리 시스템 백업` → 속성 → 트리거

명령으로 바꿔도 된다. 아래는 20:00 으로 옮기는 예다.

```powershell
Set-ScheduledTask -TaskName '계측기 관리 시스템 백업' `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '20:00')
```

### 잘 돌고 있는지 보려면

```powershell
Get-ScheduledTaskInfo -TaskName '계측기 관리 시스템 백업'
```

`LastTaskResult` 가 **0** 이면 성공이다. 0 이 아니면 아래 로그를 본다.

### 실행 로그

매번 `logs\backup.log` 에 쌓인다. 성공·실패가 줄 맨 앞에 찍힌다.

```
type "C:\Users\이남준\dss-meters\logs\backup.log"
```

> 이 로그는 이 PC 에만 남는다 (git 에 올라가지 않는다).
> 하루 15줄 정도라 오래 두어도 부담이 없다.

### 지금 당장 한 번 돌리려면

```powershell
Start-ScheduledTask -TaskName '계측기 관리 시스템 백업'
```

또는 그냥 `npm run backup`.

---

## 복구하기

### 상황 1 — 데이터를 잘못 고쳤다 / 지웠다

**먼저 백업을 되돌리기 전에 확인할 것이 있다.** 이 시스템은 **물리 삭제를 하지 않는다.**
화면에서 지운 계측기도 DB 에 그대로 남아 있고 `is_deleted` 표시만 붙는다.

```
"C:\Users\이남준\pgsql\bin\psql.exe" -h 127.0.0.1 -U postgres -d dss_meters ^
  -c "SELECT asset_no, name_ko, deleted_at, delete_reason FROM web_meters WHERE is_deleted = true;"
```

되살리려면 그 행의 `is_deleted` 를 `false` 로 돌리면 된다.
누가 언제 무엇을 바꿨는지는 `web_audit_logs` 에 남아 있다.

**백업 복구는 이 방법으로 안 될 때만 쓴다.**

### 상황 2 — DB 를 통째로 되돌려야 한다

> ⚠️ 지금 DB 의 내용이 **전부 백업 시점으로 되돌아간다.**
> 백업 이후에 등록·수정한 것은 사라진다. 실행 전에 반드시 현재 상태를 먼저 백업하라.

```
:: 1) 지금 상태를 먼저 백업 (되돌리기 위한 보험)
npm run backup

:: 2) 빈 DB 를 새로 만든다
"C:\Users\이남준\pgsql\bin\dropdb.exe"   -h 127.0.0.1 -U postgres dss_meters
"C:\Users\이남준\pgsql\bin\createdb.exe" -h 127.0.0.1 -U postgres -E UTF8 -T template0 -l C dss_meters

:: 3) 백업 파일을 되돌린다
"C:\Users\이남준\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -U postgres -d dss_meters ^
  "\\192.168.0.222\2_as센터\3. 계측기 관리\8. 계측기 관리 시스템 백업\db\dss_meters_2026-08-27_1530.dump"
```

### 상황 3 — 사진 파일이 없어졌다

백업 폴더의 `files\` 안을 `C:\WEB-DATA\dss-meters\` 로 그대로 복사한다.
폴더 구조가 같으므로 덮어쓰기만 하면 된다.

### 상황 4 — PC 가 고장나서 다른 PC 에 새로 설치한다

1. PostgreSQL 설치 후 `dss_meters` DB 생성 (README 참고)
2. GitHub 에서 코드 받기 → `npm install`
3. `.env.example` 을 복사해 `.env.local` 작성
4. `npm run db:migrate` 로 테이블 생성
5. 백업의 `db\` 최신 dump 를 `pg_restore` (상황 2 의 3번)
6. 백업의 `files\` 를 새 `FILE_STORAGE_ROOT` 로 복사

---

## 백업이 잘 되고 있는지 확인하기

`latest.json` 의 `backedUpAt` 이 최근 날짜인지 보면 된다.

```
type "\\192.168.0.222\2_as센터\3. 계측기 관리\8. 계측기 관리 시스템 백업\latest.json"
```

**한 달에 한 번은 실제로 복구가 되는지 확인해 보는 것이 좋다.**
백업이 돌고 있다는 것과 그 백업으로 복구가 된다는 것은 다른 이야기다.
확인용 DB(`dss_meters_test`)를 만들어 `pg_restore` 해 보면 안전하게 시험할 수 있다.
