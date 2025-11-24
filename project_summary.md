# Gemini File Search RAG PoC 프로젝트 개요

본 문서는 Google Gemini의 최신 **File Search API**를 활용하여 **RAG (Retrieval-Augmented Generation, 검색 증강 생성)** 시스템을 구축한 PoC(Proof of Concept) 프로토타입에 대한 정리입니다.

## 1. 프로젝트 목적
이 프로젝트의 주 목적은 **Gemini 2.0/2.5 모델**과 **File Search API**를 연동하여, 사용자가 업로드한 문서를 기반으로 정확하고 맥락에 맞는 답변을 제공하는 AI 챗봇의 기술적 타당성을 검증하는 것입니다. 특히 한글 문서 처리와 대용량 문서 검색의 효율성을 확인하는 데 중점을 두었습니다.

## 2. 주요 구현 기능

### 📂 문서 관리 (File Management)
*   **다양한 포맷 지원:** `.txt`, `.pdf`, `.md`, `.csv` 등 텍스트 기반 문서 업로드 지원.
*   **한글 파일명 완벽 지원:** SDK의 인코딩 이슈를 해결하기 위한 **'Rename-Upload-Cleanup'** 전략 적용.
*   **자동 인덱싱:** 서버 시작 시 또는 파일 업로드 시 자동으로 Gemini Vector Store(File Search Store)에 문서를 임베딩하고 인덱싱함.
*   **영구 저장소:** 업로드된 파일은 로컬 서버와 Gemini 클라우드 저장소에 동기화되어 관리됨.

### 💬 AI 채팅 (RAG Chat Interface)
*   **문맥 기반 답변:** 사용자의 질문과 관련된 문서 내용을 자동으로 검색(Retrieval)하여 답변 생성.
*   **실시간 스트리밍:** 답변 생성 과정을 실시간으로 보여주는 스트리밍 UI 구현.
*   **출처 기반:** AI가 답변을 생성할 때 어떤 문서를 참조했는지 내부적으로 활용 (UI 확장은 가능).
*   **에러 핸들링:** API 사용량 초과(429 Error) 등 예외 상황에 대한 사용자 친화적 안내 메시지 제공.

## 3. 기술 스택 (Tech Stack)

### Backend (Server)
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **AI SDK:** `@google/genai` (Google의 최신 Gemini SDK)
*   **File Handling:** `multer` (파일 업로드 처리), `fs` (파일 시스템 제어)

### Frontend (Client)
*   **Core:** HTML5, Vanilla JavaScript
*   **Styling:** Tailwind CSS (CDN)
*   **Icons:** FontAwesome

### AI & Cloud
*   **Model:** `gemini-2.5-flash` (고속, 고효율 모델)
*   **Feature:** Gemini File Search API (Vector Database & Semantic Search)

## 4. 동작 원리 (Workflow)

### 1단계: 문서 업로드 및 처리
1.  사용자가 웹 UI를 통해 파일을 업로드합니다.
2.  서버는 파일을 로컬 `uploads/` 폴더에 저장합니다.
3.  **전처리:** 한글 파일명 깨짐 방지를 위해 임시 ASCII 이름으로 복사본을 생성합니다.
4.  **업로드:** Gemini Files API로 파일을 전송합니다.
5.  **인덱싱:** 업로드된 파일을 **File Search Store**로 가져와(Import) 벡터화 및 인덱싱을 수행합니다.
6.  **정리:** 임시 파일을 삭제하고 원본 파일명으로 메타데이터를 유지합니다.

### 2단계: 질문 및 답변 (RAG)
1.  사용자가 채팅창에 질문을 입력합니다.
2.  서버는 질문과 함께 `fileSearch` 도구 설정을 포함하여 Gemini API를 호출합니다.
3.  **Gemini 엔진:**
    *   질문의 의도를 파악합니다.
    *   File Search Store에서 질문과 관련된 문서 조각(Chunk)을 검색합니다.
    *   검색된 내용을 바탕으로 답변을 생성합니다.
4.  생성된 답변이 사용자에게 실시간으로 스트리밍됩니다.

## 5. 결론
이 프로토타입은 별도의 복잡한 벡터 DB(Pinecone, Chroma 등) 구축 없이, **Gemini API 하나만으로** 강력한 성능의 RAG 시스템을 빠르고 쉽게 구축할 수 있음을 입증했습니다. 특히 최신 SDK를 활용하여 개발 복잡도를 낮추고 유지보수 편의성을 높였습니다.
