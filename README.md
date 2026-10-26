# TaskFlow

TaskFlow is a personal task manager. It stores tasks in MongoDB and can ask Google Gemini to suggest smaller steps for one task. Suggested steps are shown for review and are saved only when you choose them. Saved steps become normal tasks.

## Features

- Create, list, edit, and delete tasks.
- Change status between Pending, In Progress, and Completed.
- Search by title and filter by status.
- See counts for all, pending, in progress, and completed tasks.
- Break one task into suggested steps, review them, and save the ones you want.

## Technology stack

- React 19 and Vite in `client/`
- Node.js 24, Express, and Mongoose in `server/`
- MongoDB
- Google Gemini REST API, called with Node's built-in `fetch`

## Architecture

The browser talks only to the Express API. Express talks to MongoDB and, for breakdown requests, to Gemini. The Gemini API key stays in `server/.env`.

```text
React button
  -> POST /api/tasks/:id/breakdown
    -> Express loads the task from MongoDB
    -> POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
    -> Express returns { taskId, title, steps }
  -> The review panel stays in the browser
  -> Save Selected Steps calls POST /api/tasks once per chosen step
```

`server/server.js` loads `server/.env` from its own folder with `__dirname`, so the terminal's working directory does not choose the env file.

The default model is `gemini-3.5-flash`. `gemini-2.5-flash` returns HTTP 404 for new Gemini users. The model named in that 404 response, `gemini-3.8-flash`, accepted `generateContent` but did not answer within 55 seconds during testing. `gemini-3.5-flash` returned a JSON array of step titles on the same endpoint in about 4 seconds, so that is the configured model.

## Prerequisites

- Node.js 24
- A MongoDB connection string
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Local installation

From the project root:

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set `MONGODB_URI` and `GEMINI_API_KEY`. Leave `GEMINI_MODEL` as `gemini-3.5-flash` unless you have tested another model.

```bash
cd ../client
npm install
```

## Startup

Start the API from `server/`:

```bash
cd server
npm start
```

The API listens on port 5001 unless `PORT` is set. On startup it prints whether `GEMINI_API_KEY` is present. It does not print the key.

Start the React app from `client/`:

```bash
cd client
npm run dev
```

Open http://localhost:5173. The client calls http://localhost:5001/api/tasks unless `VITE_API_URL` is set.

## Environment variables

Copy the examples and fill in real values only in the ignored `.env` files.

| Name | Where | Purpose |
|---|---|---|
| `MONGODB_URI` | `server/.env` | MongoDB connection string |
| `PORT` | `server/.env` | API port. Defaults to 5001 |
| `GEMINI_API_KEY` | `server/.env` | Gemini key. Server only |
| `GEMINI_MODEL` | `server/.env` | Gemini model. Defaults to `gemini-3.5-flash` |
| `VITE_API_URL` | `client/.env` | Optional API base URL, including `/api/tasks` |

`server/.env.example` and `client/.env.example` contain placeholders only.

## API

Task responses use `{ id, title, status }`. `status` is `Pending`, `In Progress`, or `Completed`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/tasks` | Returns tasks, newest first |
| `POST` | `/api/tasks` | Body `{ "title" }`. Creates a Pending task |
| `PATCH` | `/api/tasks/:id` | Updates `title` and/or `status` |
| `DELETE` | `/api/tasks/:id` | Deletes one task |
| `POST` | `/api/tasks/:id/breakdown` | Returns suggested steps and does not write to MongoDB |

Breakdown success:

```json
{ "taskId": "...", "title": "Write a status update", "steps": ["Gather the facts", "Draft the note"] }
```

| Status | When |
|---|---|
| 400 | The task id is not a valid MongoDB id |
| 404 | No task has that id |
| 429 | Gemini rate-limits the request |
| 502 | Gemini times out, returns an error, or returns unusable text |
| 503 | `GEMINI_API_KEY` is missing |

The server log records the provider HTTP status and a short error summary. The browser receives only the safe `message` above.

## Testing

There is no automated test suite. From `server/`:

```bash
node --check server.js
```

Manual checks that were run against this project are listed in `LEARNING.md`. To repeat the breakdown check, restart the API and click **Break into Steps** on a saved task. The task count should stay the same until you press **Save Selected Steps**.

## Security

- Keep `GEMINI_API_KEY` and `MONGODB_URI` in `server/.env`.
- Do not put those values in React, in `client/.env`, or in Git.
- Root `.gitignore` ignores `.env` and `.env.*`, and allows `.env.example`.
- The API currently allows every browser origin. Restrict that before a public deployment.
- There are no user accounts. Anyone who can reach the API can read and change tasks.

## Known limitations

- Saved steps are separate tasks. They are not stored as children of the original task.
- Search and filters run in the browser on the loaded task list.
- `gemini-3.8-flash` did not answer `generateContent` within 55 seconds in testing, so it is not the default.
- A Gemini rate limit is mapped to HTTP 429 in code. That path was not triggered during testing.

## Deployment

Use three pieces: the static React app, the Express API, and MongoDB.

- **Database:** MongoDB Atlas. Put the Atlas connection string in the API host's `MONGODB_URI`. Allow the host's IP, or use Atlas's recommended network access for that host.
- **API:** A Node.js 24 service with its working directory set to `server/`. Start command: `npm start`. Set `MONGODB_URI`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `PORT` in the host's environment. The app still reads `server/.env` when that file exists.
- **Frontend:** Run `npm run build` in `client/` and host the `dist` folder as a static site. Set `VITE_API_URL` at build time to the public API origin plus `/api/tasks`, for example `https://your-api.example.com/api/tasks`.

The browser must be allowed to call the API. `cors()` currently allows all origins. For a public site, limit that to the frontend origin before launch.

Do not put `GEMINI_API_KEY` in the frontend build.
