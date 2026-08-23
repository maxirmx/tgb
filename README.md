# Telegram → GitHub Bridge

A private, self-hosted Telegram bot that collects forwarded messages and turns them into:

- a new GitHub issue in a selected repository;
- a comment on an open issue in a selected repository.

The bot runs with Telegram long polling, so it does not need a public domain, HTTPS certificate, or webhook.

## What the first version supports

- Multiple forwarded messages in one draft.
- Text, captions, and placeholders for common media types.
- Repository selection using Telegram buttons.
- Open-issue selection from the chosen repository.
- Pagination for long lists.
- Persistent drafts across restarts.
- A Telegram user allowlist.
- Docker or direct Node.js execution.

## 1. Create the Telegram bot

1. Open `@BotFather` in Telegram.
2. Send `/newbot` and follow the prompts.
3. Save the bot token.

## 2. Create a GitHub token

This private MVP uses one server-side personal access token. Give it access only to the repositories you intend to use.

Required capabilities:

- Issues: read and write.
- Repository metadata: read.

For a classic token, use the `repo` scope for the prototype, or replace it with a GitHub App before sharing the bot with other users.

## 3. Configure it

Copy `.env.example` to `.env` and enter the Telegram and GitHub tokens.

Initially leave `TELEGRAM_ALLOWED_USER_IDS` empty. Start the bot, send `/whoami`, copy the numeric ID it returns, add it to `.env`, and restart. While the allowlist is empty, the bot rejects everything except `/whoami`.

Example:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:replace-me
TELEGRAM_ALLOWED_USER_IDS=123456789
GITHUB_TOKEN=github_pat_replace_me
DATA_FILE=/data/state.json
```

Never commit `.env`.

## 4. Run with Docker

```sh
docker compose up --build -d
docker compose logs -f bridge
```

After adding your Telegram ID to `.env`, restart:

```sh
docker compose up -d
```

State is stored in the Docker volume `bridge-data`.

## Run directly with Node.js

Node.js 20 or newer is required.

```sh
npm install
npm run build
npm start
```

For direct execution, change `DATA_FILE` to `./data/state.json`.

## Using the bot

1. Forward one or more messages to the bot.
2. Tap **Create issue** or **Add comment**.
3. For an issue:
   - choose the repository;
   - send the issue title.
4. For a comment:
   - choose the repository;
   - choose an open issue in that repository.
5. The bot replies with the new GitHub URL and clears the draft.

Useful commands:

- `/start` — show help.
- `/whoami` — show your Telegram numeric user ID.
- `/cancel` — cancel the current picker but keep the draft.
- `/clear` — discard the draft and current picker.

## First-version limits

- The bot uses one GitHub identity from `GITHUB_TOKEN`; there is no per-user GitHub OAuth yet.
- GitHub returns up to 100 repositories and 100 open issues per selected repository in this version.
- Only open issues are shown for comments.
- Telegram files are represented by placeholders; they are not uploaded to GitHub.
- Protected Telegram content that cannot be forwarded cannot be captured.
- The JSON state store is intended for a personal bot, not a high-volume multi-user service.

## Development checks

```sh
npm run typecheck
npm test
npm run build
```
