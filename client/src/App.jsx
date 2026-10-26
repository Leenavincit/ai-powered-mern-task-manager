
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api/tasks";

function breakdownErrorMessage(status, serverMessage) {
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage.trim();
  }

  if (status === 400) return "That task ID is not valid.";
  if (status === 404) return "That task could not be found.";
  if (status === 429) return "AI service is busy. Try again in a moment.";
  if (status === 502) return "Could not generate steps.";
  if (status === 503) return "AI breakdown is not configured.";
  return "Could not generate steps.";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activePage, setActivePage] = useState("overview");
  const [breakingId, setBreakingId] = useState(null);
  const [savingSteps, setSavingSteps] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const breakdownRequest = useRef(false);
  const saveRequest = useRef(false);

  async function fetchTasks() {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Could not load tasks");
      setTasks(await response.json());
      setError("");
    } catch {
      setError("Unable to load tasks. Check that your backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  function navigateTo(page) {
    setActivePage(page);
    document.getElementById(page)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not add task");

      setTasks((previous) => [data, ...previous]);
      setTitle("");
      setError("");
    } catch (err) {
      setError(err.message || "Could not add task.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateTask(id, updates) {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Update failed");

      setTasks((previous) =>
        previous.map((task) => (task.id === id ? data : task))
      );
      setEditingId(null);
      setEditTitle("");
      setError("");
    } catch (err) {
      setError(err.message || "Could not update task.");
    }
  }

  async function deleteTask(id) {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE"
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Delete failed");

      setTasks((previous) => previous.filter((task) => task.id !== id));
      setError("");
    } catch (err) {
      setError(err.message || "Could not delete task.");
    }
  }

  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "Pending").length,
    progress: tasks.filter((task) => task.status === "In Progress").length,
    completed: tasks.filter((task) => task.status === "Completed").length
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = task.title
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      const matchesFilter = filter === "All" || task.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [tasks, search, filter]);

  function saveEdit(event, id) {
    event.preventDefault();
    if (!editTitle.trim()) {
      setError("Task title cannot be empty.");
      return;
    }
    updateTask(id, { title: editTitle.trim() });
  }

  async function breakIntoSteps(task) {
    if (breakdownRequest.current || saveRequest.current) return;

    breakdownRequest.current = true;
    setBreakingId(task.id);
    setSuggestion(null);
    setError("");

    try {
      const response = await fetch(`${API_URL}/${task.id}/breakdown`, {
        method: "POST"
      });
      const data = await readJson(response);
      const steps = Array.isArray(data.steps)
        ? data.steps
            .filter((step) => typeof step === "string" && step.trim())
            .map((step) => ({ title: step.trim(), selected: true }))
        : [];

      if (!response.ok || steps.length === 0) {
        throw new Error(
          response.ok
            ? "Could not generate steps."
            : breakdownErrorMessage(response.status, data.message)
        );
      }

      setSuggestion({
        taskId: data.taskId || task.id,
        title: data.title || task.title,
        steps
      });
      setTimeout(() => {
        document.getElementById("breakdown-review")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }, 0);
    } catch (err) {
      setSuggestion(null);
      setError(
        err.message === "Failed to fetch"
          ? "Could not generate steps. Check that your backend is running."
          : (err.message || "Could not generate steps.")
      );
    } finally {
      breakdownRequest.current = false;
      setBreakingId(null);
    }
  }

  function toggleSuggestedStep(index) {
    setSuggestion((current) => {
      if (!current) return current;

      return {
        ...current,
        steps: current.steps.map((step, stepIndex) =>
          stepIndex === index ? { ...step, selected: !step.selected } : step
        )
      };
    });
  }

  function cancelSuggestion() {
    if (saveRequest.current) return;
    setSuggestion(null);
  }

  async function saveSelectedSteps() {
    if (!suggestion || saveRequest.current || breakdownRequest.current) return;

    const selectedSteps = suggestion.steps.filter((step) => step.selected && step.title.trim());

    if (selectedSteps.length === 0) {
      setError("Select at least one step to save.");
      return;
    }

    saveRequest.current = true;
    setSavingSteps(true);
    setError("");
    let savedCount = 0;

    try {
      for (const step of selectedSteps) {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: step.title })
        });
        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(data.message || "Could not add task");
        }

        setTasks((previous) => [data, ...previous]);
        savedCount += 1;
      }

      setSuggestion(null);
    } catch (err) {
      if (savedCount > 0) {
        setSuggestion((current) => {
          if (!current) return current;

          let remaining = savedCount;
          return {
            ...current,
            steps: current.steps.filter((step) => {
              if (remaining > 0 && step.selected) {
                remaining -= 1;
                return false;
              }
              return true;
            })
          };
        });
      }

      const message = err.message === "Failed to fetch"
        ? "Could not add task."
        : (err.message || "Could not add task.");
      const detail = savedCount > 0
        ? ` Saved ${savedCount} ${savedCount === 1 ? "step" : "steps"} before the error.`
        : "";
      setError(`${message.endsWith(".") ? message : `${message}.`}${detail}`);
    } finally {
      saveRequest.current = false;
      setSavingSteps(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigateTo("overview")}>
          <span className="brand-icon">✓</span>
          <span>TaskFlow</span>
        </button>

        <p className="nav-label">WORKSPACE</p>

        <button
          className={`nav-item ${activePage === "overview" ? "active" : ""}`}
          onClick={() => navigateTo("overview")}
        >
          <span>▦</span> Overview
        </button>

        <button
          className={`nav-item ${activePage === "tasks" ? "active" : ""}`}
          onClick={() => navigateTo("tasks")}
        >
          <span>☷</span> My Tasks
        </button>

        <div className="sidebar-bottom">
          <div className="profile-avatar">L</div>
          <div>
            <strong>My Workspace</strong>
            <span>Personal task manager</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace / {activePage === "overview" ? "Overview" : "My Tasks"}
          </span>
          <span className="live-indicator">
            <span className="live-dot" /> Connected workspace
          </span>
        </header>

        <section className="welcome-section" id="overview">
          <div>
            <p className="eyebrow">YOUR PRODUCTIVITY SPACE</p>
            <h1>Good work starts here.</h1>
            <p className="welcome-description">
              Organize your priorities and make progress, one task at a time.
            </p>
            <button
              className="welcome-button"
              onClick={() => navigateTo("tasks")}
            >
              View my tasks →
            </button>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span>✦</span>
            <div className="art-card">✓</div>
            <span>✧</span>
          </div>
        </section>

        <section className="stats-grid" aria-label="Task summary">
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon purple">▦</span>
              <span className="stat-caption">All tasks</span>
            </div>
            <strong>{counts.total}</strong>
            <span className="stat-label">Total tasks</span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon orange">◷</span>
              <span className="stat-caption">To do</span>
            </div>
            <strong>{counts.pending}</strong>
            <span className="stat-label">Pending tasks</span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon blue">↗</span>
              <span className="stat-caption">In motion</span>
            </div>
            <strong>{counts.progress}</strong>
            <span className="stat-label">In progress</span>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon green">✓</span>
              <span className="stat-caption">Finished</span>
            </div>
            <strong>{counts.completed}</strong>
            <span className="stat-label">Completed tasks</span>
          </article>
        </section>

        <section className="workspace-panel" id="tasks">
          <div className="section-heading">
            <div>
              <p className="eyebrow">STAY ON TRACK</p>
              <h2>
                My tasks <span className="task-count">{counts.total}</span>
              </h2>
              <p className="section-description">
                Your plans, all in one place.
              </p>
            </div>
          </div>

          <form className="create-form" onSubmit={handleSubmit}>
            <span className="input-plus">＋</span>
            <input
              type="text"
              placeholder="What needs to get done?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="New task title"
            />
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "+ Add task"}
            </button>
          </form>

          {error && (
            <div className="error-message" role="alert">
              {error}
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}

          <div className="task-toolbar">
            <div className="filter-tabs" aria-label="Filter tasks">
              {["All", "Pending", "In Progress", "Completed"].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`filter-tab ${filter === status ? "selected" : ""}`}
                  onClick={() => setFilter(status)}
                >
                  {status}
                  {status === "All" && <span>{counts.total}</span>}
                </button>
              ))}
            </div>

            <label className="search-box">
              <span>⌕</span>
              <input
                type="search"
                placeholder="Search tasks..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search tasks"
              />
            </label>
          </div>

          {breakingId && (
            <p className="breakdown-status" role="status">
              Breaking “{tasks.find((task) => task.id === breakingId)?.title || "this task"}” into steps...
            </p>
          )}

          {suggestion && (
            <section className="breakdown-panel" id="breakdown-review" aria-label="Review suggested steps">
              <p className="eyebrow">REVIEW STEPS</p>
              <h3>Steps for “{suggestion.title}”</h3>
              <p>Choose the steps you want to keep. Nothing is saved until you confirm.</p>
              <ul className="breakdown-steps">
                {suggestion.steps.map((step, index) => (
                  <li key={`${suggestion.taskId}-${index}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={step.selected}
                        disabled={savingSteps}
                        onChange={() => toggleSuggestedStep(index)}
                      />
                      <span>{step.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="breakdown-actions">
                <button
                  className="cancel-button"
                  type="button"
                  onClick={cancelSuggestion}
                  disabled={savingSteps}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={saveSelectedSteps}
                  disabled={savingSteps}
                >
                  {savingSteps ? "Saving..." : "Save Selected Steps"}
                </button>
              </div>
            </section>
          )}

          {loading ? (
            <div className="empty-state">
              <h3>Loading your tasks...</h3>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                {search || filter !== "All" ? "⌕" : "✓"}
              </div>
              <h3>
                {search || filter !== "All" ? "No matching tasks" : "A fresh start!"}
              </h3>
              <p>
                {search || filter !== "All"
                  ? "Try another search or choose a different filter."
                  : "Add your first task above and start making progress."}
              </p>
              {(search || filter !== "All") && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSearch("");
                    setFilter("All");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="task-list">
              {visibleTasks.map((task) => (
                <article className="task-row" key={task.id}>
                  <button
                    className={`task-check ${task.status === "Completed" ? "checked" : ""}`}
                    type="button"
                    aria-label="Toggle task completion"
                    onClick={() =>
                      updateTask(task.id, {
                        status: task.status === "Completed" ? "Pending" : "Completed"
                      })
                    }
                  >
                    {task.status === "Completed" ? "✓" : ""}
                  </button>

                  <div className="task-main">
                    {editingId === task.id ? (
                      <form className="edit-form" onSubmit={(event) => saveEdit(event, task.id)}>
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          aria-label="Edit task title"
                        />
                        <button className="save-button" type="submit">Save</button>
                        <button
                          className="cancel-button"
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditTitle("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <h3 className={task.status === "Completed" ? "task-completed" : ""}>
                        {task.title}
                      </h3>
                    )}
                    <span className="task-subtitle">
                      {task.status === "Completed"
                        ? "Nicely done!"
                        : task.status === "In Progress"
                        ? "Keep up the momentum"
                        : "Ready when you are"}
                    </span>
                  </div>

                  <select
                    className={`status-select status-${task.status.toLowerCase().replaceAll(" ", "-")}`}
                    value={task.status}
                    onChange={(event) => updateTask(task.id, { status: event.target.value })}
                    aria-label={`Status for ${task.title}`}
                  >
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>

                  <div className="task-actions">
                    <button
                      className="break-button"
                      type="button"
                      title="Break into steps"
                      aria-label={`Break ${task.title} into steps`}
                      disabled={Boolean(breakingId) || savingSteps}
                      onClick={() => breakIntoSteps(task)}
                    >
                      {breakingId === task.id ? "Breaking..." : "Break into Steps"}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Edit task"
                      aria-label={`Edit ${task.title}`}
                      onClick={() => {
                        setEditingId(task.id);
                        setEditTitle(task.title);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button delete-action"
                      type="button"
                      title="Delete task"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => deleteTask(task.id)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && tasks.length > 0 && (
            <footer className="list-footer">
              Showing {visibleTasks.length} of {tasks.length} tasks
              <span>{counts.completed} completed</span>
            </footer>
          )}
        </section>

        <footer className="app-footer">
          <span>Made for your next great achievement.</span>
          <span>TaskFlow · Stay focused ✦</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
