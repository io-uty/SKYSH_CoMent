# SKYSH_CoMent

# CoMent (코멘트)

> **수익률이 검증된 멘토와 초보 투자자를 연결하는 1:1 코인 투자 코칭 플랫폼**
> 검증된 정보와 감정 개입만 제공하여 정보 및 감정의 비대칭성을 해소합니다.

---

## 왜 지금인가? (시장의 기회)
* **업비트 누적 회원:** 1,326만 명 (2025)
* **2030세대 이용률:** 해당 인구의 44%
* **핵심 문제:** 조작 가능한 리딩방/유튜브 정보 비대칭 & 초보자의 FOMO/패닉셀 감정 비대칭
* **우리의 솔루션:** 국내 최초 '검증된 투자 코칭 및 AI 감정 가이드 제공'

---

## 핵심 기능 (MVP Scope)
1. **정제된 AI 리포트 (Claude 3.5 Sonnet)**
   * 멘토의 복잡한 글을 초보자가 2분 만에 읽을 수 있는 3줄 요약 카드로 변환
   * 불법 리딩방 유도 문구를 사전에 차단하는 AI 가드레일 내장
2. **수익률 검증 시뮬레이션**
   * 업비트 Open API 연동 기반의 조작 불가능한 6개월 누적 수익률 인증 프로필


---

## Tech Stack
* **Frontend:** Vite, React, TypeScript
* **Backend:** Firebase (Firestore, Cloud Functions v2)
* **AI:** Claude API (`claude-3-5-sonnet-20241022`)
* **Language:** TypeScript

---

## Local Frontend

```bash
npm install
npm run dev
```

프론트엔드는 Firebase 설정이 없거나 Firestore 컬렉션이 비어 있어도 초기 UI를 확인할 수 있도록 seed data fallback을 사용합니다.

사용 컬렉션:

* `mentors`
* `signals`
* `alerts`
