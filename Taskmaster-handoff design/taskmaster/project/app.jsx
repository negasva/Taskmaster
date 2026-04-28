// app.jsx — Taskmaster main React app

const { useState, useEffect, useRef, useMemo } = React;

/* ======================= Helpers ======================= */
const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const fmtClock = (d) => {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};

const fmtClockBig = (d) => {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const fmtMenuDate = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/* ======================= Seed data ======================= */
const SEED_TASKS = [
  { id: 1, text: "Finalize Q3 product roadmap deck", priority: "high", done: false, pomEstimate: 4, pomDone: 1, notes: "Slides 4–8 still pending review.", subtasks: [
    { id: 11, text: "Outline objectives", done: true },
    { id: 12, text: "Draft positioning slide", done: false },
    { id: 13, text: "Add metric callouts", done: false }
  ]},
  { id: 2, text: "Code review: pricing service refactor", priority: "high", done: false, pomEstimate: 2, pomDone: 0, notes: "PR #2841 — review with the platform team.", subtasks: [] },
  { id: 3, text: "Reply to Marta about Tuesday workshop", priority: "medium", done: false, pomEstimate: 1, pomDone: 0, notes: "", subtasks: [] },
  { id: 4, text: "Draft retro notes for the design sync", priority: "medium", done: false, pomEstimate: 2, pomDone: 0, notes: "", subtasks: [] },
  { id: 5, text: "Tidy desk and close laptop tabs", priority: "low", done: true, pomEstimate: 1, pomDone: 1, notes: "", subtasks: [] }
];

const HISTORY = [
  { date: "Apr 25", note: "Closed roadmap draft and shipped two bug fixes.", done: 5, skip: 1 },
  { date: "Apr 24", note: "Deep work on pricing migration, reviewed three PRs.", done: 6, skip: 0 },
  { date: "Apr 23", note: "Workshop prep, low focus, lots of context switching.", done: 3, skip: 2 }
];

/* ======================= Top-level app ======================= */
function TaskmasterApp() {
  const [tweaks, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  /* tasks */
  const [tasks, setTasks] = useState(SEED_TASKS);
  const [filter, setFilter] = useState("today"); // today | all | high | done
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPrio, setDraftPrio] = useState("medium");
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(1);
  const [moreMenuFor, setMoreMenuFor] = useState(null);

  /* dialogs */
  const [showPlan, setShowPlan] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [showPom, setShowPom] = useState(false);
  const [showToast, setShowToast] = useState(false);

  /* clock */
  const [now, setNow] = useState(new Date(2026, 3, 27, 9, 41));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now())), 60000);
    return () => clearInterval(t);
  }, []);

  /* derived counts */
  const counts = useMemo(() => {
    const open = tasks.filter(t => !t.done);
    return {
      total: tasks.length,
      open: open.length,
      done: tasks.length - open.length,
      high: tasks.filter(t => t.priority === "high" && !t.done).length,
      pomToday: tasks.reduce((s, t) => s + t.pomDone, 0)
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    switch (filter) {
      case "high": return tasks.filter(t => t.priority === "high");
      case "done": return tasks.filter(t => t.done);
      case "all": return tasks;
      default: return tasks; // today
    }
  }, [tasks, filter]);

  /* task actions */
  const toggleTask = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = (id) => setTasks(ts => ts.filter(t => t.id !== id));
  const updateTask = (id, patch) => setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  const toggleSubtask = (tid, sid) => setTasks(ts => ts.map(t => t.id !== tid ? t : { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) }));

  const addTask = () => {
    if (!draftText.trim()) return;
    const t = { id: Date.now(), text: draftText.trim(), priority: draftPrio, done: false, pomEstimate: 2, pomDone: 0, notes: "", subtasks: [] };
    setTasks(prev => [t, ...prev]);
    setDraftText(""); setDraftPrio("medium"); setAdding(false);
  };

  /* pomodoro state */
  const POM_FOCUS = 25 * 60;
  const POM_BREAK = 5 * 60;
  const [pomMode, setPomMode] = useState("focus"); // focus | break
  const [pomRunning, setPomRunning] = useState(false);
  const [pomLeft, setPomLeft] = useState(POM_FOCUS);
  const [pomSession, setPomSession] = useState(0); // index 0..3
  const [pomTaskId, setPomTaskId] = useState(1);

  const pomTask = tasks.find(t => t.id === pomTaskId);
  const totalDuration = pomMode === "focus" ? POM_FOCUS : POM_BREAK;
  const pomProgress = 1 - pomLeft / totalDuration;
  const pomCirc = 2 * Math.PI * 88;

  useEffect(() => {
    if (!pomRunning) return;
    const t = setInterval(() => {
      setPomLeft(l => {
        if (l <= 1) {
          // Finish session
          setPomRunning(false);
          if (pomMode === "focus") {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 4000);
            setPomMode("break");
            return POM_BREAK;
          } else {
            setPomMode("focus");
            setPomSession(s => Math.min(s + 1, 3));
            return POM_FOCUS;
          }
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomRunning, pomMode]);

  const startPom = () => {
    setShowPom(true);
    setShowLock(true);
    setPomRunning(true);
  };

  return (
    <div className="desktop">
      <div className={`desktop-wallpaper wp-${tweaks.wallpaper}`} />

      <MenuBar now={now} />

      <AppWindow tweaks={tweaks}
        tasks={tasks} visibleTasks={visibleTasks} counts={counts}
        filter={filter} setFilter={setFilter}
        adding={adding} setAdding={setAdding}
        draftText={draftText} setDraftText={setDraftText}
        draftPrio={draftPrio} setDraftPrio={setDraftPrio}
        addTask={addTask}
        editingId={editingId} setEditingId={setEditingId}
        expandedId={expandedId} setExpandedId={setExpandedId}
        moreMenuFor={moreMenuFor} setMoreMenuFor={setMoreMenuFor}
        toggleTask={toggleTask} removeTask={removeTask}
        updateTask={updateTask} toggleSubtask={toggleSubtask}
        startPom={startPom}
        onOpenPlan={() => setShowPlan(true)}
        onOpenReport={() => setShowReport(true)}
        onOpenQuestions={() => setShowQuestions(true)}
        pomToday={counts.pomToday}
      />

      {showPom && !showLock && (
        <PomodoroWindow
          mode={pomMode} setMode={setPomMode}
          left={pomLeft} setLeft={setPomLeft}
          running={pomRunning} setRunning={setPomRunning}
          session={pomSession} setSession={setPomSession}
          task={pomTask}
          tasks={tasks.filter(t => !t.done)}
          onClose={() => { setShowPom(false); setPomRunning(false); }}
          onLock={() => setShowLock(true)}
          progress={pomProgress}
          duration={totalDuration}
        />
      )}

      {showToast && (
        <Toast
          title="Focus session complete"
          msg="Take a 5-minute break. Stretch, hydrate, breathe."
          time={fmtClock(now)}
        />
      )}

      <Dock onOpenPlan={() => setShowPlan(true)} />

      {showPlan && (
        <PlanModal onClose={() => setShowPlan(false)} onStart={() => { setShowPlan(false); }} />
      )}

      {showQuestions && (
        <QuestionsModal onClose={() => setShowQuestions(false)} />
      )}

      {showReport && (
        <ReportModal tasks={tasks} onClose={() => setShowReport(false)} />
      )}

      {showLock && (
        <LockScreen
          now={now}
          task={pomTask}
          mode={pomMode}
          left={pomLeft}
          running={pomRunning}
          progress={pomProgress}
          session={pomSession}
          setRunning={setPomRunning}
          onUnlock={() => { setShowLock(false); }}
          onCancel={() => { setShowLock(false); setShowPom(false); setPomRunning(false); setPomLeft(POM_FOCUS); }}
        />
      )}

      <TaskmasterTweaks tweaks={tweaks} setTweak={setTweak}
        onShowPlan={() => setShowPlan(true)}
        onShowQuestions={() => setShowQuestions(true)}
        onShowReport={() => setShowReport(true)}
        onShowLock={() => { setShowLock(true); setShowPom(true); }}
        onShowPom={() => setShowPom(s => !s)}
        onShowToast={() => { setShowToast(true); setTimeout(() => setShowToast(false), 5000); }}
      />
    </div>
  );
}

/* ======================= Menu bar ======================= */
function MenuBar({ now }) {
  return (
    <div className="menubar">
      <div className="mb-logo">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1.2c2.6 0 4 1.6 4 3.6 0 1.4-.7 2.4-1.7 2.8.3.5.6 1.2.6 2 0 1.5-1.1 3.2-3 3.2-1.6 0-2.6-.9-3-2H4l.4-1H6c.2.7.6 1.2 1 1.2.6 0 1-.6 1-1.4 0-1-.6-1.5-1.4-1.5h-.4l.3-1h.4c.7 0 1.2-.5 1.2-1.2 0-.7-.5-1.2-1.2-1.2-.7 0-1 .5-1.1 1H4.6c.1-1.4 1.1-2.5 2.4-2.5z"/></svg>
      </div>
      <div className="mb-item">Taskmaster</div>
      <div className="mb-item regular">File</div>
      <div className="mb-item regular">Edit</div>
      <div className="mb-item regular">View</div>
      <div className="mb-item regular">Window</div>
      <div className="mb-item regular">Help</div>
      <div className="mb-spacer" />
      <div className="mb-right">
        <Icon name="battery" size={18} />
        <Icon name="wifi" size={14} />
        <span>{fmtMenuDate(now)}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(now)}</span>
      </div>
    </div>
  );
}

/* ======================= App window ======================= */
function AppWindow(props) {
  const { tweaks, tasks, visibleTasks, counts, filter, setFilter,
    adding, setAdding, draftText, setDraftText, draftPrio, setDraftPrio, addTask,
    editingId, setEditingId, expandedId, setExpandedId, moreMenuFor, setMoreMenuFor,
    toggleTask, removeTask, updateTask, toggleSubtask, startPom,
    onOpenPlan, onOpenReport, onOpenQuestions, pomToday } = props;

  const todayTasks = visibleTasks.filter(t => !t.done);
  const doneTasks = visibleTasks.filter(t => t.done);

  return (
    <div className="app-window glass" style={{
      top: 56, left: "50%", transform: "translateX(-50%)",
      width: "min(1140px, calc(100% - 80px))",
      height: "calc(100% - 130px)",
      maxHeight: 760
    }}>
      <div className="titlebar">
        <div className="traffic">
          <div className="light close" />
          <div className="light min" />
          <div className="light zoom" />
        </div>
        <div className="tb-title">Taskmaster</div>
        <div className="tb-actions">
          <button className="tb-icon-btn" title="Search"><Icon name="search" size={14}/></button>
          <button className="tb-icon-btn" title="Filter"><Icon name="filter" size={14}/></button>
        </div>
      </div>

      <div className="app-body">
        <Sidebar counts={counts} pomToday={pomToday} filter={filter} setFilter={setFilter} onOpenPlan={onOpenPlan} />

        <div className="main-col">
          <div className="main-toolbar">
            <div>
              <div className="mt-title">Today</div>
              <div className="mt-sub">{counts.open} open · {counts.done} done · {pomToday} pomodoros logged</div>
            </div>
            <div className="mt-spacer" />
            <div className="search-pill">
              <Icon name="search" size={14}/>
              <input placeholder="Search tasks" />
              <span className="kbd" style={{ fontSize: 10 }}>⌘K</span>
            </div>
            <button className="icon-btn" title="Sort"><Icon name="sort" size={14}/></button>
            <button className="btn btn-ghost" onClick={onOpenQuestions}><Icon name="sparkles" size={14}/> Subtasks</button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={14}/> New task</button>
          </div>

          <div className="filter-row">
            <div className="chip active"><span className="chip-dot" style={{ background: "var(--accent)" }} /> Today</div>
            <div className="chip"><Icon name="flag" size={12}/> Priority</div>
            <div className="chip"><Icon name="checklist" size={12}/> Subtasks</div>
            <div className="chip"><Icon name="archive" size={12}/> Backlog · 12</div>
            <div className="chip"><Icon name="calendar" size={12}/> This week</div>
          </div>

          <div className="task-scroll">
            {adding && (
              <AddTaskForm
                draftText={draftText} setDraftText={setDraftText}
                draftPrio={draftPrio} setDraftPrio={setDraftPrio}
                onAdd={addTask} onCancel={() => { setAdding(false); setDraftText(""); }}
              />
            )}
            {!adding && (
              <div className="add-task-inline" onClick={() => setAdding(true)}>
                <div className="ati-circle"><Icon name="plus" size={12}/></div>
                <span>Add a task — press <span className="kbd" style={{ marginLeft: 4 }}>N</span></span>
              </div>
            )}

            {todayTasks.length > 0 && <div className="section-header">In progress <span className="sh-count">{todayTasks.length}</span></div>}
            {todayTasks.map(t => (
              <TaskCard key={t.id} task={t}
                expanded={expandedId === t.id}
                editing={editingId === t.id}
                moreOpen={moreMenuFor === t.id}
                onToggle={() => toggleTask(t.id)}
                onEdit={() => setEditingId(t.id)}
                onSaveEdit={(patch) => { updateTask(t.id, patch); setEditingId(null); }}
                onCancelEdit={() => setEditingId(null)}
                onExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
                onToggleSub={(sid) => toggleSubtask(t.id, sid)}
                onMoreToggle={() => setMoreMenuFor(moreMenuFor === t.id ? null : t.id)}
                onMoreClose={() => setMoreMenuFor(null)}
                onDelete={() => { removeTask(t.id); setMoreMenuFor(null); }}
                onStartPom={startPom}
              />
            ))}

            {doneTasks.length > 0 && <div className="section-header">Completed <span className="sh-count">{doneTasks.length}</span></div>}
            {doneTasks.map(t => (
              <TaskCard key={t.id} task={t}
                expanded={false}
                onToggle={() => toggleTask(t.id)}
                onDelete={() => removeTask(t.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="bottom-floater">
        <span className="bf-text">{counts.open} remaining today</span>
        <button className="btn btn-ghost" onClick={onOpenReport}><Icon name="checklist" size={14}/> Report</button>
        <button className="btn btn-primary" onClick={startPom}><Icon name="play" size={12}/> Start Pomodoro</button>
      </div>
    </div>
  );
}

/* ======================= Sidebar ======================= */
function Sidebar({ counts, pomToday, filter, setFilter, onOpenPlan }) {
  return (
    <div className="sidebar">
      <div className="streak-card">
        <div className="streak-flame"><Icon name="flame" size={20}/></div>
        <div>
          <div className="streak-num">12</div>
          <div className="streak-lbl">day streak</div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-h">Lists</div>
        <div className={`sb-row ${filter === "today" ? "active" : ""}`} onClick={() => setFilter("today")}>
          <div className="sb-icon"><Icon name="today" size={15}/></div>
          <span>Today</span>
          <span className="sb-count">{counts.open}</span>
        </div>
        <div className={`sb-row ${filter === "high" ? "active" : ""}`} onClick={() => setFilter("high")}>
          <div className="sb-icon"><Icon name="flag" size={15}/></div>
          <span>Priority</span>
          <span className="sb-count">{counts.high}</span>
        </div>
        <div className={`sb-row ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          <div className="sb-icon"><Icon name="inbox" size={15}/></div>
          <span>All tasks</span>
          <span className="sb-count">{counts.total}</span>
        </div>
        <div className={`sb-row ${filter === "done" ? "active" : ""}`} onClick={() => setFilter("done")}>
          <div className="sb-icon"><Icon name="check" size={15}/></div>
          <span>Completed</span>
          <span className="sb-count">{counts.done}</span>
        </div>
        <div className="sb-row">
          <div className="sb-icon"><Icon name="archive" size={15}/></div>
          <span>Someday</span>
          <span className="sb-count">8</span>
        </div>
      </div>

      <div className="side-section">
        <div className="side-h">Today at a glance</div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-num">{pomToday}</div>
            <div className="stat-lbl">Pomodoros</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">1h 42m</div>
            <div className="stat-lbl">Focused</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">{counts.done}</div>
            <div className="stat-lbl">Tasks done</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">5:00</div>
            <div className="stat-lbl">Wrap at</div>
          </div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-h">Shortcuts</div>
        <div className="kbd-row"><span>New task</span><span className="kbd">N</span></div>
        <div className="kbd-row"><span>Play / Pause</span><span className="kbd">Space</span></div>
        <div className="kbd-row"><span>Search</span><span className="kbd">⌘K</span></div>
        <div className="kbd-row"><span>End of day</span><span className="kbd">⌘.</span></div>
      </div>
    </div>
  );
}

/* ======================= Add task form ======================= */
function AddTaskForm({ draftText, setDraftText, draftPrio, setDraftPrio, onAdd, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="add-task-form">
      <input ref={ref} className="atf-input" placeholder="What needs to get done?"
        value={draftText} onChange={e => setDraftText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onAdd(); if (e.key === "Escape") onCancel(); }} />
      <input className="atf-input" placeholder="Notes (optional)" style={{ fontSize: 13, fontWeight: 400, color: "var(--tx-2)" }} />
      <div className="atf-row">
        <div className="seg prio">
          {["low","medium","high"].map(p => (
            <button key={p} className={`${draftPrio === p ? `active p-${p === "medium" ? "med" : p}` : ""}`} onClick={() => setDraftPrio(p)}>
              {p === "low" ? "Low" : p === "medium" ? "Medium" : "High"}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className="active">2 pomodoros</button>
        </div>
        <div className="atf-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onAdd} disabled={!draftText.trim()}><Icon name="plus" size={14}/> Add task</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Task card ======================= */
function TaskCard({ task, expanded, editing, moreOpen, onToggle, onEdit, onSaveEdit, onCancelEdit,
  onExpand, onToggleSub, onMoreToggle, onMoreClose, onDelete, onStartPom }) {

  const [tempText, setTempText] = useState(task.text);
  const inputRef = useRef(null);
  useEffect(() => { if (editing) { setTempText(task.text); inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const prioClass = task.priority === "high" ? "p-high" : task.priority === "low" ? "p-low" : "p-med";
  const prioLabel = task.priority[0].toUpperCase() + task.priority.slice(1);

  return (
    <div className={`task-card ${task.done ? "completed" : ""}`}>
      <div className={`tc-check ${task.done ? `checked ${prioClass}` : ""}`} onClick={onToggle}>
        {task.done && <Icon name="check" size={13} color="#fff"/>}
      </div>
      <div className="tc-body">
        {editing ? (
          <div className="task-title">
            <input ref={inputRef} value={tempText} onChange={e => setTempText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") onSaveEdit({ text: tempText });
                if (e.key === "Escape") onCancelEdit();
              }}
              onBlur={() => onSaveEdit({ text: tempText })} />
          </div>
        ) : (
          <div className="task-title" onDoubleClick={onEdit}>{task.text}</div>
        )}
        {task.notes && <div className="task-notes">{task.notes}</div>}
        <div className="task-meta">
          <span className={`tc-prio-tag ${prioClass}`}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
            {prioLabel}
          </span>
          {task.pomEstimate > 0 && (
            <span className="tc-pom">
              <Icon name="timer" size={12}/>
              <span className="tc-pom-dots">
                {Array.from({ length: task.pomEstimate }).map((_, i) => (
                  <span key={i} className={`pom-pip ${i < task.pomDone ? "done" : ""}`} />
                ))}
              </span>
              <span>{task.pomDone}/{task.pomEstimate}</span>
            </span>
          )}
          {task.subtasks?.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={onExpand}>
              <Icon name="checklist" size={12}/>
              {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}
              <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12}/>
            </span>
          )}
        </div>

        {expanded && task.subtasks?.length > 0 && (
          <div className="subtasks">
            {task.subtasks.map(s => (
              <div key={s.id} className={`subtask ${s.done ? "done" : ""}`}>
                <div className={`st-check ${s.done ? "checked" : ""}`} onClick={() => onToggleSub(s.id)}>
                  {s.done && <Icon name="check" size={10} color="#fff"/>}
                </div>
                <div className="st-text">{s.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tc-actions">
        {!task.done && onStartPom && (
          <button className="icon-btn" title="Start pomodoro" onClick={onStartPom}><Icon name="play" size={12}/></button>
        )}
        {onEdit && <button className="icon-btn" title="Edit" onClick={onEdit}><Icon name="edit" size={12}/></button>}
        <button className="icon-btn" title="More" onClick={onMoreToggle}><Icon name="more" size={14}/></button>
        {moreOpen && (
          <div className="popover" style={{ right: 8, top: 36 }}>
            <div className="popover-row" onClick={onMoreClose}><Icon name="flag" size={13}/> Set priority</div>
            <div className="popover-row" onClick={onMoreClose}><Icon name="calendar" size={13}/> Reschedule</div>
            <div className="popover-row" onClick={onMoreClose}><Icon name="sparkles" size={13}/> Generate subtasks</div>
            <div className="popover-divider" />
            <div className="popover-row danger" onClick={onDelete}><Icon name="trash" size={13}/> Delete task</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= Plan day modal ======================= */
function PlanModal({ onClose, onStart }) {
  const [items, setItems] = useState([
    "Finalize Q3 product roadmap deck",
    "Code review: pricing service refactor"
  ]);
  const [v, setV] = useState("");
  const min = 3;
  const pct = Math.min(100, (items.length / min) * 100);
  const can = items.length >= min;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div>
          <div className="modal-eyebrow">Good morning · Saturday</div>
          <div className="modal-title">Plan your day</div>
          <div className="modal-sub">Add at least three tasks to start your first focus session.</div>
        </div>
        <div className="input-with-btn">
          <input className="modal-input" placeholder="What needs to get done?"
            value={v} onChange={e => setV(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && v.trim()) { setItems([...items, v.trim()]); setV(""); } }} />
          <button className="btn btn-primary" disabled={!v.trim()} onClick={() => { setItems([...items, v.trim()]); setV(""); }}>
            <Icon name="plus" size={14}/> Add
          </button>
        </div>
        <div className="task-mini-list">
          {items.map((t, i) => (
            <div key={i} className="task-mini">
              <span className="tm-num">{String(i+1).padStart(2,"0")}</span>
              <span className="tm-text">{t}</span>
              <button className="tm-x" onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="x" size={14}/></button>
            </div>
          ))}
        </div>
        <div className="progress-row">
          <div className="progress-track"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
          <span className="progress-lbl">{items.length} / {min}</span>
        </div>
        <button className="btn btn-primary" style={{ height: 38, width: "100%", justifyContent: "center" }} disabled={!can} onClick={onStart}>
          {can ? "Start working" : `Add ${min - items.length} more to begin`}
        </button>
      </div>
    </div>
  );
}

/* ======================= Questions modal ======================= */
function QuestionsModal({ onClose }) {
  const QS = [
    { q: "How much focus do you have right now?", opts: ["Sharp and rested", "Average", "Distracted", "Running on fumes"] },
    { q: "Is this task more about thinking or executing?", opts: ["Mostly thinking", "Mostly doing", "An equal mix"] },
    { q: "Do you have all the inputs you need?", opts: ["Yes, fully briefed", "Partial info", "Need to gather first"] },
    { q: "What's a realistic outcome in one pomodoro?", opts: ["A complete draft", "A solid first pass", "A short list of next steps"] },
    { q: "Where will the work happen?", opts: ["Editor / IDE", "Document / writing app", "Meeting or call", "Pen and paper"] },
  ];
  const [sel, setSel] = useState({});
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 540, maxHeight: "82vh", overflowY: "auto" }}>
        <div>
          <div className="modal-eyebrow">Generate subtasks</div>
          <div className="modal-title">A few quick questions</div>
          <div className="modal-sub">Five answers, sharper subtasks. None of this is sent anywhere — it just shapes the breakdown.</div>
        </div>
        {QS.map((q, i) => (
          <div className="qcard" key={i}>
            <div className="qcard-q">{i+1}. {q.q}</div>
            <div className="qcard-opts">
              {q.opts.map((o, j) => (
                <div key={j} className={`qopt ${sel[i] === j ? "selected" : ""}`} onClick={() => setSel({ ...sel, [i]: j })}>
                  <div className="qopt-radio" />
                  {o}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", height: 36 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2, justifyContent: "center", height: 36 }} onClick={onClose}>
            <Icon name="sparkles" size={13}/> Generate subtasks
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Report modal ======================= */
function ReportModal({ tasks, onClose }) {
  const [done, setDone] = useState(new Set(tasks.filter(t => t.done).map(t => t.id)));
  const [notes, setNotes] = useState("");
  const [showHist, setShowHist] = useState(false);
  const toggle = (id) => { const n = new Set(done); n.has(id) ? n.delete(id) : n.add(id); setDone(n); };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 540, maxHeight: "84vh", overflowY: "auto" }}>
        <div>
          <div className="modal-eyebrow">5:00 PM · Wrap up</div>
          <div className="modal-title">End of day</div>
          <div className="modal-sub">Mark what got done and add a brief note. The session closes once you save.</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tx-3)", marginBottom: 8 }}>Tasks</div>
          {tasks.map(t => (
            <div key={t.id} className={`rep-row ${done.has(t.id) ? "done" : ""}`} onClick={() => toggle(t.id)}>
              <div className="rep-check">{done.has(t.id) && <Icon name="check" size={12} color="#fff"/>}</div>
              <span className="rep-text">{t.text}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tx-3)", marginBottom: 8 }}>What did you accomplish?</div>
          <textarea className="rep-textarea" placeholder="Brief summary of the day..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ height: 38, width: "100%", justifyContent: "center" }}>Save report</button>
        <div style={{ borderTop: "1px solid var(--glass-edge)", paddingTop: 12, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowHist(s => !s)}>
            <Icon name={showHist ? "chevron-down" : "chevron-right"} size={13}/> Show history (last 7 days)
          </button>
          {showHist && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {HISTORY.map((h, i) => (
                <div key={i} className="qcard">
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>{h.date}</div>
                  <div style={{ fontSize: 13, color: "var(--tx-2)", fontStyle: "italic", marginBottom: 6 }}>"{h.note}"</div>
                  <div style={{ fontSize: 11.5, color: "var(--tx-3)" }}>
                    <span style={{ color: "var(--green)" }}>{h.done} done</span> · <span style={{ color: "var(--red)" }}>{h.skip} skipped</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ======================= Pomodoro window ======================= */
function PomodoroWindow({ mode, setMode, left, setLeft, running, setRunning, session, setSession,
  task, tasks, onClose, onLock, progress, duration }) {
  const circ = 2 * Math.PI * 88;
  const offset = circ * progress;
  const ringClass = mode === "break" ? "break" : (left < 60 ? "warn" : "");

  return (
    <div className="pom-window" style={{ top: 110, right: 36 }}>
      <div className="pom-head">
        <span className={`pom-mode-pill ${mode === "break" ? "break" : ""}`}>
          {mode === "break" ? "Short break" : `Focus · session ${session+1}/4`}
        </span>
        <button className="tb-icon-btn" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      <div>
        <div className="pom-task-label">Working on</div>
        <div className="pom-task-name">{task ? task.text : "—"}</div>
      </div>
      <div className="pom-ring-wrap">
        <svg className="pom-ring-svg" viewBox="0 0 200 200">
          <circle className="pom-ring-bg" cx="100" cy="100" r="88"/>
          <circle className={`pom-ring-fg ${ringClass}`} cx="100" cy="100" r="88"
            strokeDasharray={circ} strokeDashoffset={offset}/>
        </svg>
        <div className="pom-time">{fmtTime(left)}</div>
      </div>
      <div className="pom-dots-row">
        {[0,1,2,3].map(i => (
          <div key={i} className={`pom-dot ${i < session ? "done" : i === session ? "current" : ""}`} />
        ))}
      </div>
      <div className="pom-controls">
        <button className="pom-control-btn" title="Previous"><Icon name="back" size={14}/></button>
        <button className={`pom-main-btn ${mode === "break" ? "break" : ""}`} onClick={() => { setRunning(r => !r); onLock(); }}>
          <Icon name={running ? "pause" : "play"} size={14}/>
          {running ? "Pause" : (left === duration ? "Start focus" : "Resume")}
        </button>
        <button className="pom-control-btn" title="Skip"><Icon name="skip" size={14}/></button>
      </div>
    </div>
  );
}

/* ======================= Lock screen ======================= */
function LockScreen({ now, task, mode, left, running, progress, session, setRunning, onUnlock, onCancel }) {
  const circ = 2 * Math.PI * 100;
  const offset = circ * progress;
  return (
    <div className="lockscreen">
      <div className="lock-time">{fmtClockBig(now)}</div>
      <div className="lock-date">{fmtDate(now)}</div>

      <div className="lock-card">
        <div className="lock-eyebrow">{mode === "break" ? "Short break" : `Focus · session ${session+1} of 4`}</div>
        <div className="lock-task">{task ? task.text : "—"}</div>
        <div className="lock-progress">{Math.round(progress * 100)}% complete · keyboard locked</div>

        <div className="lock-ring-wrap">
          <svg className="lock-ring" viewBox="0 0 220 220">
            <circle className="lock-ring-bg" cx="110" cy="110" r="100"/>
            <circle className="lock-ring-fg" cx="110" cy="110" r="100"
              strokeDasharray={circ} strokeDashoffset={offset}/>
          </svg>
          <div className="lock-time-display">
            <div>{fmtTime(left)}</div>
            <div className="lt-sub">{mode === "break" ? "Breathe" : "Stay focused"}</div>
          </div>
        </div>

        <div className="lock-actions">
          <button className="lock-btn primary" onClick={() => setRunning(r => !r)}>
            {running ? "Pause" : "Resume"}
          </button>
          <button className="lock-btn" onClick={onUnlock}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="unlock" size={13}/> Hide overlay</span>
          </button>
          <button className="lock-btn danger" onClick={onCancel}>End early</button>
        </div>
      </div>

      <div className="lock-tip">Tip — your keyboard and mouse are blocked outside this card. Press <span style={{ background: "rgba(255,255,255,0.18)", padding: "2px 6px", borderRadius: 4, fontFamily: "SF Mono, monospace", fontSize: 11 }}>Esc</span> twice to escape early.</div>
    </div>
  );
}

/* ======================= Toast ======================= */
function Toast({ title, msg, time }) {
  return (
    <div className="toast">
      <div className="toast-icon">
        <Icon name="timer" size={20} color="#fff"/>
      </div>
      <div className="toast-body">
        <div className="toast-app">Taskmaster · now</div>
        <div className="toast-title">{title}</div>
        <div className="toast-msg">{msg}</div>
      </div>
    </div>
  );
}

/* ======================= Dock ======================= */
function Dock({ onOpenPlan }) {
  return (
    <div className="dock">
      <div className="dock-app icn-finder" title="Finder">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M9 16c1 .8 2 1 3 1s2-.2 3-1" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </div>
      <div className="dock-app icn-tasks" title="Taskmaster" onClick={onOpenPlan}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
        <div className="dock-active-dot" />
      </div>
      <div className="dock-app icn-mail" title="Mail">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 8l8 6 8-6"/></svg>
      </div>
      <div className="dock-app icn-cal" title="Calendar">
        <span className="icn-cal-m">SAT</span>
        <span className="icn-cal-d">25</span>
      </div>
      <div className="dock-app icn-notes" title="Notes">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#614500" strokeWidth="2.2" strokeLinecap="round"><path d="M7 7h10M7 12h10M7 17h6"/></svg>
      </div>
      <div className="dock-app icn-music" title="Music">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M9 17V7l9-2v10" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/><circle cx="7" cy="17" r="2.2"/><circle cx="16" cy="15" r="2.2"/></svg>
      </div>
      <div className="dock-app icn-clock" title="Clock">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round"/></svg>
      </div>
      <div className="dock-divider" />
      <div className="dock-app icn-settings" title="Settings">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
      </div>
    </div>
  );
}

/* ======================= Tweaks panel ======================= */
function TaskmasterTweaks({ tweaks, setTweak, onShowPlan, onShowQuestions, onShowReport, onShowLock, onShowPom, onShowToast }) {
  // TweaksPanel etc are globals from tweaks-panel.jsx

  // Apply theme & blur to root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
    document.documentElement.style.setProperty("--blur", tweaks.blur + "px");
  }, [tweaks.theme, tweaks.blur]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Aesthetic">
        <TweakSelect label="Wallpaper" value={tweaks.wallpaper} onChange={v => setTweak("wallpaper", v)}
          options={[
            { value: "sequoia", label: "Sequoia (warm)" },
            { value: "sonoma", label: "Sonoma (sunset)" },
            { value: "monterey", label: "Monterey (rose)" },
            { value: "bigsur", label: "Big Sur (dusk)" },
            { value: "graphite", label: "Graphite" }
          ]} />
        <TweakRadio label="Theme" value={tweaks.theme} onChange={v => setTweak("theme", v)}
          options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        <TweakSlider label="Glass blur" min={10} max={80} step={1} value={tweaks.blur} onChange={v => setTweak("blur", v)} />
      </TweakSection>
      <TweakSection title="Open screen">
        <TweakButton onClick={onShowPlan}>Plan your day</TweakButton>
        <TweakButton onClick={onShowQuestions}>Subtasks questions</TweakButton>
        <TweakButton onClick={onShowReport}>End-of-day report</TweakButton>
        <TweakButton onClick={onShowPom}>Toggle Pomodoro window</TweakButton>
        <TweakButton onClick={onShowLock}>Lock screen</TweakButton>
        <TweakButton onClick={onShowToast}>Show notification</TweakButton>
      </TweakSection>
    </TweaksPanel>
  );
}

window.TaskmasterApp = TaskmasterApp;
