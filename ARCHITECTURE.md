# SpeakFlow MVP architecture — defined before implementation

## Information architecture

One portable HTML application, with hash-based views: `#home`, `#sound`, `#speak`, `#routine`, `#history`. Sound Lab remains the existing full working surface; the old dialogue library remains a Sound Lab resource. Speak Lab is the new conversation mode. History contains the active-expression library.

## Page structure

- Home: editorial welcome, one primary “Start my 15 minutes” action, and two clear mode entries.
- Sound Lab: existing sentence analysis, teaching, media-synced karaoke and real configurable pronunciation assessment.
- Speak Lab: scenario + difficulty → four learner turns with a conversation partner → review with at most two useful rewrites and exactly three expressions → similar conversation with those expressions as targets.
- Daily routine: 3-minute Listen, 3-minute Notice, 3-minute Shadow, 4-minute Speak, 2-minute Review. One stage action and a quiet elapsed-time progress indicator. Pause on backgrounding; never count unattended tab time as speaking.
- History: local-day speaking duration, completed shadowing attempts, newly collected expressions, meaningful-activity streak, recent conversations, and expression mastery controls.

## Components

AppShell / ViewRouter; HomePracticeCard; existing SoundLab; ScenarioGrid + LevelSelector + CustomScenario; ConversationStage + TurnProgress + VoiceComposer; SpeakingReview + ExpressionCards; RoutineTimer + StageGuide; TodayMetrics + RecentSessions + ExpressionLibrary; ProviderSettings.

All modal and error states have accessible names. Responsive layouts avoid overflow, support keyboard operation and reduced motion. Main screens have one visually dominant action.

## Data model

Versioned local state: `{version, events[], sessions[], expressions[], preferences, routine}`.

- PracticeEvent: id, timestamp, local date, type, source, durationSeconds, optional sentence. Only actual captured voice duration contributes to speaking time; typed and demo answers contribute zero seconds.
- ConversationSession: id, scenario, difficulty, providerMode, targetTurns, messages, review, retryOf, completedAt. Persist confirmed text and completed reviews; no audio blobs or credentials.
- Message: id, role, text, inputSource, optional in-memory audio URL and recorded duration.
- Review: up to two `{said, natural, note}` improvements, exactly three `{phrase, meaningZh, example}` expressions, providerMode.
- Expression: id, phrase, meaningZh, example, sourceSessionId, createdAt, understood, usable, lastPractisedAt. “Usable” implies “understood”. Collection is not proof of mastery; distinguish collected phrases from usable phrases.
- Routine: local day, stage index, elapsedByStage, completedStage flags; running state is not resumed automatically on reload.

Local storage failures fall back to in-memory state and show a clear message. Local dates and streaks use the browser’s local timezone. History starts empty, with no invented minutes, streaks or mastery.

## State flows

Conversation: select → starting → ready → capturing → transcribing → editable draft → responding → ready; after four learner replies: complete → reviewing → review. Errors preserve messages and allow retry without duplicating the learner’s turn. New sessions invalidate old asynchronous callbacks. Retry reuses the scenario and level with a changed opener, and displays the three target expressions.

Voice: idle → permission → recording → stop → transcript confirmation → send. Browser SpeechRecognition is used where available. Otherwise the learner may type what they said or deliberately choose a labeled demo answer. An uploaded-audio STT provider may be configured later. Never invent a transcript for an actual recording.

Routine: ready → running ↔ paused → time complete → next stage. Background tabs pause the clock; manual early advancement is visible and never fabricates elapsed minutes. Speak and Sound practice events feed history independently of the routine timer.

## Provider seams

- Conversation provider: `start(context)`, `reply(context)`, `review(context)`. Demo provider is explicitly labeled and uses prepared scenario paths plus meaning-based acknowledgements. Remote provider uses a configurable HTTPS/localhost endpoint with operation, level, scenario, transcript and pedagogical instructions.
- STT provider: `transcribe({blob, language}) → {text}`. Native browser recognition may run alongside capture. A configurable endpoint accepts the actual audio.
- TTS provider: reuse SpeakFlow speech providers or inject `speak()` and `cancel()`; level changes the reading rate.
- Existing Azure pronunciation scoring stays intact and separate from conversation review.

No model secrets are bundled. Connection settings remain in memory. All dynamic user/provider text is escaped. Mock conversation output is labeled as demo; it does not fabricate pronunciation assessment or claim to understand arbitrary custom scenarios.

## Validation scope

Preserve existing Sound Lab checks. Add bounded checks for scenario/level coverage, four-turn behavior, exactly one follow-up per nonfinal response, feedback traceability, retry targets, active vocabulary state, local history/streaks, background timer behavior, provider errors and async cancellation. Real external APIs require user-supplied services and are not claimed verified without credentials.
