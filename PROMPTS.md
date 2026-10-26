# Development prompts

These are the user requests from this development session, in the order they were sent. Operational requests such as starting the server are included because they happened. No extra prompts were invented.

1. Inspect the existing MERN Task Manager and explain where the React app, Express API, MongoDB task storage, and CRUD files are, plus the safest place to add an AI breakdown feature. Do not modify files.

2. Prepare an implementation plan for an AI Task Breakdown Assistant. Keep the existing task routes unchanged, add a separate endpoint that returns unsaved steps, keep the API key on the server, add a review-and-save flow in React, and separate confirmed facts from assumptions. Do not modify files.

3. Implement `POST /api/tasks/:id/breakdown` in `server/server.js` with the Gemini REST API, model `gemini-2.5-flash` by default, Node's built-in `fetch`, and the specified validation and error statuses. Do not change the task schema, `formatTask`, or the existing task routes. Do not modify client files.

4. Run `node server.js`.

5. Add the breakdown button, loading state, review panel, cancel action, and save-selected flow to `client/src/App.jsx`, using the existing `POST /api/tasks` endpoint for accepted steps.

6. Style the breakdown button and review panel in `client/src/App.css` to match the existing task manager, including selected steps, loading, errors, focus, and small screens. Do not change unrelated CSS.

7. Run `node server.js` again.

8. Run the app.

9. Diagnose why **AI breakdown is not configured** appears. Inspect dotenv loading, add a startup log that prints only whether `GEMINI_API_KEY` is present, and do not expose the key.

10. Make dotenv load `server/.env` relative to `server/server.js` with `__dirname`.

11. Run the app again.

12. Debug **Could not generate steps**. Log the Gemini status and a short safe provider summary. Do not change the model or endpoint until the error is identified.

13. Finish the AI task manager: confirm the failure with logs, fix Gemini integration only if the configured model is unavailable, preserve the existing CRUD behavior, verify the React flow, test what can be tested, and add README, learning-journal, prompt, and deployment notes. The request was cut off at "Hosting versus".
