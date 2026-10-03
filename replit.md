# NovaAI

NovaAI is a student-focused personal AI chat app for learning, coding help, writing, brainstorming, and study planning.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the shared API server
- `pnpm --filter @workspace/nova-ai run dev` — run the NovaAI web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secret for AI replies: `OPENAI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, TypeScript, and Vite
- API: Express 5; calls OpenAI Chat Completions from the server
- Persistence: browser `localStorage` for conversations and preferences
- Validation: generated Zod schemas
- API codegen: Orval from the OpenAPI spec
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nova-ai/` — React chat app, settings, and appearance.
- `artifacts/api-server/src/routes/chat.ts` — server-side OpenAI request and validation.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `lib/api-client-react/` and `lib/api-zod/` — generated client hooks and validation schemas.
- `README.md` — beginner setup and project guide.

## Architecture decisions

- Chat history and preferences are stored in browser `localStorage`; they do not sync across devices.
- The frontend sends AI requests to the shared API server; provider credentials stay server-side.
- Without `OPENAI_API_KEY`, the API reports that setup is needed instead of generating sample replies.

## Product

- Start chats from example prompts, continue conversations with context, and revisit or delete saved chats.
- Supports light, dark, and system appearance, plus keyboard and timestamp preferences.
- AI responses display formatted text and copyable code snippets.

## User preferences

- Keep the implementation beginner-friendly, avoid unnecessary complexity, and explain important decisions in simple terms.

## Gotchas

- After editing `lib/api-spec/openapi.yaml`, rerun `pnpm --filter @workspace/api-spec run codegen`.
- The NovaAI web preview uses `/`; API requests use the shared `/api` service.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
