# 관리자 로그인 수정 — 2026-10-05

- 운영 오류: Supabase minsook-farm-db 중지(INACTIVE), 서버 연결 오류로 로그인 실패.
- admin.html: 입력칸 자동완성 억제 및 페이지 복귀 시 초기화, 로그인 진행 표시, 중복 제출 방지, 15초 응답 제한, 오류 안내, 통신 실패 시 가짜 로컬 로그인 제거.
- 테스트: node tests/admin-login.test.cjs 통과.
- 배포: dpl_GRYoRjLyZqUDMNANXGEgPGtuveC7, https://minsook-farm.vercel.app/admin
- 배포 기준: 운영 커밋 b23f7a11dc354f84bcfebdf2a795fcf6a2a87a5a + admin.html 변경만 포함. 다른 미완료 작업은 배포하지 않음.
- 최종 확인: Supabase ACTIVE_HEALTHY, 운영 관리자 로그인 성공 및 관리자 화면 진입 확인.
