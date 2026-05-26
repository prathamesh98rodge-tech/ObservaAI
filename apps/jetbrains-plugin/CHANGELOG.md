# Changelog

## [0.1.0] — 2026-05-26

### Added
- Live Metrics tool window with session summary, per-provider breakdown, and budget alert cards
- Status bar widget: `⬡ 12.3K · $0.04` — live token count and cost; click to open tool window
- Budget alert balloon notifications with deduplication (each alert shown once per session)
- Multi-workspace team API key support (`X-ObservaAI-Team-Key`)
- Settings page under Tools → ObservaAI (gateway URL, team API key, enabled toggle)
- Persistent settings stored in `observaai.xml` via `PersistentStateComponent`
- Dark/light theme auto-detection for the metrics panel
