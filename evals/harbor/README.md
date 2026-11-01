# Harbor 공통 평가 실행기

React·FastAPI 자체 과제와 실제 SWE-bench JS·TS/Python 이슈를 같은 조건으로 해치 적용 전후에 실행한다. Python 3.12+, Docker Engine/Compose, Node.js 24가 필요하다. Harbor는 0.25.0, Codex CLI 기본값은 0.153.4로 고정한다.

이 공개 경로에는 재사용 코드와 여섯 자체 과제만 둔다. 실행 로그·패키지 복사본·평가자용 묶음·실제 저장소의 정답/채점 payload는 로컬에 생성한다. 과거 측정의 결론과 원본 위치·해시는 [평가 결과](../../docs/evaluation-results.md), [증거 목록](evidence-index.json)에 있다. 이 배포 정리에서는 모델 평가를 새로 실행하지 않았다.

## 설치와 실행

```sh
python3.12 -m venv /tmp/haechi-harbor
/tmp/haechi-harbor/bin/pip install -r evals/harbor/requirements.lock
/tmp/haechi-harbor/bin/python -m evals.harbor.run preflight
/tmp/haechi-harbor/bin/python -m evals.harbor.run freeze \
  --out evals/harbor/runs/local --model openai/gpt-6-astra --trials 2
/tmp/haechi-harbor/bin/python -m evals.harbor.run calibrate --out evals/harbor/runs/local
/tmp/haechi-harbor/bin/python -m evals.harbor.run run --out evals/harbor/runs/local
```

`run`은 모델 사용량을 발생시킨다. Codex 로그인 또는 API 키를 준비하고, 필요하면 `freeze --auth-mode login|api-key`로 인증 방식을 고정한다. preflight는 인증값을 출력하지 않으며 실제 모델 접근 성공까지 증명하지 않는다.

- `smoke`: 네 과제, 두 조건, 조건당 두 반복으로 모델 세션 16회. 세션당 300초.
- `expanded`: 위 과제에 요청 순서·CSV 페이지 처리·tenant 캐시·원자적 예약을 더해 여덟 과제, 세션 32회. 추가 과제는 세션당 600초.
- `swebench-real`: 실제 저장소 여섯 이슈. [별도 준비 절차](swebench/README.md)로 로컬 fixture를 먼저 만든다.

확장 실행은 `freeze --suite expanded --jobs 2`를 사용한다. 동시 실행은 1~2회로 제한하고 반복마다 조건의 시작 순서를 교대한다. 이전 실험의 패키지를 유지하려면 `--package-dir /absolute/path/to/saved-package`를 지정한다. 기본값은 현재 `dist/codex`이며, 과거 패키지와 같다는 뜻은 아니다.

## 먼저 고정하고 교정하기

`freeze`는 과제·기준·모델·예산·조건 순서와 패키지·하네스 파일의 해시를 모델 실행 전에 저장한다. 매 실행은 새 컨테이너에서 시작한다. 기본 조건은 해치 없이, 해치 조건은 같은 과제에 실제 hook/skill을 제공한다. 호스트 설정과 플러그인은 불러오지 않는다. SessionStart의 실제 전달을 별도로 감사한다.

`calibrate`는 모델을 호출하지 않는다. 원래 버그가 있는 소스가 실패하고 제공된 수정이 통과하는지 모든 선택 fixture에서 확인한다. 누락된 교정이나 바뀐 입력·보상 파일은 실행을 막는다. 코드가 달라지면 새 계획을 만들고 결과를 본 뒤 기준을 고치지 않는다.

React와 FastAPI의 공통 lockfile은 `fixtures/shared/`에 각각 한 벌만 둔다. 원본 fixture의 상대 symlink는 freeze 때 일반 파일로 복사돼 Docker build context에 포함된다. 원본 fixture 디렉터리를 직접 Docker build하는 대신 이 준비 절차를 사용한다.

## 실행과 판정 분리

```sh
/tmp/haechi-harbor/bin/python -m evals.harbor.report packets --out evals/harbor/runs/local
/tmp/haechi-harbor/bin/python -m evals.harbor.report report \
  --out evals/harbor/runs/local --judgments /absolute/path/to/judgments.json
```

독립 평가자에게는 `judge-packets/`만 제공한다. 실행 매핑과 `judge-identities.json`은 주지 않는다. 명령 trace가 해치 사용을 드러낼 수 있어 완전한 가림이라고 주장하지 않는다. 나중에 하네스가 실행한 검사가 에이전트 자신의 검증 수행을 대신 증명하지도 않는다.

판정 파일은 모든 기준을 한 번씩 포함해야 한다.

```json
{"evaluator":"독립 평가자와 방법","independent":true,"runs":[{"sampleId":"sample-...","reason":"관찰 근거","criteria":[{"index":0,"passed":true,"reason":"로그 위치와 근거"}]}]}
```

기능 실패는 좋은 텍스트 평가로 뒤집지 않는다. 실행·판정·hook 전달이 빠지면 미완료다. 양쪽 모두 통과하면 개선 우위는 불충분하다. 실제로 시작한 에이전트의 예산 초과는 실패로, 시작조차 못 한 인프라 오류와 구분한다. 두 반복은 일반적인 신뢰성이나 통계적 유의성을 증명하지 않는다.

실제 저장소 채점은 에이전트가 바꾼 환경의 결과와 별도로, 같은 초기 이미지에서 소스 패치만 적용해 공식 F2P/P2P 검사를 수행한다. 이미지 ID·layer·실행 시간·토큰 사용량도 결과와 분리해 기록한다. 비용이 항상 제공되는 것은 아니다. 결과에 따라 해치 규칙을 자동 채택하지 않는다.

## 보관

출력은 Git에서 제외한 `runs/`나 저장소 밖에 둔다. 이 안의 snapshot, jobs, traces, judge-packets와 생성한 SWE-bench fixture·wheel을 공개 커밋에 넣지 않는다. 짧은 결론·재현 조건·증거 식별자만 선별한다. 원본 증거는 삭제하지 않고 로컬 별도 보관한다.

중단된 Harbor job에 수집 결과가 없으면 자동으로 다시 돌리지 않는다. `verify`로 입력을 확인하고 보존된 실제 결과를 검토한 뒤 재개한다. 보고서는 동결된 하네스와 파일 해시를 검사하므로 현재 코드 변경을 과거 측정으로 소급하지 않는다.
