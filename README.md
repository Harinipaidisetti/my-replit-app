# NovaAI

## Overview

NovaAI is a personal AI assistant designed for students. Ask questions, learn concepts, get help with code, plan study sessions, and keep related messages together in conversations.

## Features

- Chat with an AI assistant that can use the current conversation as context.
- Start, revisit, and delete conversations.
- Keep chats and preferences saved in this browser.
- Use example prompts to get started.
- Switch between light, dark, and system appearance.
- Render formatted answers and copy code or full answers.
- Use the interface on desktop, tablet, or mobile.

## Technology Stack

- React, TypeScript, and Vite for the web app.
- Node.js and Express for the API.
- OpenAI Chat Completions for AI replies.
- Browser `localStorage` for conversation and preference persistence.
- OpenAPI, generated React Query hooks, and Zod schemas for the API contract.

## Project Structure

```text
artifacts/nova-ai/                  React frontend
artifacts/api-server/src/routes/    Shared Express API
lib/api-spec/openapi.yaml          API contract
lib/api-client-react/              Generated frontend API hooks
lib/api-zod/                       Generated server validation schemas
```

## How It Works

1. The browser saves conversations and settings in `localStorage`.
2. When you send a message, the frontend sends the recent chat messages to `POST /api/chat/completions`.
3. The Express server validates the request and contacts OpenAI using a secret stored on the server.
4. The server returns the assistant's answer to the browser, which adds it to the saved conversation.

The AI key is never sent to the browser.

## Environment Variables

Add this secret in Replit's **Secrets** tool:

| Name | Required for | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | AI replies | Your OpenAI API key. It must be stored as a Replit Secret, not in source code. |

Without this secret, the app still opens and conversation management works, but sending a prompt displays a setup message instead of a generated answer.

## Running the Project

The Replit workflows start the web app and API server. To run them manually:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/nova-ai run dev
```

To check the workspace:

```bash
pnpm run typecheck
```

## AI Integration

The frontend never talks directly to OpenAI. The API server reads `OPENAI_API_KEY` from the server environment and sends the conversation to OpenAI's chat completions endpoint. The system instructions ask NovaAI to be clear, beginner-friendly, and honest about uncertainty. API usage is billed by OpenAI to the owner of the key; it is not billed through Replit AI Integrations.

## Database

This version does not use a server database. Conversations and preferences are stored in the browser's `localStorage`, so they remain after a reload but are not shared across browsers, devices, or accounts. A server database can be added later if cross-device sync is needed.

## Security

- Never put `OPENAI_API_KEY` in React code, a `VITE_` variable, or a committed file.
- Store it only in Replit Secrets.
- The server validates message roles and size before calling the provider.
- The user interface shows safe error messages rather than stack traces or credentials.
- Do not put private or sensitive personal information into chats unless you understand the AI provider's data handling.

## Future Improvements

- Sign-in and private, cross-device conversation sync.
- Stream answers as they are generated.
- Conversation search and export.
- Additional model and response-length settings.

## Troubleshooting

- **“AI responses aren't connected yet”** — add `OPENAI_API_KEY` in Replit Secrets and restart the API workflow.
- **“Couldn't process that request”** — check the API workflow logs and confirm the OpenAI key is valid and has access to the selected model.
- **Chat history is missing on another device** — this version saves chats only in the current browser profile.
- **The app does not load** — restart the NovaAI web workflow and the API Server workflow, then check their logs.

## Files to Understand First

1. `artifacts/nova-ai/src/App.tsx` — the frontend app.
2. `artifacts/nova-ai/src/index.css` — the visual theme.
3. `artifacts/api-server/src/routes/chat.ts` — server validation and AI request.
4. `lib/api-spec/openapi.yaml` — the API shape shared by the frontend and backend.