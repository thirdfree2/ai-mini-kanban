import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Columns3,
  Ellipsis,
  FolderKanban,
  LayoutGrid,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
  Pencil,
  GripVertical,
} from "lucide-react";
import "./styles.css";
import { CalendarView, dateLabel } from "./calendar";
import { taskColors } from "./taskColors";
type User = { id: string; name: string; email: string };
type Board = { id: string; name: string; description: string };
type Status = "todo" | "in_progress" | "done";
type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  position?: number;
  startDate?: string;
  endDate?: string;
};
const statuses: { id: Status; label: string; caption: string }[] = [
  { id: "todo", label: "To do", caption: "Good things start here" },
  { id: "in_progress", label: "In progress", caption: "Making things happen" },
  { id: "done", label: "Done", caption: "A little progress, every day" },
];
function App() {
  const [token, setToken] = useState(localStorage.getItem("forma_token") || "");
  const [user, setUser] = useState<User | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("forma_user") || "null");
    } catch {
      return null;
    }
  });
  const [register, setRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const colors = useMemo(() => taskColors(tasks), [tasks]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"board" | "task" | null>(null);
  const [editBoard, setEditBoard] = useState<Board | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [view, setView] = useState<"board" | "calendar">("board");
  const [newDate, setNewDate] = useState("");
  const [newStatus, setNewStatus] = useState<Status>("todo");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const loadCounter = useRef(0);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab") {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled), .modal input, .modal select, .modal textarea",
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal, busy]);
  async function api(path: string, options: RequestInit = {}) {
    setPending((p) => p + 1);
    try {
      const res = await fetch("/api" + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 && token) clearSession();
        throw new Error(
          data?.error ||
            data?.message ||
            "Something went wrong. Please try again.",
        );
      }
      return data;
    } finally {
      setPending((p) => Math.max(0, p - 1));
    }
  }
  async function logout() {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Sign out failed. Please try again.");
      clearSession();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function clearSession() {
    localStorage.removeItem("forma_token");
    localStorage.removeItem("forma_user");
    setToken("");
    setUser(null);
    setBoards([]);
    setSelected(null);
    setTasks([]);
  }
  useEffect(() => {
    if (token) {
      setFetching(true);
      api("/boards")
        .then((data) => {
          const list = Array.isArray(data) ? data : data.boards || [];
          setBoards(list);
          setSelected(list[0] || null);
        })
        .catch((e) => setError(e.message))
        .finally(() => setFetching(false));
    }
  }, [token]);
  useEffect(() => {
    const n = ++loadCounter.current;
    setTasks([]);
    setTasksLoading(Boolean(selected));
    if (selected)
      api(`/boards/${selected.id}/tasks`)
        .then((data) => {
          if (n === loadCounter.current)
            setTasks(Array.isArray(data) ? data : data.tasks || []);
        })
        .catch((e) => setError(e.message))
        .finally(() => {
          if (n === loadCounter.current) setTasksLoading(false);
        });
  }, [selected?.id]);
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await api("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(f)),
      });
      localStorage.setItem("forma_token", result.token);
      localStorage.setItem("forma_user", JSON.stringify(result.user));
      setUser(result.user);
      setToken(result.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function saveBoard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const result = await api(
        editBoard ? `/boards/${editBoard.id}` : "/boards",
        {
          method: editBoard ? "PATCH" : "POST",
          body: JSON.stringify({
            ...Object.fromEntries(f),
            name: f.get("title"),
          }),
        },
      );
      const board = result.board || result;
      setBoards((prev) =>
        editBoard
          ? prev.map((b) => (b.id === board.id ? board : b))
          : [...prev, board],
      );
      setSelected(board);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const data = Object.fromEntries(f);
    const start = String(data.startDate || ""),
      end = String(data.endDate || "");
    if (Boolean(start) !== Boolean(end) || (start && end && start > end)) {
      setError(
        "Choose both start and end dates, with the end date on or after the start date.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await api(
        editTask ? `/tasks/${editTask.id}` : `/boards/${selected.id}/tasks`,
        { method: editTask ? "PATCH" : "POST", body: JSON.stringify(data) },
      );
      const task = result.task || result;
      setTasks((prev) =>
        editTask
          ? prev.map((t) => (t.id === task.id ? task : t))
          : [...prev, task],
      );
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function moveTask(id: string, status: Status) {
    const original = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await api(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      setTasks(original);
      setError((e as Error).message);
    }
  }
  async function deleteTask() {
    if (!editTask || !confirm("Delete this task?")) return;
    setBusy(true);
    try {
      await api(`/tasks/${editTask.id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== editTask.id));
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteBoard() {
    if (!selected || !confirm("Delete this board and all of its tasks?"))
      return;
    try {
      await api(`/boards/${selected.id}`, { method: "DELETE" });
      const remaining = boards.filter((b) => b.id !== selected.id);
      setBoards(remaining);
      setSelected(remaining[0] || null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const openBoard = (board: Board | null = null) => {
    setEditBoard(board);
    setModal("board");
    setError("");
  };
  const openTask = (status: Status, task: Task | null = null, date = "") => {
    setNewDate(date);
    setNewStatus(status);
    setEditTask(task);
    setModal("task");
    setError("");
  };
  const done = tasks.filter((t) => t.status === "done").length;
  const visible = tasks.filter((t) =>
    (t.title + " " + t.description)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      {!token ? (
        <main className="auth-layout">
          <section className="auth-story">
            <a className="brand" href="/">
              {" "}
              <span className="brand-icon">
                <Columns3 size={23} />
              </span>{" "}
              forma<span className="brand-dot">.</span>
            </a>
            <div>
              <div className="eyebrow">
                A LITTLE STRUCTURE. A LOT OF POSSIBILITY.
              </div>
              <h1>
                Make room
                <br />
                for your
                <br />
                <em>best work.</em>
              </h1>
              <p>
                Bring your ideas together, find your focus,
                <br />
                and move forward — one task at a time.
              </p>
              <div className="auth-mini">
                <span>
                  <Circle size={14} /> To do <b>3</b>
                </span>
                <ArrowRight size={18} />
                <span>
                  <CheckCircle2 size={14} /> Done <b>8</b>
                </span>
              </div>
            </div>
            <span className="story-footer">
              Thoughtfully simple. Simply productive.
            </span>
          </section>
          <section className="auth-form-wrap">
            <div className="auth-form">
              <span className="small-badge">
                <Sparkles size={14} /> YOUR NEXT CHAPTER STARTS HERE
              </span>
              <h2>{register ? "Create your workspace" : "Welcome back"}</h2>
              <p>
                {register
                  ? "A fresh space for everything you want to do."
                  : "Good to see you. Let’s make something happen."}
              </p>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <form onSubmit={authenticate}>
                {register && (
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    required
                    minLength={register ? 8 : 1}
                    maxLength={128}
                    placeholder={
                      register ? "At least 8 characters" : "Enter your password"
                    }
                  />
                </label>
                <button className="primary auth-submit" disabled={loading}>
                  {loading
                    ? "Please wait…"
                    : register
                      ? "Create account"
                      : "Sign in"}
                  <ArrowRight size={18} />
                </button>
              </form>
              <p className="auth-switch">
                {register ? "Already have an account?" : "New to Forma?"}{" "}
                <button
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register ? "Sign in" : "Create an account"}
                </button>
              </p>
              <div className="auth-note">
                <Check size={14} /> Your ideas. Your space. Your pace.
              </div>
            </div>
          </section>
        </main>
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <a className="brand" href="/">
              {" "}
              <span className="brand-icon">
                <Columns3 size={23} />
              </span>{" "}
              forma<span className="brand-dot">.</span>
            </a>
            <div className="workspace-label">
              <span className="workspace-avatar">
                {(user?.name || "M")[0].toUpperCase()}
              </span>
              <div>
                <strong>My workspace</strong>
                <span>Personal space</span>
              </div>
              <ChevronDown size={15} />
            </div>
            <div className="nav-heading">WORKSPACE</div>
            <div className="nav-static">
              <LayoutGrid size={18} /> My boards <span>{boards.length}</span>
            </div>
            <div className="board-heading">
              <span>YOUR BOARDS</span>
              <button
                aria-label="Create board"
                title="Create board"
                onClick={() => openBoard()}
              >
                <Plus size={16} />
              </button>
            </div>
            <nav aria-label="Boards">
              {boards.map((board, i) => (
                <button
                  key={board.id}
                  className={
                    "board-nav " + (selected?.id === board.id ? "active" : "")
                  }
                  onClick={() => {
                    setSelected(board);
                    setSearch("");
                  }}
                >
                  <span className={"board-dot dot-" + (i % 4)} />
                  <span>{board.name}</span>
                  {selected?.id === board.id && <ArrowUpRight size={15} />}
                </button>
              ))}
              <button className="new-board-nav" onClick={() => openBoard()}>
                <Plus size={17} /> New board
              </button>
            </nav>
            <div className="sidebar-tip">
              <span>✦</span>
              <strong>Small steps. Big ideas.</strong>
              <p>
                Every finished task is a little
                <br />
                closer to something great.
              </p>
            </div>
            <div className="profile">
              <span className="user-avatar">
                {(user?.name || "U")[0].toUpperCase()}
              </span>
              <div>
                <strong>{user?.name || "My account"}</strong>
                <span>{user?.email}</span>
              </div>
              <button aria-label="Sign out" title="Sign out" onClick={logout}>
                <LogOut size={17} />
              </button>
            </div>
          </aside>
          <main className="workspace">
            <header className="topbar">
              <div>
                <span>Workspace</span>
                <span className="slash">/</span>
                <strong>My boards</strong>
              </div>
              <span className="topbar-note">
                <span /> A little progress, every day
              </span>
              <button
                className="mobile-logout"
                aria-label="Sign out"
                onClick={logout}
              >
                <LogOut size={17} />
              </button>
            </header>
            <div className="board-content">
              {error && (
                <div className="error global-error" role="alert">
                  {error}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <section className="board-title">
                <div>
                  <div className="eyebrow">
                    YOUR SPACE TO MAKE THINGS HAPPEN
                  </div>
                  <h1>
                    {selected?.name || "Good ideas start here"}
                    {selected && <span className="title-spark">✳</span>}
                  </h1>
                  <p>
                    {selected?.description ||
                      "Create a board and give your next big idea a little structure."}
                  </p>
                </div>
                {selected ? (
                  <div className="board-actions">
                    <button
                      className="icon-button"
                      title="Edit board"
                      aria-label="Edit board"
                      onClick={() => openBoard(selected)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button"
                      title="Delete board"
                      aria-label="Delete board"
                      onClick={deleteBoard}
                    >
                      <Trash2 size={17} />
                    </button>
                    <button
                      className="primary"
                      onClick={() => openTask("todo")}
                    >
                      <Plus size={17} /> Add task
                    </button>
                  </div>
                ) : (
                  <button className="primary" onClick={() => openBoard()}>
                    <Plus size={17} /> Create board
                  </button>
                )}
              </section>
              {fetching ? (
                <div className="empty-workspace" role="status">
                  Loading your workspace…
                </div>
              ) : selected ? (
                <>
                  <div className="board-toolbar">
                    <div
                      className="view-tabs"
                      role="group"
                      aria-label="Board display"
                    >
                      <button
                        className={`view-tab ${view === "board" ? "selected" : ""}`}
                        aria-pressed={view === "board"}
                        onClick={() => setView("board")}
                      >
                        <Columns3 size={16} /> Board view
                      </button>
                      <button
                        className={`view-tab ${view === "calendar" ? "selected" : ""}`}
                        aria-pressed={view === "calendar"}
                        onClick={() => setView("calendar")}
                      >
                        Calendar
                      </button>
                    </div>
                    <div className="toolbar-right">
                      <span className="task-summary">
                        {tasks.length} tasks <span>·</span> {done} completed
                      </span>
                      <label className="search">
                        <Search size={16} />
                        <input
                          aria-label="Search tasks"
                          placeholder="Search tasks…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  {tasksLoading && (
                    <p role="status" className="loading-tasks">
                      Loading tasks…
                    </p>
                  )}
                  {view === "calendar" ? (
                    <CalendarView
                      tasks={visible}
                      colors={colors}
                      onEdit={(id) => {
                        const task = tasks.find((t) => t.id === id);
                        if (task) openTask(task.status, task);
                      }}
                      onCreate={(date) => openTask("todo", null, date)}
                    />
                  ) : (
                    <section
                      className="kanban"
                      aria-label="Kanban board"
                      aria-busy={tasksLoading}
                    >
                      {statuses.map((column) => (
                        <section
                          key={column.id}
                          data-testid={`column-${column.id}`}
                          aria-label={column.label}
                          className={`column column-${column.id} ${dragOver === column.id ? "drag-over" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(column.id);
                          }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData("text/plain");
                            setDragOver(null);
                            if (tasks.some((t) => String(t.id) === id))
                              moveTask(id, column.id);
                          }}
                        >
                          <header className="column-header">
                            <div>
                              <span className="status-icon">
                                {column.id === "done" ? (
                                  <Check size={13} />
                                ) : column.id === "in_progress" ? (
                                  <span className="half-circle" />
                                ) : (
                                  <Circle size={12} />
                                )}
                              </span>
                              <h2>{column.label}</h2>
                              <span className="count">
                                {
                                  visible.filter((t) => t.status === column.id)
                                    .length
                                }
                              </span>
                            </div>
                            <button
                              aria-label={`Add task to ${column.label}`}
                              onClick={() => openTask(column.id)}
                            >
                              <Plus size={18} />
                            </button>
                          </header>
                          <div className="cards">
                            {visible
                              .filter((t) => t.status === column.id)
                              .map((task) => (
                                <article
                                  key={task.id}
                                  className={
                                    "task-card " +
                                    (task.status === "done" ? "completed" : "")
                                  }
                                  data-testid="task-card"
                                  data-color={colors[task.id].key}
                                  style={{
                                    borderTop: `3px solid ${colors[task.id].border}`,
                                  }}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData(
                                      "text/plain",
                                      String(task.id),
                                    );
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragEnd={() => setDragOver(null)}
                                >
                                  <div className="card-top">
                                    <span className="priority low">
                                      {task.status === "done"
                                        ? "Completed"
                                        : "Task"}
                                    </span>
                                    <button
                                      aria-label={`Edit ${task.title}`}
                                      onClick={() =>
                                        openTask(task.status, task)
                                      }
                                    >
                                      <Ellipsis size={19} />
                                    </button>
                                  </div>
                                  <button
                                    className="task-title"
                                    onClick={() => openTask(task.status, task)}
                                  >
                                    {task.title}
                                  </button>
                                  {task.description && (
                                    <p>{task.description}</p>
                                  )}
                                  {task.startDate && task.endDate && (
                                    <div
                                      className="task-range"
                                      data-testid="task-date-range"
                                    >
                                      {dateLabel(task.startDate)} –{" "}
                                      {dateLabel(task.endDate)}
                                    </div>
                                  )}
                                  <div className="card-bottom">
                                    <span className="task-date">
                                      <GripVertical size={14} />
                                    </span>
                                    <select
                                      aria-label={`Move ${task.title}`}
                                      value={task.status}
                                      onChange={(e) =>
                                        moveTask(
                                          task.id,
                                          e.target.value as Status,
                                        )
                                      }
                                    >
                                      {statuses.map((s) => (
                                        <option value={s.id} key={s.id}>
                                          {s.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </article>
                              ))}
                          </div>
                          <button
                            className="add-card"
                            onClick={() => openTask(column.id)}
                          >
                            <Plus size={16} /> Add task
                          </button>
                          {!tasksLoading &&
                            !visible.some((t) => t.status === column.id) && (
                              <div className="column-empty">
                                <span>
                                  {column.id === "done"
                                    ? "✧"
                                    : column.id === "in_progress"
                                      ? "↗"
                                      : "✎"}
                                </span>
                                <p>
                                  {search
                                    ? "No matching tasks"
                                    : column.caption}
                                </p>
                              </div>
                            )}
                        </section>
                      ))}
                    </section>
                  )}
                  <footer className="board-footer">
                    <span>
                      <span className="saved-dot" />{" "}
                      {pending || busy
                        ? "Saving changes…"
                        : "All changes saved automatically"}
                    </span>
                    <span>Make space for what matters.</span>
                  </footer>
                </>
              ) : (
                <div className="empty-workspace">
                  <div>
                    <FolderKanban size={44} />
                  </div>
                  <h2>Your next project belongs here.</h2>
                  <p>
                    Organize your work into boards. Add tasks, find your focus,
                    <br />
                    and enjoy watching your ideas move forward.
                  </p>
                  <button className="primary" onClick={() => openBoard()}>
                    <Plus size={17} /> Create your first board
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">LET’S MAKE IT HAPPEN</span>
                <h2 id="modal-title">
                  {modal === "board"
                    ? editBoard
                      ? "Edit board"
                      : "Create a board"
                    : editTask
                      ? "Edit task"
                      : "Create a task"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={modal === "board" ? saveBoard : saveTask}>
              <label>
                {modal === "board" ? "Board name" : "Task title"}
                <input
                  name="title"
                  autoFocus
                  required
                  maxLength={modal === "board" ? 120 : 200}
                  defaultValue={
                    modal === "board" ? editBoard?.name : editTask?.title
                  }
                  placeholder={
                    modal === "board"
                      ? "e.g. Website refresh"
                      : "What needs to get done?"
                  }
                />
              </label>
              <label>
                Description <span className="optional">(optional)</span>
                <textarea
                  name="description"
                  maxLength={5000}
                  defaultValue={
                    modal === "board"
                      ? editBoard?.description
                      : editTask?.description
                  }
                  placeholder="Add a little context…"
                  rows={3}
                />
              </label>
              {modal === "task" && (
                <>
                  <div className="form-row">
                    <label>
                      Start date <span className="optional">(optional)</span>
                      <input
                        type="date"
                        name="startDate"
                        defaultValue={editTask?.startDate || newDate}
                      />
                    </label>
                    <label>
                      End date <span className="optional">(optional)</span>
                      <input
                        type="date"
                        name="endDate"
                        defaultValue={editTask?.endDate || newDate}
                      />
                    </label>
                  </div>
                  <p className="date-help">
                    Choose both dates to schedule a task, or leave both empty.
                    The end date is included.
                  </p>
                  <div className="form-row">
                    <label>
                      Status
                      <select
                        name="status"
                        defaultValue={editTask?.status || newStatus}
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              <div className="modal-footer">
                {modal === "task" && editTask ? (
                  <button
                    type="button"
                    className="delete-task"
                    disabled={busy}
                    onClick={deleteTask}
                  >
                    <Trash2 size={16} /> Delete task
                  </button>
                ) : (
                  <span />
                )}
                <div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : modal === "board"
                        ? editBoard
                          ? "Save board"
                          : "Create board"
                        : editTask
                          ? "Save task"
                          : "Create task"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
