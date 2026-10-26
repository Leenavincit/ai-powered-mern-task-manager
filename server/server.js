
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Task Schema
const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending"
    }
  },
  {
    timestamps: true
  }
);

const Task = mongoose.model("Task", taskSchema);

// Format MongoDB task for the React frontend
function formatTask(task) {
  return {
    id: task._id.toString(),
    title: task.title,
    status: task.status
  };
}

// GET: Retrieve all tasks
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks.map(formatTask));
  } catch (error) {
    console.error("Fetch tasks error:", error.message);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

// POST: Add a new task
app.post("/api/tasks", async (req, res) => {
  try {
    const { title } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        message: "Task title is required"
      });
    }

    const task = await Task.create({
      title: title.trim(),
      status: "Pending"
    });

    res.status(201).json(formatTask(task));
  } catch (error) {
    console.error("Create task error:", error.message);
    res.status(500).json({ message: "Failed to create task" });
  }
});

// PATCH: Update a task's title or status
app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const updates = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({
          message: "Task title cannot be empty"
        });
      }

      updates.title = title.trim();
    }

    if (status !== undefined) {
      if (!["Pending", "In Progress", "Completed"].includes(status)) {
        return res.status(400).json({
          message: "Invalid task status"
        });
      }

      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "Provide a title or status to update"
      });
    }

    const task = await Task.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(formatTask(task));
  } catch (error) {
    console.error("Update task error:", error.message);
    res.status(500).json({ message: "Failed to update task" });
  }
});

// DELETE: Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await Task.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      message: "Task deleted successfully",
      task: formatTask(task)
    });
  } catch (error) {
    console.error("Delete task error:", error.message);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

const GEMINI_TIMEOUT_MS = 20000;

function geminiModel() {
  const model = process.env.GEMINI_MODEL;

  if (typeof model === "string" && model.trim()) {
    return model.trim();
  }

  return "gemini-3.5-flash";
}

function readGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function normalizeSteps(value) {
  let parsed = value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("[");
      const end = trimmed.lastIndexOf("]");

      if (start === -1 || end <= start) {
        return null;
      }

      try {
        parsed = JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.steps)) {
    parsed = parsed.steps;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const steps = parsed
    .filter((step) => typeof step === "string")
    .map((step) => step.trim())
    .filter(Boolean)
    .slice(0, 6);

  return steps.length > 0 ? steps : null;
}

function geminiErrorSummary(rawText) {
  let text = String(rawText || "");
  const apiKey = process.env.GEMINI_API_KEY;

  if (typeof apiKey === "string" && apiKey.trim()) {
    text = text.split(apiKey.trim()).join("[redacted]");
  }

  text = text.replace(/\s+/g, " ").trim();

  if (!text) {
    return "empty error body";
  }

  try {
    const body = JSON.parse(text);
    const status = body?.error?.status;
    const message = body?.error?.message;
    const summary = [status, message]
      .filter((part) => typeof part === "string" && part.trim())
      .join(": ");

    if (summary) {
      return summary.slice(0, 180);
    }
  } catch {
    // The provider body was not JSON. Keep a short plain-text summary.
  }

  return text.slice(0, 180);
}

async function requestTaskBreakdown(title) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    console.error("Gemini breakdown is not configured");
    return {
      errorStatus: 503,
      message: "AI breakdown is not configured"
    };
  }

  let response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey.trim()
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Break this task into 3 to 6 smaller steps. Return only a JSON array of short task titles.\n\nTask: ${title}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          }
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
      }
    );
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    console.error(timedOut ? "Gemini breakdown timeout" : "Gemini breakdown request failed");
    return {
      errorStatus: 502,
      message: "Could not generate steps"
    };
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    console.error(
      "Gemini breakdown provider status:",
      response.status,
      geminiErrorSummary(rawText)
    );

    if (response.status === 429) {
      return {
        errorStatus: 429,
        message: "AI service is busy. Try again in a moment."
      };
    }

    return {
      errorStatus: 502,
      message: "Could not generate steps"
    };
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    console.error("Gemini breakdown provider status:", response.status, "malformed response");
    return {
      errorStatus: 502,
      message: "Could not generate steps"
    };
  }

  const steps = normalizeSteps(readGeminiText(payload));

  if (!steps) {
    console.error("Gemini breakdown provider status:", response.status, "unusable model output");
    return {
      errorStatus: 502,
      message: "Could not generate steps"
    };
  }

  return { steps };
}

// POST: Suggest steps for one task without saving them
app.post("/api/tasks/:id/breakdown", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const result = await requestTaskBreakdown(task.title);

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ message: result.message });
    }

    res.json({
      taskId: task._id.toString(),
      title: task.title,
      steps: result.steps
    });
  } catch (error) {
    console.error("Breakdown task error:", error.message);
    res.status(502).json({ message: "Could not generate steps" });
  }
});

// Connect to MongoDB, then start the server
async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error(
        "MONGODB_URI is missing. Check your server/.env file."
      );
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully!");

    const geminiKey = process.env.GEMINI_API_KEY;
    console.log(
      "GEMINI_API_KEY present:",
      typeof geminiKey === "string" && geminiKey.trim() !== ""
    );

    const PORT = Number(process.env.PORT) || 5001;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
