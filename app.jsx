// app.jsx — Taskmaster main React app

const { useState, useEffect, useRef, useMemo } = React;

const GROQ_API_KEY = "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";
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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
const SEED_TASKS = [];

const HISTORY = [];

/* ======================= Top-level app ======================= */
function TaskmasterApp() {
  const [tweaks, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [tasks, setTasks] = useState(SEED_TASKS);
  const [dailyFocusSeconds, setDailyFocusSeconds] = useState(0);
  const [lastPlanDate, setLastPlanDate] = useState("");
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', tweaks.theme);
  }, [tweaks.theme]);
  const [filter, setFilter] = useState("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPrio, setDraftPrio] = useState("medium");
  const [draftPom, setDraftPom] = useState(2);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [moreMenuFor, setMoreMenuFor] = useState(null);
  const [showRightDock, setShowRightDock] = useState(true);
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.loadData) {
      window.electronAPI.loadData().then(data => {
        if (data.tasks) setTasks(data.tasks);
        if (data.focusSeconds) setDailyFocusSeconds(data.focusSeconds);
        if (data.lastPlanDate) setLastPlanDate(data.lastPlanDate);
        
        if (data.lastPlanDate !== new Date().toDateString()) {
          setShowPlan(true);
        }
        setDataLoaded(true);
      });
    } else {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (dataLoaded && window.electronAPI && window.electronAPI.saveData) {
      window.electronAPI.saveData({
        tasks,
        focusSeconds: dailyFocusSeconds,
        lastPlanDate
      });
    }
  }, [tasks, dailyFocusSeconds, lastPlanDate, dataLoaded, pomRunning]);

  /* dialogs */
  const [showQuestions, setShowQuestions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [showPom, setShowPom] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBlocker, setShowBlocker] = useState(false);
  const [showWebBlocker, setShowWebBlocker] = useState(false);
  const [blockedAlert, setBlockedAlert] = useState(null);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [sortBy, setSortBy] = useState("priority"); // priority, date, custom
  const [settings, setSettings] = useState({
    notifications: true,
    soundEnabled: true,
    pomDuration: 25,
    breakDuration: 5,
    autoStartBreak: true,
    autoStartNextTask: false,
    weekStartDay: "monday",
    timeFormat: "12h",
    hideCompleted: false,
    showSubtaskProgress: true
  });

  /* Listen for blocked app alerts from main process */
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onBlockedAppAlert) {
      window.electronAPI.onBlockedAppAlert((data) => {
        setBlockedAlert(data);
        // Auto-dismiss after 8 seconds
        setTimeout(() => setBlockedAlert(null), 8000);
      });
    }
  }, []);

  /* clock - updates every second for real-time stats */
  const [now, setNow] = useState(new Date(2026, 3, 27, 9, 41));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now())), 1000);
    return () => clearInterval(t);
  }, []);

  /* derived counts */
  const counts = useMemo(() => {
    const open = tasks.filter(t => !t.done);
    const pomDone = tasks.reduce((s, t) => s + t.pomDone, 0);
    const h = Math.floor(dailyFocusSeconds / 3600);
    const m = Math.floor((dailyFocusSeconds % 3600) / 60);
    const s = dailyFocusSeconds % 60;
    return {
      total: tasks.length,
      open: open.length,
      done: tasks.length - open.length,
      high: tasks.filter(t => t.priority === "high" && !t.done).length,
      pomToday: pomDone,
      focusTime: h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`,
      streak: 0 
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    let ts = tasks;
    if (searchQuery) {
      ts = ts.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    switch (filter) {
      case "high": return ts.filter(t => t.priority === "high" && !t.done);
      case "done": return ts.filter(t => t.done);
      case "all": return ts;
      default: return ts;
    }
  }, [tasks, filter, searchQuery]);

  const sortedTasks = useMemo(() => {
    const sorted = [...visibleTasks];
    if (sortBy === "priority") {
      sorted.sort((a, b) => {
        const prio = { high: 0, medium: 1, low: 2 };
        return (prio[a.priority] || 1) - (prio[b.priority] || 1);
      });
    } else if (sortBy === "date") {
      sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [visibleTasks, sortBy]);

  /* Keyboard Shortcuts - Windows only */
  useEffect(() => {
    const handleKeys = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "n") { e.preventDefault(); setAdding(true); }
      if (e.key === " ") {
        e.preventDefault();
        const next = tasks.find(t => !t.done);
        if (next) startPom(next.id);
      }
      if (e.key.toLowerCase() === "k" && e.ctrlKey) { e.preventDefault(); document.querySelector(".search-pill input")?.focus(); }
      if (e.key === "s" && e.ctrlKey) { e.preventDefault(); document.querySelector(".settings-panel")?.click(); }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [tasks]);

  /* task actions */
  const toggleTask = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = (id) => setTasks(ts => ts.filter(t => t.id !== id));
  const updateTask = (id, patch) => setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  const toggleSubtask = (tid, sid) => setTasks(ts => ts.map(t => t.id !== tid ? t : { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) }));

  const generateQuestions = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setIsGeneratingQuestions(true);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Eres un experto en productividad. Genera 4 preguntas cortas y específicas para entender mejor esta tarea. Devuelve SOLO un objeto JSON con la clave 'questions' que sea un array de objetos {q, opts}." },
            { role: "user", content: `Tarea: "${task.text}"` }
          ],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      setAiQuestions(content.questions);
      setShowQuestions(true);
    } catch (e) {
      console.error(e);
      // Fallback
      setAiQuestions([{ q: "¿Es una tarea compleja?", opts: ["Sí", "No"] }]);
      setShowQuestions(true);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const generateSubtasks = async (taskId, answers) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setIsGenerating(true);
    try {
      const contextStr = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join(", ");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Devuelve SOLO un objeto JSON con 'subtasks' (array de strings)." },
            { role: "user", content: `Genera 4-6 subtareas para: "${task.text}". Contexto: ${contextStr}` }
          ],
          response_format: { type: "json_object" }
        })
      });
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      const newSubs = content.subtasks.map((text, i) => ({ id: Date.now() + i, text, done: false }));
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, ...newSubs], aiContext: answers } : t));
      setExpandedId(taskId);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateSubtask = async (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtask = task.subtasks.find(s => s.id === subtaskId);
    try {
      const contextStr = task.aiContext ? Object.entries(task.aiContext).map(([k, v]) => `${k}: ${v}`).join(", ") : "Sin contexto";
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Devuelve SOLO un string con la nueva subtarea. Nada más." },
            { role: "user", content: `Regenera esta subtarea: "${subtask.text}" para la tarea principal: "${task.text}". Contexto previo: ${contextStr}. Dame una opción diferente y útil.` }
          ]
        })
      });
      const data = await response.json();
      const newText = data.choices[0].message.content.trim().replace(/^"|"$/g, '');
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, text: newText } : s) } : t));
    } catch (e) { console.error(e); }
  };

  const addTask = () => {
    if (!draftText.trim()) return;
    const t = { id: Date.now(), text: draftText.trim(), priority: draftPrio, done: false, pomEstimate: draftPom, pomDone: 0, notes: "", subtasks: [], lists: ["Hoy"] };
    setTasks(prev => [t, ...prev]);
    setDraftText(""); setDraftPrio("medium"); setDraftPom(2); setAdding(false);
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
    // Count immediately on start
    if (pomMode === "focus") {
      setDailyFocusSeconds(s => s + 1);
    }
    const t = setInterval(() => {
      setPomLeft(l => {
          if (pomMode === "focus") {
            setDailyFocusSeconds(s => s + 1);
          }
          if (l <= 1) {
          // Finish session
          setPomRunning(false);
          if (pomMode === "focus") {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 4000);
            updateTask(pomTaskId, { pomDone: Math.min(pomTask.pomDone + 1, pomTask.pomEstimate) });
            setPomMode("break");
            return POM_BREAK;
          } else {
            setPomMode("focus");
            setPomSession(s => Math.min(s + 1, pomTask.pomEstimate - 1));
            return POM_FOCUS;
          }
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomRunning, pomMode]);

  const startPom = (taskId) => {
    if (taskId) setPomTaskId(taskId);
    setShowPom(true);
    setShowLock(true);
    setPomRunning(true);
    setPomLeft(POM_FOCUS);
  };

  return (
    <div className="desktop" style={{ width: '100vw', height: '100vh' }}>
      <div className={`desktop-wallpaper wp-${tweaks.wallpaper}`} />
      <MenuBar now={now} />

      <AppWindow tweaks={tweaks}
        tasks={tasks} visibleTasks={sortedTasks} counts={counts}
        filter={filter} setFilter={setFilter}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        adding={adding} setAdding={setAdding}
        draftText={draftText} setDraftText={setDraftText}
        draftPrio={draftPrio} setDraftPrio={setDraftPrio}
        draftPom={draftPom} setDraftPom={setDraftPom}
        addTask={addTask}
        editingId={editingId} setEditingId={setEditingId}
        expandedId={expandedId} setExpandedId={setExpandedId}
        moreMenuFor={moreMenuFor} setMoreMenuFor={setMoreMenuFor}
        toggleTask={toggleTask} removeTask={removeTask}
        updateTask={updateTask} toggleSubtask={toggleSubtask}
        startPom={startPom}
        onOpenPlan={() => setShowPlan(true)}
        onOpenReport={() => setShowReport(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenBlocker={() => setShowBlocker(true)}
        onOpenWebBlocker={() => setShowWebBlocker(true)}
        onOpenQuestions={(id) => {
          const tid = id || tasks[0]?.id;
          setGeneratingFor(tid);
          generateQuestions(tid);
        }}
        pomToday={counts.pomToday}
        setTweak={setTweak}
        regenerateSubtask={regenerateSubtask}
        sortBy={sortBy}
        setSortBy={setSortBy}
        draggedTaskId={draggedTaskId}
        setDraggedTaskId={setDraggedTaskId}
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
          title="Sesión de enfoque completada"
          msg="Tómate un descanso de 5 minutos. Estírate, hidrátate, respira."
          time={fmtClock(now)}
        />
      )}

      {showPlan && (
        <PlanModal 
          onClose={() => { setShowPlan(false); setLastPlanDate(new Date().toDateString()); }} 
          onStart={(newTasks) => { 
            const formatted = newTasks.map((t, i) => ({ id: Date.now() + i, text: t, priority: "medium", done: false, pomEstimate: 2, pomDone: 0, notes: "", subtasks: [], lists: ["Hoy"] }));
            setTasks(prev => [...formatted, ...prev]);
            setShowPlan(false); 
            setLastPlanDate(new Date().toDateString());
          }} 
        />
      )}

      {showQuestions && (
        <QuestionsModal 
          task={tasks.find(t => t.id === generatingFor)}
          questions={aiQuestions}
          onClose={() => { setShowQuestions(false); setGeneratingFor(null); }} 
          onGenerate={(answers) => { 
            if (generatingFor) generateSubtasks(generatingFor, answers);
            setShowQuestions(false);
            setGeneratingFor(null);
          }} 
        />
      )}

      {(isGenerating || isGeneratingQuestions) && (
        <div className="scrim" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ textAlign: "center", padding: 40 }}>
            <div className="streak-flame" style={{ margin: "0 auto 20px", width: 60, height: 60 }}>
              <Icon name="sparkles" size={30} />
            </div>
            <div className="modal-title">{isGeneratingQuestions ? "Analizando tarea..." : "IA pensando..."}</div>
            <div className="modal-sub">
              {isGeneratingQuestions ? "Generando preguntas inteligentes para tu caso." : `Desglosando "${tasks.find(t => t.id === generatingFor)?.text}" en pasos accionables.`}
            </div>
            <div className="progress-track" style={{ marginTop: 24, height: 4, overflow: "hidden" }}>
              <div className="progress-bar" style={{ width: "100%", animation: "progress-indet 2s infinite ease-in-out" }} />
            </div>
            <style>{`
              @keyframes progress-indet {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}</style>
          </div>
        </div>
      )}

      {showReport && (
        <ReportModal tasks={tasks} onClose={() => setShowReport(false)} />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={(key, value) => setSettings(prev => ({ ...prev, [key]: value }))}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showBlocker && (
        <BlockerModal onClose={() => setShowBlocker(false)} />
      )}

      {showWebBlocker && (
        <WebBlockerModal onClose={() => setShowWebBlocker(false)} />
      )}

      {blockedAlert && (
        <BlockedAppOverlay
          processName={blockedAlert.processName}
          time={blockedAlert.time}
          onDismiss={() => setBlockedAlert(null)}
        />
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



/* ======================= App window ======================= */
function AppWindow(props) {
  const { tweaks, tasks, visibleTasks, counts, filter, setFilter,
    adding, setAdding, draftText, setDraftText, draftPrio, setDraftPrio, addTask,
    editingId, setEditingId, expandedId, setExpandedId, moreMenuFor, setMoreMenuFor,
    toggleTask, removeTask, updateTask, toggleSubtask, startPom,
    onOpenPlan, onOpenReport, onOpenSettings, onOpenBlocker, onOpenWebBlocker, onOpenQuestions, pomToday, setTweak, regenerateSubtask,
    searchQuery, setSearchQuery, draftPom, setDraftPom, sortBy, setSortBy,
    draggedTaskId, setDraggedTaskId } = props;

  const [showSortMenu, setShowSortMenu] = useState(false);
  const todayTasks = visibleTasks.filter(t => !t.done);
  const doneTasks = visibleTasks.filter(t => t.done);

  const toggleTheme = () => {
    setTweak('theme', tweaks.theme === 'dark' ? 'light' : 'dark');
  };

  const handleTaskDragStart = (taskId) => {
    setDraggedTaskId(taskId);
  };

  const handleTaskDrop = (targetTaskId) => {
    if (draggedTaskId === null || draggedTaskId === targetTaskId) {
      setDraggedTaskId(null);
      return;
    }
    const draggedIdx = visibleTasks.findIndex(t => t.id === draggedTaskId);
    const targetIdx = visibleTasks.findIndex(t => t.id === targetTaskId);
    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedTaskId(null);
      return;
    }
    const newTasks = [...tasks];
    const draggedTask = newTasks.find(t => t.id === draggedTaskId);
    const targetTask = newTasks.find(t => t.id === targetTaskId);
    if (draggedTask && targetTask) {
      const draggedPos = newTasks.indexOf(draggedTask);
      const targetPos = newTasks.indexOf(targetTask);
      newTasks.splice(draggedPos, 1);
      newTasks.splice(targetPos, 0, draggedTask);
      setTasks(newTasks);
    }
    setDraggedTaskId(null);
  };

  return (
    <div className="app-window glass" style={{
      top: 28, left: 0, right: 0, bottom: 0,
      width: "100%", height: "calc(100% - 28px)",
      display: "flex", flexDirection: "column",
      borderRadius: 0
    }}>
      <div className="titlebar">
        <div className="tb-title">Taskmaster</div>
      </div>

      <div className="app-body">
        <Sidebar counts={counts} pomToday={pomToday} filter={filter} setFilter={setFilter} onOpenPlan={onOpenPlan} />

        <div className="main-col">
          <div className="main-toolbar">
            <div>
              <div className="mt-title">Hoy</div>
              <div className="mt-sub">{counts.open} pendientes · {counts.done} listas · {pomToday} pomodoros hoy</div>
            </div>
            <div className="mt-spacer" />
            <div className="search-pill">
              <Icon name="search" size={14}/>
              <input placeholder="Buscar tareas" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <span className="kbd" style={{ fontSize: 10 }}>⌘K</span>
            </div>
            <button className="icon-btn" title={tweaks.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} onClick={toggleTheme}>
              <Icon name={tweaks.theme === 'dark' ? 'sun' : 'moon'} size={14}/>
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button className="icon-btn" title="Ordenar" onClick={() => setShowSortMenu(!showSortMenu)}>
                <Icon name="sort" size={14}/>
              </button>
              {showSortMenu && (
                <div style={{
                  position: 'absolute', top: 32, right: 0, background: 'var(--glass-soft)', border: '1px solid var(--glass-edge)',
                  borderRadius: 8, minWidth: 160, padding: '8px 0', zIndex: 100
                }}>
                  <div style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: sortBy === 'priority' ? 'var(--accent)' : 'inherit' }}
                    onClick={() => { setSortBy('priority'); setShowSortMenu(false); }}>Prioridad</div>
                  <div style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: sortBy === 'date' ? 'var(--accent)' : 'inherit' }}
                    onClick={() => { setSortBy('date'); setShowSortMenu(false); }}>Recientes primero</div>
                  <div style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: sortBy === 'custom' ? 'var(--accent)' : 'inherit' }}
                    onClick={() => { setSortBy('custom'); setShowSortMenu(false); }}>Manual (arrastra)</div>
                </div>
              )}
            </div>
            <button className="btn btn-ghost" onClick={() => onOpenQuestions()}><Icon name="sparkles" size={14}/> Subtareas</button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={14}/> Nueva tarea</button>
          </div>

          <div className="filter-row">
            <div className={`chip ${filter === "today" ? "active" : ""}`} onClick={() => setFilter("today")}><span className="chip-dot" style={{ background: "var(--accent)" }} /> Hoy</div>
            <div className={`chip ${filter === "high" ? "active" : ""}`} onClick={() => setFilter("high")}><Icon name="flag" size={12}/> Prioridad</div>
            <div className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}><Icon name="checklist" size={12}/> Todas</div>
            <div className="chip"><Icon name="archive" size={12}/> Backlog · 0</div>
            <div className="chip"><Icon name="calendar" size={12}/> Esta semana</div>
          </div>

          <div className="task-scroll">
            {adding && (
              <AddTaskForm
                draftText={draftText} setDraftText={setDraftText}
                draftPrio={draftPrio} setDraftPrio={setDraftPrio}
                draftPom={draftPom} setDraftPom={setDraftPom}
                onAdd={addTask} onCancel={() => { setAdding(false); setDraftText(""); }}
              />
            )}
            {!adding && (
              <div className="add-task-inline" onClick={() => setAdding(true)} style={{ padding: '16px', fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                <div className="ati-circle"><Icon name="plus" size={16}/></div>
                <span>Añadir una tarea</span>
              </div>
            )}

            {todayTasks.length > 0 && <div className="section-header">En progreso <span className="sh-count">{todayTasks.length}</span></div>}
            {todayTasks.map(t => (
              <TaskCard key={t.id} task={t}
                expanded={expandedId === t.id}
                editing={editingId === t.id}
                moreOpen={moreMenuFor === t.id}
                isDragged={draggedTaskId === t.id}
                onToggle={() => toggleTask(t.id)}
                onEdit={() => setEditingId(t.id)}
                onSaveEdit={(patch) => { updateTask(t.id, patch); setEditingId(null); }}
                onCancelEdit={() => setEditingId(null)}
                onExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
                onToggleSub={(sid) => toggleSubtask(t.id, sid)}
                onRegenerateSub={(sid) => regenerateSubtask(t.id, sid)}
                onMoreToggle={() => setMoreMenuFor(moreMenuFor === t.id ? null : t.id)}
                onMoreClose={() => setMoreMenuFor(null)}
                onGenerateSubtasks={() => { onOpenQuestions(t.id); setMoreMenuFor(null); }}
                onDelete={() => { removeTask(t.id); setMoreMenuFor(null); }}
                onStartPom={() => startPom(t.id)}
                onDragStart={() => handleTaskDragStart(t.id)}
                onDrop={() => handleTaskDrop(t.id)}
                updateTask={updateTask}
              />
            ))}

            {doneTasks.length > 0 && <div className="section-header">Completadas <span className="sh-count">{doneTasks.length}</span></div>}
            {doneTasks.map(t => (
              <TaskCard key={t.id} task={t}
                expanded={false}
                editing={editingId === t.id}
                moreOpen={moreMenuFor === t.id}
                isDragged={draggedTaskId === t.id}
                onToggle={() => toggleTask(t.id)}
                onEdit={() => setEditingId(t.id)}
                onSaveEdit={(patch) => { updateTask(t.id, patch); setEditingId(null); }}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => removeTask(t.id)}
                onMoreToggle={() => setMoreMenuFor(moreMenuFor === t.id ? null : t.id)}
                onMoreClose={() => setMoreMenuFor(null)}
                onDragStart={() => handleTaskDragStart(t.id)}
                onDrop={() => handleTaskDrop(t.id)}
                updateTask={updateTask}
              />
            ))}
          </div>
        </div>
        <div className="right-col" style={{ width: 68, borderLeft: '1px solid var(--glass-edge)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 16 }}>
          <div className="dock-item" onClick={onOpenPlan} title="Planificar (⌘N)" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--glass-soft)', color: 'var(--accent)', transition: 'all 0.2s ease' }}><Icon name="calendar" size={22}/></div>
          <div className="dock-item" title="Mensajes" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--glass-soft)', color: 'var(--tx-2)' }}><Icon name="mail" size={22}/></div>
          <div className="dock-item" title="Música" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--glass-soft)', color: 'var(--tx-2)' }}><Icon name="music" size={22}/></div>
          <div className="dock-item" title="Tiempo" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--glass-soft)', color: 'var(--tx-2)' }}><Icon name="timer" size={22}/></div>
          <div style={{ flex: 1 }} />
          <div className="dock-item" onClick={onOpenWebBlocker} title="Bloqueo Web" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,59,48,0.1)', color: 'var(--red)', border: '1px solid rgba(255,59,48,0.15)', marginBottom: 8 }}><Icon name="globe" size={20}/></div>
          <div className="dock-item" onClick={onOpenBlocker} title="Control de Apps" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,59,48,0.12)', color: 'var(--red)', border: '1px solid rgba(255,59,48,0.2)' }}><Icon name="shield" size={22}/></div>
        <div className="dock-item settings-panel" onClick={onOpenSettings} title="Ajustes (Ctrl+S)" style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--glass-soft)', color: 'var(--tx-2)' }}><Icon name="settings" size={22}/></div>
        </div>
      </div>

      <div className="bottom-floater">
        <span className="bf-text">{counts.open} restantes hoy</span>
        <button className="btn btn-ghost" onClick={onOpenReport}><Icon name="checklist" size={14}/> Reporte</button>
        <button className="btn btn-primary" onClick={startPom}><Icon name="play" size={12}/> Iniciar Pomodoro</button>
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
          <div className="streak-num">{counts.streak}</div>
          <div className="streak-lbl">días de racha</div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-h">Listas</div>
        <div className={`sb-row ${filter === "today" ? "active" : ""}`} onClick={() => setFilter("today")}>
          <div className="sb-icon"><Icon name="today" size={15}/></div>
          <span>Hoy</span>
          <span className="sb-count">{counts.open}</span>
        </div>
        <div className={`sb-row ${filter === "high" ? "active" : ""}`} onClick={() => setFilter("high")}>
          <div className="sb-icon"><Icon name="flag" size={15}/></div>
          <span>Prioridad</span>
          <span className="sb-count">{counts.high}</span>
        </div>
        <div className={`sb-row ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          <div className="sb-icon"><Icon name="inbox" size={15}/></div>
          <span>Todas</span>
          <span className="sb-count">{counts.total}</span>
        </div>
        <div className={`sb-row ${filter === "done" ? "active" : ""}`} onClick={() => setFilter("done")}>
          <div className="sb-icon"><Icon name="check" size={15}/></div>
          <span>Finalizados</span>
          <span className="sb-count">{counts.done}</span>
        </div>
        <div className="sb-row">
          <div className="sb-icon"><Icon name="archive" size={15}/></div>
          <span>Algún día</span>
          <span className="sb-count">0</span>
        </div>
      </div>

      <div className="side-section">
        <div className="side-h">Hoy de un vistazo</div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-num">{pomToday}</div>
            <div className="stat-lbl">Pomodoros</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">{counts.focusTime}</div>
            <div className="stat-lbl">Enfoque</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">{counts.done}</div>
            <div className="stat-lbl">Finalizados</div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ======================= Add task form ======================= */
function AddTaskForm({ draftText, setDraftText, draftPrio, setDraftPrio, draftPom, setDraftPom, onAdd, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="add-task-form">
      <input ref={ref} className="atf-input" placeholder="¿Qué hay que hacer?"
        value={draftText} onChange={e => setDraftText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onAdd(); if (e.key === "Escape") onCancel(); }} />
      <input className="atf-input" placeholder="Notas (opcional)" style={{ fontSize: 13, fontWeight: 400, color: "var(--tx-2)" }} />
      <div className="atf-row">
        <div className="seg prio">
          <button className={draftPrio === "low" ? "active p-low" : ""} onClick={() => setDraftPrio("low")}>Baja</button>
          <button className={draftPrio === "medium" ? "active p-med" : ""} onClick={() => setDraftPrio("medium")}>Media</button>
          <button className={draftPrio === "high" ? "active p-high" : ""} onClick={() => setDraftPrio("high")}>Alta</button>
        </div>
        <div className="seg">
          <button className="active" onClick={() => setDraftPom(p => p < 8 ? p + 1 : 1)}>{draftPom} pomodoros</button>
        </div>
        <div className="atf-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={onAdd} disabled={!draftText.trim()}><Icon name="plus" size={14}/> Añadir</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Task card ======================= */
function TaskCard({ task, expanded, editing, moreOpen, isDragged, onToggle, onEdit, onSaveEdit, onCancelEdit,
  onExpand, onToggleSub, onRegenerateSub, onMoreToggle, onMoreClose, onGenerateSubtasks, onDelete, onStartPom,
  onDragStart, onDrop, updateTask }) {

  const [tempText, setTempText] = useState(task.text);
  const inputRef = useRef(null);
  useEffect(() => { if (editing) { setTempText(task.text); inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const prioClass = task.priority === "high" ? "p-high" : task.priority === "low" ? "p-low" : "p-med";
  const prioLabels = { high: "Alta", medium: "Media", low: "Baja" };
  const prioLabel = prioLabels[task.priority];

  return (
    <div className={`task-card ${task.done ? "completed" : ""} ${isDragged ? "dragging" : ""}`}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{ opacity: isDragged ? 0.5 : 1, cursor: !editing ? 'grab' : 'default' }}>
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
                {!s.done && onRegenerateSub && (
                  <button className="icon-btn mini" title="Regenerar esta subtarea" onClick={() => onRegenerateSub(s.id)}>
                    <Icon name="sparkles" size={10}/>
                  </button>
                )}
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
            <div className="popover-row" onClick={() => { onEdit(); onMoreClose(); }}><Icon name="edit" size={13}/> Editar</div>
            <div className="popover-row" onClick={() => {
              const newPrio = task.priority === 'high' ? 'medium' : task.priority === 'medium' ? 'low' : 'high';
              updateTask(task.id, { priority: newPrio });
              onMoreClose();
            }}><Icon name="flag" size={13}/> Prioridad</div>
            <div className="popover-row" onClick={onMoreClose}><Icon name="calendar" size={13}/> Reagendar</div>
            <div className="popover-row" onClick={onGenerateSubtasks}><Icon name="sparkles" size={13}/> Generar subtareas</div>
            <div className="popover-divider" />
            <div className="popover-row danger" onClick={onDelete}><Icon name="trash" size={13}/> Eliminar</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= Plan day modal ======================= */
function PlanModal({ onClose, onStart }) {
  const [items, setItems] = useState([]);
  const [v, setV] = useState("");
  const min = 3;
  const pct = Math.min(100, (items.length / min) * 100);
  const can = items.length >= min;

  const handleAdd = () => {
    if (v.trim()) {
      setItems([...items, v.trim()]);
      setV("");
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div>
          <div className="modal-eyebrow">Buenos días · {new Date().toLocaleDateString('es-ES', {weekday: 'long'})}</div>
          <div className="modal-title">Planifica tu día</div>
          <div className="modal-sub">Añade al menos tres tareas para comenzar tu primera sesión.</div>
        </div>
        <div className="input-with-btn">
          <input className="modal-input" placeholder="¿Qué hay que hacer?"
            value={v} onChange={e => setV(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} />
          <button className="btn btn-primary" disabled={!v.trim()} onClick={handleAdd}>
            <Icon name="plus" size={14}/> Añadir
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
        <button className="btn btn-primary" style={{ height: 42, width: "100%", justifyContent: "center", fontSize: 15 }} disabled={!can} onClick={() => onStart(items)}>
          {can ? "Empezar a trabajar" : `Añade ${min - items.length} más para empezar`}
        </button>
      </div>
    </div>
  );
}

/* ======================= Questions modal ======================= */
function QuestionsModal({ task, questions, onClose, onGenerate }) {
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState({});
  const taskName = task?.text || "esta tarea";

  const QS = questions || [];
  if (QS.length === 0) return null;

  const handlePick = (idx) => {
    const newSel = { ...sel, [QS[step].q]: QS[step].opts[idx] };
    setSel(newSel);
    if (step < QS.length - 1) {
      setTimeout(() => setStep(step + 1), 200);
    } else {
      setTimeout(() => onGenerate(newSel), 300);
    }
  };

  const q = QS[step];
  const progress = ((step + 1) / QS.length) * 100;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="modal-eyebrow">Paso {step + 1} de {QS.length}</div>
          <div className="modal-title">Analizando Tarea</div>
          <div className="progress-track" style={{ marginTop: 8, height: 4 }}>
            <div className="progress-bar" style={{ width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>

        <div className="qcard" style={{ border: "none", padding: 0 }}>
          <div className="qcard-q" style={{ fontSize: 18, marginBottom: 20 }}>{q.q}</div>
          <div className="qcard-opts" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {q.opts.map((o, j) => (
              <div key={j} className="qopt" onClick={() => handlePick(j)} 
                   style={{ padding: "16px 20px", borderRadius: 12, background: "var(--glass-soft)", cursor: "pointer", transition: "all 0.2s" }}>
                <div className="qopt-radio" />
                {o}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Atrás</button>
          )}
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
          <div className="modal-eyebrow">5:00 PM · Cierre</div>
          <div className="modal-title">Resumen del día</div>
          <div className="modal-sub">Marca lo que lograste y añade una breve nota. La sesión se cerrará al guardar.</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tx-3)", marginBottom: 8 }}>Tareas</div>
          {tasks.map(t => (
            <div key={t.id} className={`rep-row ${done.has(t.id) ? "done" : ""}`} onClick={() => toggle(t.id)}>
              <div className="rep-check">{done.has(t.id) && <Icon name="check" size={12} color="#fff"/>}</div>
              <span className="rep-text">{t.text}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tx-3)", marginBottom: 8 }}>¿Qué lograste hoy?</div>
          <textarea className="rep-textarea" placeholder="Breve resumen del día..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ height: 38, width: "100%", justifyContent: "center" }}>Guardar reporte</button>
        <div style={{ borderTop: "1px solid var(--glass-edge)", paddingTop: 12, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowHist(s => !s)}>
            <Icon name={showHist ? "chevron-down" : "chevron-right"} size={13}/> Mostrar historial (últimos 7 días)
          </button>
          {showHist && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {HISTORY.map((h, i) => (
                <div key={i} className="qcard">
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>{h.date}</div>
                  <div style={{ fontSize: 13, color: "var(--tx-2)", fontStyle: "italic", marginBottom: 6 }}>"{h.note}"</div>
                  <div style={{ fontSize: 11.5, color: "var(--tx-3)" }}>
                    <span style={{ color: "var(--green)" }}>{h.done} listas</span> · <span style={{ color: "var(--red)" }}>{h.skip} saltadas</span>
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
          {mode === "break" ? "Descanso corto" : `Enfoque · sesión ${session+1}/${task?.pomEstimate || 4}`}
        </span>
        <button className="tb-icon-btn" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      <div>
        <div className="pom-task-label">Trabajando en</div>
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
        {Array.from({ length: task?.pomEstimate || 4 }).map((_, i) => (
          <div key={i} className={`pom-dot ${i < session ? "done" : i === session ? "current" : ""}`} />
        ))}
      </div>
      <div className="pom-controls">
        <button className="pom-control-btn" title="Anterior"><Icon name="back" size={14}/></button>
        <button className={`pom-main-btn ${mode === "break" ? "break" : ""}`} onClick={() => { setRunning(r => !r); onLock(); }}>
          <Icon name={running ? "pause" : "play"} size={14}/>
          {running ? "Pausar" : (left === duration ? "Empezar" : "Reanudar")}
        </button>
        <button className="pom-control-btn" title="Saltar"><Icon name="skip" size={14}/></button>
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
        <div className="lock-eyebrow">{mode === "break" ? "Descanso corto" : `Enfoque · sesión ${session+1} de ${task?.pomEstimate || 4}`}</div>
        <div className="lock-task">{task ? task.text : "—"}</div>
        <div className="lock-progress">{Math.round(progress * 100)}% completado · teclado bloqueado</div>

        <div className="lock-ring-wrap">
          <svg className="lock-ring" viewBox="0 0 220 220">
            <circle className="lock-ring-bg" cx="110" cy="110" r="100"/>
            <circle className="lock-ring-fg" cx="110" cy="110" r="100"
              strokeDasharray={circ} strokeDashoffset={offset}/>
          </svg>
          <div className="lock-time-display">
            <div>{fmtTime(left)}</div>
            <div className="lt-sub">{mode === "break" ? "Respira" : "Mantén el enfoque"}</div>
          </div>
        </div>

        <div className="lock-actions">
          <button className="lock-btn primary" onClick={() => setRunning(r => !r)}>
            {running ? "Pausar" : "Reanudar"}
          </button>
          <button className="lock-btn" onClick={onUnlock}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="unlock" size={13}/> Ocultar overlay</span>
          </button>
          <button className="lock-btn danger" onClick={onCancel}>Terminar antes</button>
        </div>
      </div>

      <div className="lock-tip">Tip — teclado y ratón bloqueados fuera de esta tarjeta. Presiona <span style={{ background: "rgba(255,255,255,0.18)", padding: "2px 6px", borderRadius: 4, fontFamily: "SF Mono, monospace", fontSize: 11 }}>Esc</span> dos veces para salir.</div>
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

/* ======================= Menu Bar ======================= */
function MenuBar({ now }) {
  const fmtMenuDate = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmtClock = (d) => {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  };
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
        <span>{fmtMenuDate(now)}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(now)}</span>
      </div>
    </div>
  );
}

/* ======================= Blocker Modal ======================= */
function BlockerModal({ onClose }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newAppName, setNewAppName] = useState('');
  const [newAppDisplay, setNewAppDisplay] = useState('');

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.loadAllowedApps) {
      window.electronAPI.loadAllowedApps().then(data => {
        setConfig(data);
        setLoading(false);
      });
    } else {
      setConfig({
        enabled: true,
        startHour: 8,
        endHour: 17,
        apps: [
          { name: 'chrome', displayName: 'Google Chrome' },
          { name: 'msedge', displayName: 'Microsoft Edge' },
          { name: 'code', displayName: 'Visual Studio Code' },
        ]
      });
      setLoading(false);
    }
  }, []);

  const saveConfig = (newConfig) => {
    setConfig(newConfig);
    if (window.electronAPI && window.electronAPI.saveAllowedApps) {
      window.electronAPI.saveAllowedApps(newConfig);
    }
  };

  const addApp = () => {
    if (!newAppName.trim()) return;
    const updated = {
      ...config,
      apps: [...config.apps, {
        name: newAppName.trim().toLowerCase(),
        displayName: newAppDisplay.trim() || newAppName.trim()
      }]
    };
    saveConfig(updated);
    setNewAppName('');
    setNewAppDisplay('');
  };

  const removeApp = (idx) => {
    const updated = {
      ...config,
      apps: config.apps.filter((_, i) => i !== idx)
    };
    saveConfig(updated);
  };

  const toggleEnabled = () => {
    saveConfig({ ...config, enabled: !config.enabled });
  };

  if (loading || !config) {
    return (
      <div className="scrim" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', padding: 40 }}>
          <div className="modal-title">Cargando...</div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const hour = now.getHours();
  const isRestricted = config.enabled && hour >= config.startHour && hour < config.endHour;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div>
          <div className="modal-eyebrow" style={{ color: isRestricted ? 'var(--red)' : 'var(--green)' }}>
            {isRestricted ? '🔒 Horario Restringido Activo' : '🔓 Fuera de Horario Restringido'}
          </div>
          <div className="modal-title">Control de Aplicaciones</div>
          <div className="modal-sub">
            Administra las aplicaciones permitidas durante el horario de trabajo.
            Solo estas apps se pueden usar de <strong>{config.startHour > 12 ? config.startHour - 12 : config.startHour}:00 {config.startHour >= 12 ? 'PM' : 'AM'}</strong> a <strong>{config.endHour > 12 ? config.endHour - 12 : config.endHour}:00 {config.endHour >= 12 ? 'PM' : 'AM'}</strong>.
          </div>
        </div>

        {/* Toggle blocker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: config.enabled ? 'rgba(255,59,48,0.08)' : 'rgba(52,199,89,0.08)', border: `1px solid ${config.enabled ? 'rgba(255,59,48,0.2)' : 'rgba(52,199,89,0.2)'}`, borderRadius: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{config.enabled ? 'Bloqueador Activo' : 'Bloqueador Desactivado'}</div>
            <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
              {config.enabled ? 'Las apps no permitidas mostrarán alerta' : 'Todas las apps están permitidas'}
            </div>
          </div>
          <button className={`btn ${config.enabled ? 'btn-danger' : 'btn-primary'}`}
            onClick={toggleEnabled}
            style={{ flexShrink: 0 }}>
            {config.enabled ? 'Desactivar' : 'Activar'}
          </button>
        </div>

        {/* Schedule selector */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hora inicio</div>
            <select value={config.startHour}
              onChange={e => saveConfig({ ...config, startHour: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--glass-edge)', background: 'var(--glass-soft)', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }}>
              {Array.from({length: 24}, (_, i) => (
                <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i-12}:00 PM`}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hora fin</div>
            <select value={config.endHour}
              onChange={e => saveConfig({ ...config, endHour: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--glass-edge)', background: 'var(--glass-soft)', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }}>
              {Array.from({length: 24}, (_, i) => (
                <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i-12}:00 PM`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Add app form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-3)' }}>Añadir aplicación permitida</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="modal-input" placeholder="Nombre del proceso (ej: chrome)"
              value={newAppName} onChange={e => setNewAppName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addApp(); }}
              style={{ flex: 1 }} />
            <input className="modal-input" placeholder="Nombre visible (ej: Google Chrome)"
              value={newAppDisplay} onChange={e => setNewAppDisplay(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addApp(); }}
              style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={addApp} disabled={!newAppName.trim()}
              style={{ flexShrink: 0 }}>
              <Icon name="plus" size={14}/> Añadir
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx-3)', lineHeight: 1.4 }}>
            💡 El nombre del proceso es el que aparece en el Administrador de Tareas (sin .exe)
          </div>
        </div>

        {/* App list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-3)' }}>
            Apps permitidas ({config.apps.length})
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {config.apps.map((app, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: 'var(--chip-bg)',
                border: '1px solid var(--chip-edge)',
                borderRadius: 10,
                fontSize: 13.5,
                transition: 'all 0.15s'
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--accent), var(--indigo))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  flexShrink: 0
                }}>
                  {app.displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{app.displayName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-3)', fontFamily: 'monospace' }}>{app.name}.exe</div>
                </div>
                <button className="icon-btn" onClick={() => removeApp(i)}
                  style={{ color: 'var(--red)', flexShrink: 0 }}
                  title="Quitar de la lista">
                  <Icon name="trash" size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" style={{ height: 42, width: '100%', justifyContent: 'center', fontSize: 15 }}
          onClick={onClose}>Listo</button>
      </div>
    </div>
  );
}

/* ======================= Web Blocker Modal ======================= */
function WebBlockerModal({ onClose }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newSite, setNewSite] = useState("");
  const [newCat, setNewCat] = useState("redes_sociales");
  const [openCat, setOpenCat] = useState(null);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.loadBlockedSites) {
      window.electronAPI.loadBlockedSites().then(data => {
        setConfig(data);
        setLoading(false);
      });
    }
  }, []);

  const save = (newConfig) => {
    setConfig(newConfig);
    if (window.electronAPI && window.electronAPI.saveBlockedSites) {
      window.electronAPI.saveBlockedSites(newConfig);
    }
  };

  const toggleMaster = () => save({ ...config, enabled: !config.enabled });
  
  const toggleDay = (d) => {
    const days = config.days.includes(d) ? config.days.filter(x => x !== d) : [...config.days, d];
    save({ ...config, days });
  };

  const toggleCat = (cat) => {
    const categories = { ...config.categories };
    categories[cat].enabled = !categories[cat].enabled;
    save({ ...config, categories });
  };

  const removeDomain = (cat, domain) => {
    const categories = { ...config.categories };
    categories[cat].domains = categories[cat].domains.filter(d => d !== domain);
    save({ ...config, categories });
  };

  const addDomain = () => {
    if (!newSite.trim()) return;
    const categories = { ...config.categories };
    if (!categories[newCat].domains.includes(newSite.trim())) {
      categories[newCat].domains.push(newSite.trim());
      save({ ...config, categories });
      setNewSite("");
    }
  };

  if (loading || !config) return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ textAlign: 'center', padding: 40 }}>
        <div className="modal-title">Cargando configuración...</div>
      </div>
    </div>
  );

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div className="modal-eyebrow">Extensión de Chrome</div>
            <div className="modal-title">Bloqueo de Sitios Web</div>
          </div>
          <div style={{ 
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: 'rgba(52, 199, 89, 0.1)', color: '#34c759', border: '1px solid rgba(52, 199, 89, 0.2)'
          }}>
            Extensión Conectada
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Bloqueo Maestro</div>
            <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>Activa o desactiva todo el filtrado web</div>
          </div>
          <div className={`tw-toggle ${config.enabled ? 'active' : ''}`} onClick={toggleMaster} style={{ 
            width: 48, height: 26, borderRadius: 13, background: config.enabled ? '#34c759' : 'rgba(255,255,255,0.1)',
            position: 'relative', cursor: 'pointer', transition: 'all 0.3s'
          }}>
            <div style={{ 
              width: 20, height: 20, borderRadius: 10, background: '#fff',
              position: 'absolute', top: 3, left: config.enabled ? 25 : 3, transition: 'all 0.3s'
            }} />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horario y Días</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Inicio</div>
              <input type="number" value={config.startHour} onChange={e => save({ ...config, startHour: parseInt(e.target.value) })}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, width: '100%', outline: 'none' }} />
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Fin</div>
              <input type="number" value={config.endHour} onChange={e => save({ ...config, endHour: parseInt(e.target.value) })}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, width: '100%', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((day, i) => (
              <button key={i} onClick={() => toggleDay(i)} style={{ 
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: config.days.includes(i) ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                color: config.days.includes(i) ? '#fff' : 'var(--tx-2)',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
              }}>{day}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categorías de Bloqueo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.keys(config.categories).map(catKey => {
              const cat = config.categories[catKey];
              const isOpen = openCat === catKey;
              return (
                <div key={catKey} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenCat(isOpen ? null : catKey)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox" checked={cat.enabled} onChange={(e) => { e.stopPropagation(); toggleCat(catKey); }} />
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{catKey.replace('_', ' ')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{cat.domains.length} sitios</span>
                      <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={14} />
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {cat.domains.map(d => (
                        <div key={d} style={{ 
                          background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 8,
                          fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
                        }}>
                          {d}
                          <button onClick={() => removeDomain(catKey, d)} style={{ background: 'none', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', padding: 0, fontSize: 14 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Añadir Sitio Personalizado</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="ejemplo.com" value={newSite} onChange={e => setNewSite(e.target.value)}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#fff', outline: 'none' }} />
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px', color: '#fff', outline: 'none' }}>
              <option value="redes_sociales">Redes Sociales</option>
              <option value="compras">Compras</option>
              <option value="entretenimiento">Entretenimiento</option>
              <option value="noticias">Noticias</option>
              <option value="juegos">Juegos</option>
            </select>
            <button className="btn btn-primary" onClick={addDomain} style={{ width: 40, height: 40, padding: 0, justifyContent: 'center' }}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>

        <button className="btn btn-primary" style={{ height: 42, width: '100%', justifyContent: 'center', fontSize: 15 }}
          onClick={onClose}>Cerrar Panel</button>
      </div>
    </div>
  );
}

/* ======================= Blocked App Overlay ======================= */
function BlockedAppOverlay({ processName, time, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', top: 38, left: '50%', transform: 'translateX(-50%)',
      width: 420, borderRadius: 18, overflow: 'hidden',
      background: 'rgba(255, 59, 48, 0.95)',
      backdropFilter: 'blur(30px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: '0 12px 40px -8px rgba(255, 59, 48, 0.5), 0 0 0 1px rgba(255,59,48,0.3)',
      zIndex: 300,
      animation: 'toastDrop 0.45s cubic-bezier(0.3, 1.5, 0.6, 1)',
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      cursor: 'pointer'
    }} onClick={onDismiss}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
          <path d="M12 2L1 21h22L12 2zm0 3.17L20.5 20H3.5L12 5.17zM11 16h2v2h-2zm0-6h2v5h-2z"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
          ⚠ App No Permitida
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
          "{processName}" está bloqueada
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
          Ciérrala para seguir enfocado · {time}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>Cerrar</div>
    </div>
  );
}

/* ======================= Settings Modal ======================= */
function SettingsModal({ settings, onUpdate, onClose }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div>
          <div className="modal-eyebrow">Configuración</div>
          <div className="modal-title">Ajustes de Taskmaster</div>
          <div className="modal-sub">Personaliza tu experiencia de productividad</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Notifications */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Notificaciones</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.notifications} onChange={e => onUpdate('notifications', e.target.checked)} />
              <span>Habilitar notificaciones</span>
            </label>
          </div>

          {/* Sound */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Sonido</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.soundEnabled} onChange={e => onUpdate('soundEnabled', e.target.checked)} />
              <span>Habilitar sonidos</span>
            </label>
          </div>

          {/* Pomodoro Duration */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Duración de Pomodoro</div>
            <input type="range" min="5" max="60" step="1" value={settings.pomDuration}
              onChange={e => onUpdate('pomDuration', parseInt(e.target.value))}
              style={{ width: '100%' }} />
            <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 6 }}>{settings.pomDuration} minutos</div>
          </div>

          {/* Break Duration */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Duración de descanso</div>
            <input type="range" min="1" max="30" step="1" value={settings.breakDuration}
              onChange={e => onUpdate('breakDuration', parseInt(e.target.value))}
              style={{ width: '100%' }} />
            <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 6 }}>{settings.breakDuration} minutos</div>
          </div>

          {/* Auto-start break */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Descanso automático</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.autoStartBreak} onChange={e => onUpdate('autoStartBreak', e.target.checked)} />
              <span>Iniciar descanso automáticamente</span>
            </label>
          </div>

          {/* Auto-start next task */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Próxima tarea</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.autoStartNextTask} onChange={e => onUpdate('autoStartNextTask', e.target.checked)} />
              <span>Ir a la siguiente tarea automáticamente</span>
            </label>
          </div>

          {/* Week start day */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Primer día de la semana</div>
            <select value={settings.weekStartDay} onChange={e => onUpdate('weekStartDay', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--glass-edge)', background: 'var(--glass-soft)', color: 'inherit', fontSize: 13 }}>
              <option value="monday">Lunes</option>
              <option value="sunday">Domingo</option>
            </select>
          </div>

          {/* Time Format */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Formato de hora</div>
            <select value={settings.timeFormat} onChange={e => onUpdate('timeFormat', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--glass-edge)', background: 'var(--glass-soft)', color: 'inherit', fontSize: 13 }}>
              <option value="12h">12 horas (AM/PM)</option>
              <option value="24h">24 horas</option>
            </select>
          </div>

          {/* Hide completed */}
          <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--glass-edge)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Vista</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.hideCompleted} onChange={e => onUpdate('hideCompleted', e.target.checked)} />
              <span>Ocultar tareas completadas por defecto</span>
            </label>
          </div>

          {/* Show subtask progress */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Subtareas</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={settings.showSubtaskProgress} onChange={e => onUpdate('showSubtaskProgress', e.target.checked)} />
              <span>Mostrar progreso de subtareas</span>
            </label>
          </div>
        </div>

        <button className="btn btn-primary" style={{ height: 38, width: "100%", justifyContent: "center", marginTop: 24 }}
          onClick={onClose}>Listo</button>
      </div>
    </div>
  );
}

window.TaskmasterApp = TaskmasterApp;
