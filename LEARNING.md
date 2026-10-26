# Learning journal

## 1. What I built

TaskFlow is a MERN task manager with an AI breakdown step. React lists, creates, edits, deletes, searches, filters, and updates tasks through Express. Express stores each task as a title and a status in MongoDB.

The added feature is a **Break into Steps** button. It calls `POST /api/tasks/:id/breakdown`. Express reads that task and asks Gemini for 3 to 6 short titles. The browser shows those titles with checkboxes. Nothing is saved until **Save Selected Steps**, which creates one normal Pending task per selected title through the existing create endpoint.

## 2. What broke and how I debugged it

The first breakdown click showed **AI breakdown is not configured**. The route returns that message only when `GEMINI_API_KEY` is missing or blank. The server log said `injected env (2) from .env`, and the saved `server/.env` contained only `MONGODB_URI` and `PORT`. A startup log was added that prints `GEMINI_API_KEY present:` plus `true` or `false`, never the key. After the key was saved, that line printed `true`.

`dotenv` was also called with no path, so it read `.env` from the terminal's current directory. It now loads `path.join(__dirname, ".env")`, which is `server/.env` even when the process is started from another folder.

The next click showed **Could not generate steps**. The server log showed Gemini HTTP 404. The response body said `models/gemini-2.5-flash` is no longer available to new users and named `models/gemini-3.8-flash`. The handler now logs the provider status and a short redacted summary. The browser still receives only `Could not generate steps`.

`gemini-3.8-flash` supports `generateContent`, but live calls with this key did not return within 20, 25, or 55 seconds. `gemini-3.5-flash`, using the same URL, header, and JSON-array request, returned five step titles in about 4 seconds. `GEMINI_MODEL` and the code default were changed to `gemini-3.5-flash` for that reason.

## 3. What I will try next

- Call `gemini-3.8-flash` again if its `generateContent` latency improves, and keep `gemini-3.5-flash` until a live call succeeds.
- Restrict CORS to the deployed frontend origin.
- Replace the hardcoded local API assumption with the production `VITE_API_URL` during the frontend build.
- Add a parent id only if saved steps need to stay attached to the original task.
