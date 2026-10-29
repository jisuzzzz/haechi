# Python 백엔드 확장 지원 스펙

상태: **Implemented — 아래 검증 범위와 제한 참고**
작성일: 2026-10-29
범위 확정: 2026-10-29, 사용자의 “스펙대로 진행해” 요청으로 아래 제안안을 채택했다.

## 배경과 목표

현재 haechi는 Django·FastAPI 저장소를 감지하고, 변경한 Python 소스에 연결된 테스트를 실행한다. 프레임워크별 작업 지침, DB 마이그레이션 실행, Docker 데몬 관리는 기존 Python 백엔드 지원에서 제외되어 있었다.

이번 요청은 다음 세 항목을 확장하는 것이다.

1. 프레임워크별 워크플로 규칙
2. 데이터베이스 마이그레이션 자동화
3. Docker 데몬 관리

예를 들어 FastAPI의 모델을 변경했을 때, 에이전트가 API 응답과 DB 세션 처리를 함께 확인하고, 전용 명령으로 필요한 로컬 서비스를 준비한 뒤 마이그레이션과 관련 테스트를 실행할 수 있게 한다. 일반 검증 명령은 서비스 준비나 마이그레이션을 자동 실행하지 않는다.

## 확정된 범위

| 구분 | 내용 |
|---|---|
| 사용자 요청으로 확정 | 위 세 기능의 확장 지원 |
| 저장소에서 확인 | 기존 지원 대상에 Django·FastAPI가 포함됨. 해당 세 기능은 이전 스펙의 제외 항목이었음 |
| 기존 동작으로 유지 | 명시적인 Python 테스트 매핑, 기존 사용자 명령, Claude Code·Codex 배포본의 동일한 동작 |
| 이번 확장 | Django·FastAPI 지원, 로컬·테스트 DB 대상, 전용 명령으로 준비 작업 실행 |
| 마이그레이션 | 파일 생성은 저장소의 도구에 맡기고 기존 파일의 계획·적용·완료 확인을 자동화 |
| Docker | 기존 로컬 제공자 사용. 데몬 시작·중지는 명시적인 실행 의도가 있을 때 수행 |

## 동작

### 1. 프레임워크별 워크플로

- 설정 과정에서 Django와 FastAPI를 감지하고 관련 프로필을 제안한다. 두 프레임워크가 함께 있으면 둘 다 표현할 수 있다.
- 메인 에이전트와 서브에이전트가 동일한 프로필을 받는다. 작업 경로와 관련된 지침만 적용한다.
- Django에서는 모델 변경에 영향을 받는 ORM 쿼리, API, 제약조건, 마이그레이션을 함께 확인한다. 기존 테스트 DB와 트랜잭션 격리를 유지한다.
- FastAPI에서는 요청 검증, 응답 모델과 상태 코드, 의존성 교체, lifespan, 동기·비동기 DB 세션의 생성과 정리를 확인한다.
- FastAPI라는 이유만으로 SQLAlchemy나 Alembic을 사용한다고 가정하지 않는다.
- 프로필이 없거나 비어 있으면 기존 설정을 불완전한 것으로 처리하지 않는다. 지원하지 않는 값은 수정할 수 있도록 오류를 표시한다.

### 2. 데이터베이스 마이그레이션

- 저장소의 기존 마이그레이션 도구와 명령을 사용한다. 가상환경, 설정 모듈, 컨테이너 실행 옵션을 보존한다.
- 계획 보기, 현재 상태 확인, 적용을 구분한다. 적용 시에는 계획 확인, 적용, 완료 확인 순서로 실행한다.
- 계획 확인에 실패하면 적용하지 않는다. 적용 또는 완료 확인에 실패하면 성공으로 보고하지 않는다.
- 실패 후 자동 재시도, 롤백, 데이터 초기화, 적용 이력 조작은 수행하지 않는다. 일부 변경이 반영되었을 수 있으므로 먼저 현재 상태를 확인한다.
- 환경 이름을 `local` 또는 `test`로 저장해도 실제 접속 대상이 증명되지는 않는다. 실행 전 저장소 설정과 현재 환경이 가리키는 DB를 확인한다. 자격증명은 설정 파일이나 로그에 남기지 않는다.
- Django의 관리 스크립트와 Alembic 설정 파일은 명령 후보를 찾는 근거다. 감지 결과만으로 DB 작업을 실행하지 않는다.
- 이번 자동화는 기존 마이그레이션 파일을 검토한 뒤 적용하는 범위다. 파일 생성은 저장소의 기본 도구와 검토 절차를 따른다.

### 3. Docker 데몬 관리

- 저장소에서 사용할 Docker context와 기존 제공자의 명령을 지정한다. Docker 설정 파일만 보고 Desktop, Colima, systemd 중 하나를 임의로 선택하지 않는다.
- 상태 확인은 지정한 context에 연결해 실제 응답 여부를 확인한다. 연결 실패를 곧바로 데몬 중지 상태라고 단정하지 않는다.
- 이미 사용 가능한 데몬은 다시 시작하지 않는다. 시작 명령 실행 후 실제 연결이 가능해질 때까지 제한된 시간 동안 확인한다.
- 중지는 별도 작업으로 요청된 경우에만 수행한다. 실행 중인 컨테이너가 있으면 중지하지 않고 이유를 알린다.
- 전역 context 변경, 원격 데몬 시작·중지, Docker 설치, 권한 상승, 컨테이너·볼륨 삭제는 이번 범위에서 제외한다.
- 종료 시 자동으로 데몬을 중지하지 않는다. 다른 작업도 같은 데몬을 사용할 수 있다.

## 결정 기록

| 항목 | 채택한 동작 | 이번에 포함하지 않는 범위 |
|---|---|---|
| 프레임워크 범위 | 기존 Python 지원의 연장으로 Django·FastAPI부터 지원 | React·React Native 등 다른 프레임워크별 규칙 |
| 자동 실행 시점 | 전용 준비 명령에서 실행. 일반 검증은 기존처럼 검사만 수행 | 검증 명령에 Docker와 DB 자동 준비 연결 |
| 마이그레이션 자동화 범위 | 기존 마이그레이션의 계획·적용·완료 확인 | 모델 변경 감지와 마이그레이션 파일 자동 생성 |

로컬·테스트 DB만 지원하며, Docker 중지는 실행 중인 컨테이너가 없을 때만 허용한다. 운영 DB와 원격 데몬 변경은 지원하지 않는다.

## 설정

기존 `.haechi.json`에 선택 항목으로 추가한다. 아래는 Django 테스트 DB를 사용하는 저장소의 예시이며, 그대로 실행할 기본값이 아니다.

```json
{
  "frameworks": ["python-django"],
  "migrations": {
    "environment": "test",
    "plan": "python manage.py migrate --plan --settings=config.settings_test",
    "apply": "python manage.py migrate --noinput --settings=config.settings_test",
    "check": "python manage.py migrate --check --settings=config.settings_test"
  },
  "docker": {
    "context": "desktop-linux",
    "start": "docker desktop start",
    "stop": "docker desktop stop"
  }
}
```

설정 모듈, Docker context와 명령은 해당 저장소와 머신에서 확인한 값을 사용한다. 기존 사용자 명령은 설정을 다시 실행해도 보존한다. Docker 상태 확인에는 `context`만 필요하고, 시작·중지에는 해당 명령이 필요하다.

## 사용 방법

`<tools>`는 설치된 haechi 플러그인의 `tools` 디렉터리다. `<repo>`는 `.haechi.json`이 있는 저장소 루트다. 에이전트는 `/haechi:python-backend`, `/haechi:migrate`, `/haechi:docker` 스킬로 같은 절차를 수행한다.

```bash
node <tools>/docker-daemon.mjs status <repo>
node <tools>/docker-daemon.mjs start <repo> --execute
node <tools>/migrate.mjs plan <repo>
node <tools>/migrate.mjs apply <repo> --execute
node <tools>/migrate.mjs check <repo>
```

필요한 서비스가 준비된 후 마이그레이션을 실행한다. Docker 데몬이 응답한다고 DB 컨테이너까지 준비된 것은 아니다. DB 서비스의 준비 여부는 저장소의 기존 절차로 확인한다. 데몬 중지는 별도로 요청된 경우 `node <tools>/docker-daemon.mjs stop <repo> --execute`를 사용한다.

`--execute`는 변경 작업을 명시적으로 선택하는 옵션이다. 대화에서 이미 허용된 대상과 작업이라면 다시 허락을 묻지 않는다. 설정만 추가했다고 DB 변경이나 공유 데몬 중지 권한이 생기는 것은 아니다.

| 명령 | 종료 코드 |
|---|---|
| `migrate.mjs` | 0: 요청한 단계 모두 성공. 1: 잘못된 설정, 실행 거부 또는 단계 실패 |
| `docker-daemon.mjs` | 0: 준비 완료 또는 요청한 작업 완료. 1: 잘못된 설정, 실행 거부 또는 작업 실패. 2: 상태 조회에서 연결 불가 |

계획과 확인 명령도 DB에 연결할 수 있다. 저장소가 읽기 전용 명령으로 설정해야 한다. Alembic 감지 후보의 계획은 현재 revision과 head 목록을 보여 준다. 변경할 SQL 전체를 검토한 결과가 아니므로 적용할 migration 파일도 읽어야 한다. 여러 head를 사용하는 저장소는 해당 분기 규칙에 맞는 명령을 설정한다.

## 수용 기준

| 대상 | 확인 가능한 결과 |
|---|---|
| 프레임워크 감지 | Django, FastAPI, 혼합 저장소에서 해당 프로필만 제안함 |
| 지침 전달 | 메인 세션, 컨텍스트 압축 후 세션, 서브에이전트에 선택한 프로필이 전달됨 |
| 기존 설정 호환 | 확장 설정이 없는 저장소의 설정 완료 여부와 테스트 선택 결과가 이전과 같음 |
| 잘못된 설정 | 잘못된 자료형, 미지원 프로필, 누락된 명령을 실행 전에 보고함 |
| 마이그레이션 순서 | 계획 실패 시 적용하지 않으며, 적용 성공 후 완료 확인까지 통과해야 성공으로 보고함 |
| 마이그레이션 실패 | 실패·시간 초과 뒤 다음 단계나 자동 재시도를 실행하지 않음 |
| 실제 DB 결과 | 일회용 DB에 작은 마이그레이션을 적용한 뒤 스키마와 적용 이력을 확인함. 다시 적용해도 이력이 중복되지 않음 |
| Docker 상태 | 준비된 데몬을 재시작하지 않으며, 연결 실패를 준비 완료로 보고하지 않음 |
| Docker 시작 | 시작 실패나 준비 시간 초과를 실패로 보고함 |
| Docker 중지 | 실행 중인 컨테이너가 있을 때 중지 명령을 실행하지 않음 |
| 대상 보존 | 모든 Docker 상태 확인이 지정 context를 사용하고 전역 context를 변경하지 않음 |
| 일반 검증 분리 | 확장 설정이 있어도 기본 검증 중 서비스 시작이나 마이그레이션 적용이 발생하지 않음 |
| 배포 일치 | Claude Code·Codex 배포본이 원본과 일치하고 변경 관련 테스트가 통과함 |

실제 Docker 시작·중지 검증에는 사용 중인 데몬을 건드리지 않는 별도 환경이 필요하다. 명령 모의 테스트와 실제 제공자 검증의 결과는 구분해 기록한다.

## 검증 기록

Node.js 22.20.0에서 다음 명령의 테스트 103개가 통과했다. 실패하거나 건너뛴 테스트는 없었다.

```bash
node --test test/build.test.mjs test/detect.test.mjs test/rules.test.mjs test/verify-default.test.mjs test/migrate.test.mjs test/docker-daemon.test.mjs test/run-command.test.mjs
npm run check
```

`npm run check`는 생성된 Claude Code·Codex 배포 파일 135개가 원본과 일치함을 확인했다.

| 수용 기준 | 검증 근거 |
|---|---|
| 프레임워크 감지·기존 설정 보존 | `detect.test.mjs`: Django·FastAPI 혼합, JS 명령 우선순위 유지, 마이그레이션 도구 중복 후보, Docker 제공자 미추정 |
| 지침 전달·잘못된 프로필 | `rules.test.mjs`: 메인·서브에이전트·압축 후 hook, 중복 제거, 누락·빈 배열 호환, 잘못된 값 오류 |
| 마이그레이션 순서·실패 | `migrate.test.mjs`: 실제 하위 명령 실행 순서, 각 단계 실패 시 중단, 대상 디렉터리·환경 보존, 명시적 적용 옵션 |
| 시간 초과·중단 | `migrate.test.mjs`, `run-command.test.mjs`: 셸 자식 프로세스가 실행된 것을 확인한 뒤 시간 초과·SIGINT·SIGTERM 후 지연 쓰기가 발생하지 않음을 검사. 동시 명령과 신호 처리기 정리도 확인 |
| Docker 상태·시작·중지·대상 보존 | `docker-daemon.test.mjs`: 준비 완료 상태의 중복 시작 방지, 원격 대상 거부, 실행 중 컨테이너 보호, 실패·준비 시간 초과, 실제 fixture CLI의 context·환경·디렉터리 보존 |
| 일반 검증 분리 | `verify-default.test.mjs`: 확장 명령이 설정되어도 Ruff와 선택된 테스트만 실행 |
| 배포 일치 | `build.test.mjs` 및 `npm run check` |

생성된 Codex 배포본의 `migrate.mjs`를 Django 3.2.21과 일회용 SQLite DB에서 실행했다. 빈 테이블 하나와 마이그레이션 이력만 만들었으며, 검증 후 임시 디렉터리와 DB를 삭제했다.

| 실제 DB 시나리오 | 결과 |
|---|---|
| 적용 전 `plan` | 종료 0 |
| 적용 전 `check` | 종료 1 |
| `--execute` 없는 `apply` | 종료 1 |
| `apply --execute` | 종료 0 |
| 적용 후 `check` | 종료 0 |
| `apply --execute` 재실행 | 종료 0. 테이블 하나, 데이터 0행, 적용 이력 정확히 1건 |

Docker 29.2.0의 기존 `desktop-linux` context에서 생성된 도구의 `status`를 실행했다. 로컬 소켓이 없어 `unreachable`, `changed: false`, 종료 2를 반환했다. 기존 데몬이나 컨테이너는 변경하지 않았다.

### 검증 제한

- 실제 Docker Desktop·Colima·systemd의 시작·중지는 실행하지 않았다. 해당 제어 흐름은 모의 응답과 실행 가능한 fixture CLI로 검증했다.
- Windows의 프로세스 트리 종료 경로는 실환경에서 검증하지 않았다. 로컬 named pipe 허용과 원격 pipe 거부는 테스트했다.
- Alembic은 확인한 Python 환경에 설치되어 있지 않아 실제 DB 적용을 실행하지 않았다. 감지 명령과 버전 요구사항은 공식 문서와 단위 테스트로 확인했다.
- `npm run scan`은 비공개 패턴이 설정되지 않아 검사를 건너뛰었다.
- 시간 초과와 SIGINT·SIGTERM 중단은 일반 로컬 자식 프로세스를 종료한다. SIGKILL, 이미 분리된 프로세스, 컨테이너 내부 작업, DB 서버에서 시작된 쿼리의 취소나 롤백은 보장하지 않는다. 재시도 전 상태를 확인해야 한다.

## 참고

- [기존 Python 백엔드 스펙](python-backend-spec.md)
- [Django 관리 명령](https://docs.djangoproject.com/en/5.2/ref/django-admin/): 계획 보기와 적용 여부 확인 명령
- [Alembic 명령](https://alembic.sqlalchemy.org/en/latest/api/commands.html): 적용된 head 확인. `current --check-heads`는 1.17.1 이상에서 제공하므로 저장소 버전에 맞춰 명령을 선택해야 함
- [Docker Desktop CLI](https://docs.docker.com/desktop/features/desktop-cli/): 기존 Desktop 설치의 시작·중지 명령
