# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wealth Manager is an **AI-native conversational accounting app** built with React Native (Expo SDK 52) + TypeScript, targeting iOS / Android / Web. Users interact via chat; an agent system interprets intents and invokes tools to manage bills, budgets, assets, debts, and analytics.

## Commands

```bash
npm test                   # Jest full suite (fast, <3s, all mocks, no Expo boot)
npm run typecheck          # tsc --noEmit (must be zero errors)
npm run lint               # ESLint (must be zero errors)
```

Run a single test file:
```bash
node node_modules/jest/bin/jest.js src/__tests__/tools/bills.tool.test.ts
```

## CI Rules

- **Every push/PR** runs: `typecheck` → `jest`
- **APK build** only triggers when commit message contains `[build]`
- **AI agents must NOT use `[build]`** in commit messages — no build permission

## Architecture (DDD Six-Layer)

```
UI (src/ui/) → Application (src/application/) → Domain (src/domain/)
                                                       ↓
Infrastructure (src/infrastructure/) ← Agents (src/agents/) ← Tools (src/tools/)
```

- **Domain layer** (`src/domain/`): Aggregate roots, value objects, domain events, repository interfaces. Bounded contexts: billing, budget, asset, debt, gamification, analytics, automation, rules.
- **Infrastructure layer** (`src/infrastructure/`): Repository implementations (SQLite), DomainEventBus.
- **Application layer** (`src/application/`): Use-case orchestration (e.g., `BillingService` injects Repository + EventBus).
- **Agents layer** (`src/agents/`): MasterOrchestrator does NLU → routing. Specialized agents: ledger, analyst, coach, guardian. Shared infra in `_shared/`.
- **Tools layer** (`src/tools/`): 80+ tool functions organized by domain (bills, budget, stats, debt, etc.). Pipeline infrastructure in `_pipeline/`.
- **Core layer** (`src/core/`): Infrastructure primitives — database (expo-sqlite), cache (LRU + circuit breaker), message-bus (pub/sub + dead-letter), memory engine (4 tiers), vector store, LLM API, logger, persona engine, hash chain, notifications.
- **UI layer** (`src/ui/`): Chat screen with message bubbles, input bar, quick bar. Card system for structured responses. ECharts via WebView sandbox (no network, no JS injection).

## Key Patterns

- **Agent communication**: MessageBus pub/sub with dead-letter queue (not direct calls)
- **Cross-context events**: DomainEventBus with at-least-once delivery, eventType routing
- **Caching**: MemoryCache (LRU 500 entries, 30min TTL) with circuit breaker for idempotent tools
- **Charts**: ECharts 5.5 rendered in a local WebView sandbox — zero network dependency, JSON schema validation
- **Hash chain**: SHA-256 chained hashing for audit integrity

## Code Conventions

- New features: create aggregate root in `domain/`, implement Repository in `infrastructure/`
- Legacy: `tools/` and `agents/` are being migrated incrementally — don't rewrite all at once
- Naming: aggregate roots are PascalCase singular (`Bill`, `SavingsGoal`); events follow `{Aggregate}{Verb}Event`
- Path alias: `@/*` maps to `src/*`
- **Do not introduce new npm dependencies** — use existing expo/react-native ecosystem only
- Tests mirror source: `src/__tests__/{module}/` corresponds to `src/{module}/`

## Testing Conventions

- Tests use **pure mocks** — no Expo runtime, no real SQLite, no network
- Tests run in `src/__tests__/` subdirectories: agents, charts, cloud, core, domain, safety, shared, tools
- Current stats: 24 suites, 366+ tests, all passing in <3s

## Related Documentation

| Doc | Path |
|-----|------|
| Architecture standards V2.0 | `标准/01-技术架构标准.md` |
| DDD refactor blueprint | `docs/CurrentTask/spec-ddd.md` |
| Data model standards | `标准/03-数据模型标准.md` |
| Security standards | `标准/04-安全标准.md` |
| Testing & performance standards | `标准/05-测试与性能标准.md` |
| UI design standards | `标准/06-UI设计标准.md` |
