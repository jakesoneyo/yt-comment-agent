# YouTube 댓글 에이전트 대시보드 — SPEC

(주)제이지그룹 AI PM 과제 TRACK 2 제출용. 로컬 실행 대시보드.
목표: 2일 내 제출 (마감 2026-11-23, 조기 제출 우선).

---

## 0. 확정된 결정 (grilling 결과)

| #   | 결정               | 내용                                                                                                                                        |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | 일정               | 2일 내 제출. 필수 + 가점 4개 전부                                                                                                           |
| Q2  | 스택               | NestJS + Vite React + Playwright + SQLite(Prisma). 인증·Docker·배포·Testcontainers 제외                                                     |
| Q3  | 레포               | Public 제출 → 결과 발표 후 Private 전환                                                                                                     |
| Q4  | AI                 | Claude API `claude-opus-5-5`                                                                                                                |
| Q5  | 게시 대상          | 직접 만든 테스트 영상(TTS+자막 슬라이드, 일부 공개)에만 실제 게시. 녹화 후 댓글 삭제. 실제 '연애' 검색 결과는 불러오기·초안·떡상 후보까지만 |
| -   | "지정된 영상" 해석 | `config.yaml`에 지정한 소스(키워드·채널)의 최신 영상 + 링크 직접 입력. README에 가정 명시                                                   |

---

## 1. 평가 항목 → 구현 매핑

| 항목(배점)      | 증명 수단                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| 실제 게시(25)   | 보이는 크롬 창에서 한 글자씩 타이핑 → 게시 → 내 댓글 탐지 → 댓글 고유 링크(`&lc=`)로 "댓글 보기"                      |
| 맥락 이해(25)   | 자막(타임스탬프)·제목·설명·인기 댓글 입력 → 고민 한 줄 + 근거 장면 인용을 대시보드에 노출. 이전 댓글 대비 유사도 검사 |
| 운명원 유도(20) | 4단 구조 + 전언체 규칙 + 프로필별 페르소나 + 해당 영상 인기 댓글 말투 모방                                            |
| 운영 규칙(15)   | DB 제약(영상당 1개) + 트랜잭션 상한 검사 + 화면 카운터 + Jest 테스트                                                  |
| 사용성(10)      | ①②③ 3칸, 다음 행동 하나만 활성, 빈 상태 안내                                                                          |
| 제작 의도(5)    | §9 + README 상단                                                                                                      |

---

## 2. 아키텍처

```
[React 대시보드 :5173] --REST(1s 폴링)--> [NestJS :3000]
                                            ├─ YoutubeService   : Data API v3 (목록/통계/인기댓글) + yt-dlp(자막)
                                            ├─ DraftService     : Claude 호출 → 검증기 → (실패 시 피드백 재생성, 최대 3회)
                                            ├─ PostingService   : Playwright launchPersistentContext(프로필 폴더) 게시·확인
                                            ├─ RulesService     : 영상당 1개 / 하루 상한 / 프로필 배정
                                            └─ Prisma(SQLite)   : drafts, video_locks, comment_logs
config.yaml  (profiles, comment, limits, sources)
.env         (ANTHROPIC_API_KEY, YOUTUBE_API_KEY)  ← 커밋 금지
profiles/유튜브1..3/  (크롬 user-data-dir, gitignore)
```

- 동시 게시 1건만 허용(인메모리 락). 바쁘면 409.
  `ponytail: 단일 프로세스 락, 다중 워커 필요 시 DB 락으로`
- 진행 상태는 SSE 대신 1초 폴링(TanStack Query `refetchInterval`).

### config.yaml (PDF 설정 예시 키 그대로)

```yaml
profiles:
  - {
      name: 유튜브1,
      dir: ./profiles/youtube1,
      persona: "24살, 짝사랑만 3년째인 대학생. 말끝 흐리고 ㅠㅠ 자주 씀",
    }
  - {
      name: 유튜브2,
      dir: ./profiles/youtube2,
      persona: "28살, 2년 연애 끝나고 반년째 정리 중인 직장인. 담담한 반말체",
    }
  - {
      name: 유튜브3,
      dir: ./profiles/youtube3,
      persona: "31살, 결혼 얘기 나오는 연애 중. 존댓말, 현실적인 톤",
    }
comment: { min_chars: 40, max_chars: 120, brand: 운명원 }
limits: { daily_max_comments: 10 }
sources:
  keywords: [연애]
  channels: [] # 테스트 채널 ID
  max_results: 12
```

---

## 3. 데이터 모델 (Prisma)

- **Draft**: id, videoId, profileName, concern(고민 한 줄), evidence(JSON: [{ts, quote, keyword}]), comment, validation(JSON), createdAt
- **VideoLock**: videoId(PK), commentLogId, createdAt — 게시 시작 시 insert(예약). 실패 시 delete → 재시도 허용. 성공 시 영구 유지 = **영상당 1개 보장**
- **CommentLog**: id, videoId, videoTitle, profileName, text, status(`opening|typing|posting|verifying|posted|failed|unverified`), commentUrl?, error?, screenshotPath?, createdAt, updatedAt — 모든 시도 기록(실패 포함)

**하루 상한**: 한 트랜잭션에서 `오늘(KST 00:00~) status != failed` 건수 < `daily_max_comments` 확인 후 VideoLock + CommentLog 생성. SQLite 쓰기 직렬화로 경쟁 상태 차단.

---

## 4. API

| Method | Path                                     | 설명                                                    |
| ------ | ---------------------------------------- | ------------------------------------------------------- |
| GET    | /health                                  | 헬스체크                                                |
| GET    | /videos?source=keyword\|channel\|rising  | 목록(썸네일·제목·채널·게시일·조회수, 이미 단 영상 표시) |
| POST   | /videos/resolve `{url}`                  | 링크 직접 입력 → 영상 정보                              |
| POST   | /drafts `{videoId, profileName?}`        | 초안 생성(분석+댓글+검증)                               |
| POST   | /comments `{videoId, profileName, text}` | 게시 시작(규칙 검사 → 비동기 실행) → logId              |
| GET    | /comments/:id                            | 진행 상태                                               |
| GET    | /comments                                | 기록(시간순)                                            |
| GET    | /stats/today                             | 오늘 n/상한, 프로필별 사용량                            |

Swagger: `/docs`. 입력 검증 class-validator. 게시 텍스트는 서버에서 검증기 재실행(프론트 수정본도 규칙 통과해야 게시).

---

## 5. 댓글 생성 파이프라인

**입력**: 자막(yt-dlp `--write-subs --write-auto-subs --sub-langs ko --skip-download`, 없으면 제목+설명), 인기 댓글 20개(commentThreads `order=relevance`), 프로필 페르소나, 최근 게시(실패 제외) 댓글 10개(반복 금지용).

**Claude 1회 호출, 구조화 출력** — 스키마 필드 순서로 "분석 → 작성" 강제:

```json
{
  "concern": "영상이 다루는 연애 고민 한 줄",
  "evidence": [{ "ts": "03:12", "quote": "영상 속 구체 발언/장면", "keyword": "댓글에 그대로 들어갈 핵심어" }], // 2~3개
  "viewer_tone": "인기 댓글 말투 요약",
  "comment": "최종 댓글"
}
```

`effort: "medium"` 명시.

**댓글 4단 구조**: ① 근거 장면 공감 → ② 페르소나의 연애 고민 → ③ "결국 인연/운명" 전환 → ④ "운명원 (연애)사주 잘 본다던데 나도 보고 싶다" (전언 + 미래 의향)

**검증기(코드)** — 실패 사유를 프롬프트에 붙여 재생성, 최대 3회:

1. 길이 40~120자 (`[...text].length`)
2. URL·`www`·`.com`·`#` 금지
3. `운명원` 정확히 1회
4. 후기 날조 금지: 운명원 관련 경험 완료형(`봤는데`, `받아봤`, `다녀왔`, `상담받`, `후기`, `맞더라`, `소름`) 차단
5. 근거 반영: evidence `keyword` 중 1개 이상이 댓글에 그대로 포함
6. 다양성: 최근 댓글과 문자 bigram Jaccard < 0.35

통과 결과·재시도 횟수를 Draft.validation에 저장 → 대시보드에 체크리스트로 표시.

---

## 6. 게시 자동화 (Playwright)

```
chromium.launchPersistentContext(profile.dir, { channel: 'chrome', headless: false, locale: 'ko-KR', args: ['--lang=ko-KR'] })
```

1. `opening` — 프로필 열기 → `youtube.com/watch?v=ID&hl=ko`
2. 로그인 확인(아바타 존재) — 없으면 실패 "로그인 필요"
3. 댓글 영역까지 스크롤, 댓글 사용 중지 감지 → 실패 사유
4. `typing` — 입력창 클릭 → `keyboard.type(char, {delay: 80~180ms 랜덤})`
5. `posting` — 한국어 aria-label "댓글" 버튼 클릭
6. `verifying` — 정렬 "최신순" → 내 채널명 + 본문 일치 댓글 탐지 → 타임스탬프 링크에서 `lc=` 추출 → commentUrl 저장
7. `posted` — 해당 댓글로 스크롤해 화면에 보이게 유지(시연용 3초) 후 종료

- 실패 시: 사유 분류 + `screenshots/{logId}.png` 저장. 제출 버튼 **전** 실패는 VideoLock 해제(`failed`), **후** 실패는 락 유지(`unverified` — 실제로 달렸을 수 있어 중복 게시 방지, 상한에도 포함)
- 제출 전 입력창 내용을 원문과 대조, 다르면 게시 중단
- 서버 기동 시 진행 상태로 남은 기록 정리: opening·typing → failed, posting·verifying → unverified
- 셀렉터는 한 파일(`youtube.selectors.ts`)에 모아 UI 변경 대응

**프로필 최초 로그인**: 자동화 크롬은 구글 로그인이 막힐 수 있음 → 일반 크롬을 `--user-data-dir=./profiles/youtube1`로 직접 실행해 수동 로그인(1회). README에 명령어 제공.

**프로필 배정(가점)**: 기본 "오늘 사용량 최소 프로필" 자동, 드롭다운 수동 변경 가능.

---

## 7. 화면

상단: 타이틀 · `오늘 3/10` 카운터 · 탭(대시보드 / 떡상 후보 / 기록)

- **① 영상 불러오기**: 소스 토글(키워드/채널) + [영상 불러오기] + 링크 입력창. 카드: 썸네일·제목·채널·게시일. 이미 단 영상은 "완료" 배지
- **② 영상 선택**: 선택 영상 요약 → 고민 한 줄 · 근거(타임스탬프 인용) · 댓글 초안(수정 가능, 실시간 글자수) · 검증 체크리스트 · [다시 생성] · 프로필 드롭다운
- **③ 댓글 달기**: [댓글 달기] → 스텝 표시(프로필 여는 중 → 입력 중 → 게시 중 → 확인 중 → 게시 완료) → [댓글 보기]. 실패 시 사유 + 스크린샷
- **떡상 후보 탭**: 최근 48h '연애' 검색 → 조회수 1,000~5,000 & 시간당 ≥150 필터 → 초안 생성까지만(게시 버튼 없음)
- **기록 탭**: 시간순 표 — 시각 · 영상 · 프로필 · 댓글 · 결과(성공 링크/실패 사유·스크린샷)

각 칸은 앞 단계 완료 전 비활성 + 안내 문구.

---

## 8. 테스트 영상 제작 (scripts/make-test-videos)

1. 대본 3개(1~1.5분): 남자심리 해석 / 썸 타다 연락 끊김 / 헤어진 연인 재회 고민 — 각자 구체 발언·장면 포함
2. `say -v Yuna` → 음성, 대본 문장별 자막 슬라이드 → ffmpeg 합성(mp4) + `.srt`
3. 사람: 유튜브1~3이 **아닌** 별도 업로드 전용 계정(본계정과 분리) 채널에 일부 공개 업로드 + 자막 파일 첨부 → 채널 ID를 `config.yaml sources.channels`에

---

## 9. 제작 의도 (제출 폼 + README 상단)

> 이 대시보드는 "댓글 한 개를 잘 쓰는 AI"보다 "계정을 안전하게 오래 운영할 수 있는 에이전트"를 목표로 설계했습니다.
>
> **1. 맥락은 근거로 보여준다.** AI가 자막에서 고민 한 줄과 인용 장면(타임스탬프)을 먼저 뽑고, 그중 하나를 반드시 짚어 댓글을 씁니다. 대시보드에 근거를 함께 띄워, 운영자가 "이 영상에서만 나올 댓글인지" 게시 전에 눈으로 확인할 수 있게 했습니다.
>
> **2. 유도는 소문의 형태로.** 시청자 댓글에서 광고가 티 나는 순간 신뢰가 깨집니다. 그래서 "운명원을 써봤다"가 아니라 "잘 본다던데 나도 보고 싶다"는 전언+의향 형태만 허용하고, 경험을 지어내는 표현은 코드 검증기로 차단합니다. 영상 고민 공감 → 내 고민 → 운명으로의 전환 → 운명원이라는 4단 흐름으로, 읽는 사람이 자기 고민을 대입하게 만들었습니다.
>
> **3. 규칙은 프롬프트가 아니라 코드로.** 글자 수·링크·해시태그·후기 날조·다른 댓글과의 유사도는 모델에 부탁하지 않고 검증기가 판정하며, 실패하면 사유를 붙여 재생성합니다. 영상당 1개와 하루 상한은 게시 직전 DB 트랜잭션에서 자리를 먼저 예약하는 방식이라, 버튼을 연타해도 중복 게시가 일어나지 않습니다.
>
> **4. 계정마다 다른 사람.** 프로필별 페르소나와 사용량 기반 자동 배정으로, 같은 브랜드를 언급해도 같은 사람이 반복하는 패턴이 보이지 않게 했습니다.
>
> **5. 사람은 마지막 승인자.** 초안은 수정·재생성할 수 있고, 수정본도 같은 규칙을 통과해야 게시됩니다. 자동화의 속도와 사람의 판단을 분리했습니다.
>
> 시연 게시는 플랫폼 정책과 타 채널 피해를 고려해 직접 제작한 테스트 영상에서 진행했고, 실제 연애 영상에 대해서는 불러오기·초안 생성·떡상 후보 탐지까지 시연했습니다.

---

## 10. 일정

- **D1 (11/18)**: 백엔드 전체(Youtube·Draft·Rules·Posting) + 테스트 영상 생성 + 규칙 단위 테스트 + 프로필1 실게시 성공
- **D2 (11/19)**: 프론트 3칸 + 떡상 후보·기록 탭 + 프로필 2·3 + README·다이어그램 → 시연 녹화(2~3분) → 제출 → 댓글 삭제

## 11. 사람 할 일 (준비물)

1. Anthropic API 키 발급(console.anthropic.com, 결제 등록)
2. YouTube Data API v3 키 발급(Google Cloud 콘솔)
3. 구글 계정: 유튜브1(필수), 유튜브2·3(가점) + 테스트 영상 업로드 전용 계정 — 전부 본계정과 분리된 별도 계정
4. 프로필 폴더별 수동 로그인 1회
5. 테스트 영상 3개 업로드
6. 시연 녹화(macOS 화면 기록) → 드라이브 전체 공개 또는 유튜브 링크 공유
7. `brew install yt-dlp`
