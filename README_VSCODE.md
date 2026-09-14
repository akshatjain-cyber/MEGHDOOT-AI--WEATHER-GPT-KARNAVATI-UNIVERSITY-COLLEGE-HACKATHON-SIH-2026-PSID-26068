# Meghdoot Rescue Command — VS Code Setup

This is the VS Code-ready setup for the Meghdoot rescue-weather assistant. It includes the dark crimson/green UI, geofenced rescue-area map, nearby refugee and rescue-center discovery, multilingual AI responses, and browser speech controls.

## Requirements

Install the following before opening the project:

- **Node.js 22 LTS** or newer
- **pnpm 10**
- **Git** (optional but recommended)
- **VS Code** with the extensions listed below
- A MySQL-compatible database if you want authentication, saved locations, conversation history, and preferences to persist

## Open in VS Code

1. Extract the project zip.
2. Open the extracted `meghdoot-rescue-command` folder in VS Code.
3. Open the integrated terminal at the project root.

## Install dependencies

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
```

If Corepack is unavailable, install pnpm globally:

```bash
npm install -g pnpm@10
pnpm install
```

## Configure environment variables

Create a `.env` file at the project root and fill in the values supplied by your deployment or Manus environment:

```bash
touch .env
```

Required values for the complete authenticated app are:

```env
DATABASE_URL=mysql://user:password@host:3306/database
JWT_SECRET=replace-with-a-long-random-secret
VITE_APP_ID=your-oauth-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=your-owner-open-id
OWNER_NAME=Your Name
BUILT_IN_FORGE_API_URL=https://forge.butterfly-effect.dev
BUILT_IN_FORGE_API_KEY=your-server-side-forge-key
VITE_FRONTEND_FORGE_API_URL=https://forge.butterfly-effect.dev
VITE_FRONTEND_FORGE_API_KEY=your-browser-safe-forge-key
```

Do not commit `.env` or expose server-side keys in browser code.

## Database

After configuring `DATABASE_URL`, generate or apply the Drizzle schema as needed:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

The project includes the persistence schema for users, preferences, saved locations, conversations, and chat messages.

## Run locally

```bash
pnpm dev
```

Open the local URL printed by the terminal, normally `http://localhost:3000`.

## Validate before deployment

```bash
pnpm check
pnpm test -- --run
pnpm build
```

The current test suite covers authentication logout, persistence schema, rescue geofence helpers, and multilingual text-to-speech helpers.

## Voice and response speed

Prompt submission uses instant local Unicode-script detection instead of making a separate language-detection LLM request before every answer. This removes one network round trip from the normal path. Speech uses the best matching browser voice for the selected locale and prefers natural, neural, Google, Microsoft, or named premium voices when the operating system exposes them. No ElevenLabs key is bundled in the project; adding one would require a server-side connector and paid API credentials.

## Latest language behavior

Use the **Response language** selector above the AI conversation or open **Language & speech** in the sidebar. The selected language is authoritative for both the AI text reply and speech output. Supported choices include English, Hindi, Kannada, Tamil, Telugu, Gujarati, Bengali, Marathi, Malayalam, Punjabi, Urdu, Español, Français, العربية, 中文, and 日本語.

## Essential commands

```bash
# Open the project
cd meghdoot-rescue-command

# Use the project’s supported pnpm version
corepack enable
corepack prepare pnpm@10.4.1 --activate

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

Open the local URL shown by the dev server. For validation and production output:

```bash
pnpm check
pnpm test -- --run
pnpm build
pnpm start
```

Create a local `.env` file only when running outside the managed Manus environment. Use the environment values supplied by your deployment; never commit secrets to Git or the ZIP archive.

## Production start

```bash
pnpm build
pnpm start
```

## VS Code recommendations

Recommended extensions:

- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- Error Lens

## Recent UI behavior

Language detection now works silently. Voice input can still detect and switch the response language automatically, but the user no longer sees a toast announcing that Meghdoot detected a language or will reply/speak in that language.

## Project structure

- `client/src/pages/Home.tsx` — main Meghdoot application and assistant UI
- `client/src/components/RescueMap.tsx` — geofence and nearby rescue-area map
- `client/src/index.css` — dark visual system and responsive layout
- `server/routers.ts` — weather, AI, language detection, rescue-area, and persistence procedures
- `drizzle/schema.ts` — database schema
- `server/*.test.ts` and `client/src/pages/*.test.ts` — regression tests
