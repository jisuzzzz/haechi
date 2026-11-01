# 실제 저장소 SWE-bench 과제

`selection.json`은 결과를 보기 전에 선택한 JS·TS 네 이슈와 Python 두 이슈의 dataset revision·base commit을 고정한다. 전체 벤치마크 점수가 아니다. 원래 이슈와 수정 전 환경은 에이전트에 제공하지만, 정답 패치·공식 테스트·채점 모듈은 제공하지 않는다.

## 로컬 payload 준비

Python 3.12+, Docker의 amd64 지원과 공식 task image가 필요하다. `requirements.lock`은 데이터 준비 환경을 기록한다. 과제 payload와 중복 wheel은 Git에 포함하지 않는다.

```sh
python -m pip download --no-deps --dest /tmp/swebench-wheels swebench==5.0.2 unidiff==0.7.5
python -m evals.harbor.swebench.prepare \
  --rows /absolute/path/to/selected-rows.json --wheels-dir /tmp/swebench-wheels \
  --fixtures-dir /tmp/haechi-real-fixtures
python -m evals.harbor.run freeze --suite swebench-real --jobs 2 --trials 2 \
  --auth-mode login --fixtures-dir /tmp/haechi-real-fixtures \
  --out evals/harbor/runs/real
python -m evals.harbor.run calibrate --out evals/harbor/runs/real
python -m evals.harbor.run run --out evals/harbor/runs/real
```

`selected-rows.json`은 선택한 고정 dataset row에 공식 SDK의 `image`, `eval_script`, `log_parser`, `eval_type` 등 채점 필드를 더한 로컬 JSON 배열이다. `prepare.py`가 읽는 필드와 `selection.json`의 조건이 일치해야 한다. 정답·채점 정보가 있으므로 이 파일을 에이전트나 공개 PR에 주지 않는다. wheel의 알려진 해시는 `wheels.json`에 있다.

기존 로컬 원본의 생성된 fixture를 재사용할 수도 있다. `freeze --fixtures-dir`에 그 `evals/harbor/fixtures` 경로를 지정한다. 당시 패키지까지 그대로 비교하려면 별도로 `--package-dir`에 보존된 snapshot을 지정하고 [증거 목록](../evidence-index.json)의 해시를 대조한다. 새 기본 `dist/codex`는 당시 평가한 패키지가 아니다.

`prepare`는 기존 과제를 덮어쓰지 않는다. 준비한 이미지·source row·설정 패치의 해시는 지정한 fixture 폴더의 `prepared-images.json`에 저장한다. SDK wheel과 test dependency는 verifier 쪽에만 둔다.

## 설정 조건과 채점

기본값은 첫 사용 조건이다. 초기 설정을 기다리는 행동도 코딩 예산에 포함한다. 설정 완료 조건은 새 출력 디렉터리에 `freeze --setup-profile configured`를 지정한다. 양쪽 모두 같은 저장소 명령·합성 데이터 사실·사용자 설정을 받고, setup 대화는 이 조건 밖에 둔다.

각 코딩 세션은 동일 모델·reasoning `medium`·600초 상한을 쓴다. 총 토큰 상한은 없고 실제 사용량을 기록한다. 공식 채점은 원래 고정 이미지에서 소스 패치만 적용한 새 컨테이너로 진행한다. 에이전트의 의존성 변경이나 인증값을 복사하지 않는다.

F2P(이슈를 고치면 통과해야 하는 테스트)와 P2P(계속 통과해야 하는 기존 테스트)를 함께 확인한다. 기능 결과와 독립적인 보고 정확성 판정은 분리한다. 빠진 실행·채점·판정은 불충분이며 양쪽 성공도 우월성 증거가 아니다. 작은 여섯 이슈·두 반복의 결과를 모델이나 해치 전체의 일반 성능으로 확대하지 않는다.

관련 도구: `prepare.py` 입력 물질화, `grade.py` 공식 SDK 연결, `replay.py` 새 환경의 소스 패치 채점, `configured/` 저장소별 준비 명령. 회귀 검사는 모델이나 네트워크를 호출하지 않고 임시 fixture와 명시적인 SDK 경계 fake를 사용한다. 이는 공식 SDK 전체를 새로 검증했다는 뜻은 아니다.
