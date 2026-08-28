# 여러 PC 에서 같은 데이터로 쓰기

개발 MAIN PC 에서도 이 시스템을 돌리기 위한 구성이다.
**데이터는 한 벌만 둔다.** PC 마다 사본을 두면 어느 쪽이 진짜인지 알 수 없게 된다.

```
운영 PC (192.168.1.211)              개발 MAIN PC
├─ PostgreSQL :5432  ←───────────────  DATABASE_URL 로 접속
├─ npm run dev :3200                   npm run dev :3200
└─ 작업 스케줄러 (백업 · 알림)          ✗ 등록하지 않는다

NAS (192.168.0.222)
├─ 9. 계측기 관리 시스템 파일   ←──────  FILE_STORAGE_ROOT (양쪽 공용)
└─ 8. 계측기 관리 시스템 백업   ←──────  BACKUP_ROOT (운영 PC 만)
```

| | 어디에 | 누가 쓰나 |
|---|---|---|
| DB | 운영 PC 의 PostgreSQL | 두 PC 가 네트워크로 함께 |
| 사진 · 성적서 | NAS `9. 계측기 관리 시스템 파일` | 두 PC 가 함께 |
| 설정 | 각 PC 의 `.env.local` | 각자 (값이 조금 다르다) |

> **DB 데이터 폴더를 NAS 에 두지 않는다.** PostgreSQL 은 파일 잠금을 직접
> 다루는데 SMB 공유에서는 그것이 보장되지 않는다. 공식적으로 지원하지 않고,
> 두 PC 가 같은 폴더를 동시에 열면 DB 가 깨진다.
> 그래서 DB 는 **한 대에 두고 네트워크로 접속**한다.

---

## 운영 PC 에서 해 둔 것

### 1. PostgreSQL 을 사내망에 연다

`C:\pgdata\postgresql.conf`

```
listen_addresses = '*'
```

`'*'` 로 열되 **실제 차단은 아래 두 가지가 한다.** 이 PC 는 IP 가 바뀔 수 있어
주소를 박아 두면 어느 날 조용히 끊긴다.

### 2. 누가 붙을 수 있는지 정한다

`C:\pgdata\pg_hba.conf` 끝에 두 줄을 넣었다.

```
host    all             all             192.168.1.0/24          scram-sha-256
host    all             all             192.168.0.0/24          scram-sha-256
```

**대역을 넓히지 말 것.** 여기 적힌 주소에서만 들어올 수 있고, 비밀번호는 그대로 요구한다.

고친 뒤에는 다시 시작해야 적용된다.

```
"C:\Users\이남준\pgsql\bin\pg_ctl.exe" -D C:\pgdata -l C:\pgdata\server.log restart
```

원본은 `postgresql.conf.bak-20260828` · `pg_hba.conf.bak-20260828` 로 남겨 두었다.

### 3. 방화벽 (관리자 권한 필요)

```powershell
New-NetFirewallRule -DisplayName 'PostgreSQL 5432 (사내망)' `
  -Description '계측기 관리 시스템 DB. 개발 PC 가 붙는다.' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5432 `
  -Profile Any -RemoteAddress '192.168.1.0/24','192.168.0.0/24'
```

여기서도 대역을 묶었다. 포트가 열려 있어도 그 밖에서는 닿지 않는다.

사내망이 Windows 에서 **「공용 네트워크」** 로 잡혀 있으면 연결이 막히기 쉽다.
회사 정책에 걸리지 않는다면 사설망으로 바꾸는 편이 낫다.

```powershell
Set-NetConnectionProfile -Name 'DSSTECH5' -NetworkCategory Private
```

### 4. 파일을 NAS 로 옮겼다

전에는 운영 PC 안(`C:\WEB-DATA\dss-meters`)에 있었다. 그러면 개발 PC 에서 닿지 않는다.

```
\\192.168.0.222\2_as센터\3. 계측기 관리\9. 계측기 관리 시스템 파일\
```

**백업 폴더(`8. …`)와 일부러 나눠 두었다.** 앱이 백업 폴더에 직접 쓰기 시작하면
"원본과 백업" 이 같은 것이 되어 백업의 의미가 사라진다.

---

## 개발 MAIN PC 에서 할 것

```
git clone https://github.com/skawnszz-creator/njlee.git
cd njlee
npm install
```

`.env.local` 은 **NAS 백업의 `config\.env.local` 을 복사**한 뒤 두 줄만 고친다.

| | 값 |
|---|---|
| `DATABASE_URL` | `postgres://postgres:비밀번호@192.168.1.211:5432/dss_meters` |
| `PG_BIN` | 그 PC 의 PostgreSQL bin 경로 (백업을 안 돌리면 비워도 된다) |

`FILE_STORAGE_ROOT` 는 **그대로 둔다.** 이미 NAS 주소라 양쪽이 같은 것을 본다.

```
npm run dev        →  http://localhost:3200
```

### 개발 PC 에서 하지 말 것

- **작업 스케줄러를 등록하지 않는다.** 백업과 알림 메일이 두 번씩 돌게 된다.
  백업은 같은 NAS 폴더에 서로 덮어쓰고, 알림은 같은 달에 두 번 나갈 수 있다.
  (알림은 `web_notifications` 의 유니크 인덱스가 막아 주지만, 애초에 겹치지 않는 편이 낫다)
- **`npm run db:migrate` 를 함부로 돌리지 않는다.** 운영 DB 를 바꾸는 것이다.
  마이그레이션은 스키마를 실제로 고칠 때만, 한쪽에서만 돌린다.

---

## 알아 둘 것

### 데이터가 한 벌이다

개발 PC 에서 계측기를 지우면 **운영 데이터가 지워진다.** 사본이 아니다.
마음 놓고 실험하려면 그 PC 에 따로 복구해서 쓰는 편이 맞다 (docs/BACKUP.md 상황 4).

### 파일 백업이 같은 장비 안에 있다

파일 원본이 NAS 로 옮겨졌으므로, 백업의 `files\` 는 **같은 NAS 안의 다른 폴더**다.
실수로 지웠을 때는 여전히 지켜 주지만, NAS 자체가 고장나면 둘 다 사라진다.

- DB 덤프는 운영 PC → NAS 라 여전히 진짜 백업이다.
- 파일은 **NAS 의 RAID·스냅샷 설정에 기대는 상태**다. 한 번 확인해 두는 것이 좋다.

### 운영 PC 가 꺼져 있으면

개발 PC 에서 DB 에 붙지 못한다. 파일(NAS)은 되지만 화면이 열리지 않는다.
`pg_ctl start` 로 운영 PC 의 PostgreSQL 을 먼저 켜야 한다.

### 잘 되는지 확인

운영 PC 에서:

```
netstat -ano | findstr :5432        0.0.0.0:5432 로 떠 있어야 한다
```

개발 PC 에서:

```
psql -h 192.168.1.211 -U postgres -d dss_meters -c "select count(*) from web_meters"
```

붙지 않으면 순서대로 본다 — 운영 PC 의 PostgreSQL 이 켜져 있는지 →
방화벽 규칙이 있는지 → `pg_hba.conf` 에 그 PC 의 대역이 있는지.
