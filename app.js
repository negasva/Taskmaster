<<<<<<< HEAD
=======
// ============================================================
>>>>>>> dde5178010be32f32d9d1d5667e63db386f9d774
// TASKMASTER - Main renderer
// Features: edit tasks, subtasks, priority, drag, streak,
//           keyboard shortcuts, pomodoro count, Colombia time,
//           system tray (via Electron IPC), 5PM report
<<<<<<< HEAD
=======
// ============================================================
>>>>>>> dde5178010be32f32d9d1d5667e63db386f9d774

// --- API bridge (Electron IPC or browser fallback) ----------
const eAPI = window.electronAPI || {
    openPomodoro: (tasks) => openInPagePomodoro(tasks),
    onTaskDone: () => { },
    onSessionComplete: () => { },
    onPomodoroClose: () => { },
    minimize: () => { },
    maximize: () => { },
    close: () => { },
    getGroqApiKey: () => Promise.resolve(''),
};

const IS_ELECTRON = !!window.electronAPI;

// --- Constants ----------------------------------------------
const KEYS = {
    tasks: 'tm_tasks_v3',
    streak: 'tm_streak_v2',
    reports: 'tm_reports_v2',
    focus: 'tm_focus_v2',
};
const MIN_TASKS = 3;
const REPORT_HOUR = 17;     // 5 PM Colombia

// Colombia time
const TIME_API = 'https://worldtimeapi.org/api/timezone/America/Bogota';
const WORK_START = 8;
const WORK_END = 17;
let colombiaHour = null;

// --- State --------------------------------------------------
let state = {
    tasks: [],
    editingId: null,
    draggedId: null,
    focusMins: 0,
    pomsToday: 0,
    pomRunning: false,
};

// --- Storage helpers ----------------------------------------
function loadTasks() { try { return JSON.parse(localStorage.getItem(KEYS.tasks)) || []; } catch { return []; } }
function saveTasks() { localStorage.setItem(KEYS.tasks, JSON.stringify(state.tasks)); }
function loadReports() { try { return JSON.parse(localStorage.getItem(KEYS.reports)) || []; } catch { return []; } }
function saveReports(r) { localStorage.setItem(KEYS.reports, JSON.stringify(r.slice(0, 7))); }
function loadStreak() { try { return JSON.parse(localStorage.getItem(KEYS.streak)) || { count: 0, last: '' }; } catch { return { count: 0, last: '' }; } }
function saveStreak(s) { localStorage.setItem(KEYS.streak, JSON.stringify(s)); }
function loadFocus() { try { return JSON.parse(localStorage.getItem(KEYS.focus)) || {}; } catch { return {}; } }
function saveFocus(f) { localStorage.setItem(KEYS.focus, JSON.stringify(f)); }

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// --- Streak -------------------------------------------------
function updateStreak() {
    const s = loadStreak();
    const today = todayKey();
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

    if (s.last === today) return;           // already counted today
    if (s.last === yesterday) s.count++;    // consecutive day
    else s.count = 1;                       // reset streak
    s.last = today;
    saveStreak(s);

    const el = document.getElementById('streak-count');
    if (el) el.textContent = s.count;
}

// --- Colombia time ------------------------------------------
async function fetchColombiaHour() {
    try {
        const res = await fetch(TIME_API);
        const data = await res.json();
        colombiaHour = new Date(data.datetime).getHours();
    } catch {
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        colombiaHour = new Date(utc - 5 * 3600000).getHours();
    }
    return colombiaHour;
}

function isWorkHour() {
    if (colombiaHour === null) return true;
    return colombiaHour >= WORK_START && colombiaHour < WORK_END;
}

// --- Task CRUD ----------------------------------------------
function createTask(text, priority = 'medium', notes = '') {
    return { id: uid(), text, priority, notes, completed: false, pomodoroCount: 0, subtasks: [] };
}

function addTask(text, priority, notes) {
    if (!text.trim()) return;
    state.tasks.push(createTask(text.trim(), priority, notes));
    saveTasks();
    render();
}

function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveTasks();
    render();
}

function toggleTask(id) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    saveTasks();
    render();
}

function saveEditTask(id, newText, newPriority, newNotes) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    if (newText.trim()) t.text = newText.trim();
    t.priority = newPriority;
    t.notes = newNotes;
    state.editingId = null;
    saveTasks();
    render();
}

// --- Subtask CRUD -------------------------------------------
function addSubtask(taskId, text) {
    if (!text.trim()) return;
    const t = state.tasks.find(t => t.id === taskId);
    if (!t) return;
    t.subtasks.push({ id: uid(), text: text.trim(), completed: false });
    saveTasks();
    renderTask(taskId);
}

function toggleSubtask(taskId, subId) {
    const t = state.tasks.find(t => t.id === taskId);
    if (!t) return;
    const s = t.subtasks.find(s => s.id === subId);
    if (!s) return;
    s.completed = !s.completed;
    saveTasks();
    renderTask(taskId);
}

function deleteSubtask(taskId, subId) {
    const t = state.tasks.find(t => t.id === taskId);
    if (!t) return;
    t.subtasks = t.subtasks.filter(s => s.id !== subId);
    saveTasks();
    renderTask(taskId);
}

function editSubtask(taskId, subId, newText) {
    const t = state.tasks.find(t => t.id === taskId);
    if (!t) return;
    const s = t.subtasks.find(s => s.id === subId);
    if (!s || !newText.trim()) return;
    s.text = newText.trim();
    saveTasks();
    renderTask(taskId);
}

// --- Render -------------------------------------------------
function render() {
    renderTaskList();
    renderMeta();
}

function renderMeta() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.completed).length;

    const countEl = document.getElementById('task-count');
    if (countEl) countEl.textContent = `${total - done} remaining`;

    const sumEl = document.getElementById('bottom-summary');
    if (sumEl) sumEl.textContent = `${done} of ${total} completed`;

    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) emptyEl.classList.toggle('hidden', total > 0);

    // Focus / pomodoro stats
    const focus = loadFocus();
    const todayFocus = focus[todayKey()] || { mins: 0, poms: 0 };
    const focusEl = document.getElementById('focus-today');
    const pomEl = document.getElementById('pom-today');
    if (focusEl) focusEl.textContent = `${todayFocus.mins} min focused`;
    if (pomEl) pomEl.textContent = `${todayFocus.poms} pomodoros`;
}

function renderTaskList() {
    const list = document.getElementById('task-list');
    if (!list) return;

    list.innerHTML = '';
    state.tasks.forEach(task => {
        list.appendChild(buildTaskEl(task));
    });
}

// Re-render only one task item (for subtask updates)
function renderTask(taskId) {
    const old = document.querySelector(`[data-id="${taskId}"]`);
    if (!old) return;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const next = buildTaskEl(task, old.dataset.expanded === 'true');
    old.replaceWith(next);
}

function buildTaskEl(task, expanded = false) {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' completed' : ''}`;
    li.dataset.id = task.id;
    li.dataset.priority = task.priority;
    li.dataset.expanded = expanded;
    li.draggable = true;

    const hasSubtasks = task.subtasks.length > 0;
    const doneSubs = task.subtasks.filter(s => s.completed).length;
    const pomText = task.pomodoroCount > 0 ? `${task.pomodoroCount} pom${task.pomodoroCount > 1 ? 's' : ''}` : '';

    const isEditing = state.editingId === task.id;

    li.innerHTML = `
      <div class="task-main">
        <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''}>
        <div class="task-body">
          ${isEditing ? `
            <input type="text" class="task-edit-input" value="${esc(task.text)}" id="edit-text-${task.id}">
            <div style="display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap">
              <div class="prio-picker" id="edit-pri-${task.id}" data-val="${task.priority}">
                <button class="prio-btn prio-low  ${task.priority === 'low' ? 'active' : ''}"    data-val="low">Low</button>
                <button class="prio-btn prio-med  ${task.priority === 'medium' ? 'active' : ''}" data-val="medium">Med</button>
                <button class="prio-btn prio-high ${task.priority === 'high' ? 'active' : ''}"   data-val="high">High</button>
              </div>
              <input type="text" class="notes-input" id="edit-notes-${task.id}" placeholder="Notes..." value="${esc(task.notes)}" style="flex:1;min-width:120px">
              <button class="btn-xs save-edit-btn">Save</button>
              <button class="btn-ghost cancel-edit-btn" style="padding:5px 9px;font-size:12px">Cancel</button>
            </div>
          ` : `
            <span class="task-text">${esc(task.text)}</span>
            ${task.notes ? `<p class="task-notes-preview">${esc(task.notes)}</p>` : ''}
            <div class="task-meta">
              ${hasSubtasks ? `<span class="pom-badge">${doneSubs}/${task.subtasks.length} subtasks</span>` : ''}
              ${pomText ? `<span class="pom-badge">${pomText}</span>` : ''}
            </div>
          `}
        </div>
        <div class="task-actions">
          <button class="action-btn expand-btn" title="${expanded ? 'Collapse' : 'Expand'}">${expanded ? '&#8964;' : '&#8963;'}</button>
          <button class="action-btn info-btn" title="What is this task?" data-task-id="${task.id}">?</button>
          ${!isEditing ? `<button class="action-btn edit-btn">Edit</button>` : ''}
          <button class="action-btn delete-btn">Remove</button>
        </div>
      </div>
      ${!isEditing && expanded ? buildSubtasksHtml(task) : ''}
    `;

    // Events
    li.querySelector('.task-check').addEventListener('change', () => toggleTask(task.id));

    li.querySelector('.expand-btn').addEventListener('click', () => {
        const wasExpanded = li.dataset.expanded === 'true';
        li.dataset.expanded = !wasExpanded;
        const next = buildTaskEl(task, !wasExpanded);
        li.replaceWith(next);
    });

    // Delete with confirm popup
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        // Toggle: if popup already open, close it
        const existing = li.querySelector('.confirm-popup');
        if (existing) { existing.remove(); return; }

        const popup = document.createElement('div');
        popup.className = 'confirm-popup';
        popup.innerHTML = `
            <span>Remove this task?</span>
            <button class="confirm-yes">Remove</button>
            <button class="confirm-no">Cancel</button>
        `;
        popup.querySelector('.confirm-yes').addEventListener('click', () => deleteTask(task.id));
        popup.querySelector('.confirm-no').addEventListener('click', () => popup.remove());
        li.appendChild(popup);

        // Close if clicking outside
        setTimeout(() => {
            document.addEventListener('click', function handler() {
                popup.remove();
                document.removeEventListener('click', handler);
            });
        }, 50);
    });

    if (!isEditing) {
        li.querySelector('.edit-btn').addEventListener('click', () => {
            state.editingId = task.id;
            render();
            setTimeout(() => document.getElementById(`edit-text-${task.id}`)?.focus(), 50);
        });
    } else {
        // Wire priority picker in edit mode
        const editPriPicker = li.querySelector(`#edit-pri-${task.id}`);
        editPriPicker?.addEventListener('click', (e) => {
            const btn = e.target.closest('.prio-btn');
            if (!btn) return;
            editPriPicker.querySelectorAll('.prio-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            editPriPicker.dataset.val = btn.dataset.val;
        });

        li.querySelector('.save-edit-btn').addEventListener('click', () => {
            const text = document.getElementById(`edit-text-${task.id}`)?.value || task.text;
            const pri = document.getElementById(`edit-pri-${task.id}`)?.dataset.val || task.priority;
            const notes = document.getElementById(`edit-notes-${task.id}`)?.value || '';
            saveEditTask(task.id, text, pri, notes);
        });

        li.querySelector('.cancel-edit-btn').addEventListener('click', () => {
            state.editingId = null;
            render();
        });

        li.querySelector('.task-edit-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') li.querySelector('.save-edit-btn').click();
            if (e.key === 'Escape') li.querySelector('.cancel-edit-btn').click();
        });
    }

    // Subtask events (when expanded)
    if (expanded) wireSubtaskEvents(li, task);

    // Drag-to-reorder
    li.addEventListener('dragstart', () => { state.draggedId = task.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); });
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (state.draggedId && state.draggedId !== task.id) {
            const fromI = state.tasks.findIndex(t => t.id === state.draggedId);
            const toI = state.tasks.findIndex(t => t.id === task.id);
            const [moved] = state.tasks.splice(fromI, 1);
            state.tasks.splice(toI, 0, moved);
            saveTasks();
            render();
        }
        state.draggedId = null;
    });

    return li;
}

function buildSubtasksHtml(task) {
    const items = task.subtasks.map(s => `
      <li class="subtask-item${s.completed ? ' done' : ''}" data-sub-id="${s.id}">
        <input type="checkbox" class="subtask-check" ${s.completed ? 'checked' : ''}>
        <span class="subtask-text">${esc(s.text)}</span>
        <button class="subtask-del" title="Remove">&#215;</button>
      </li>
    `).join('');

    return `
      <div class="subtasks-wrap">
        <ul class="subtask-list">${items}</ul>
        <div class="add-subtask-row">
          <input type="text" class="add-subtask-input" placeholder="Add subtask...">
          <button class="btn-xs add-sub-btn">Add</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="ai-gen-btn" data-task-id="${task.id}">
            Generate 4 subtasks with AI
          </button>
          ${task.subtasks.length > 0 ? `<button class="ai-regen-btn" data-task-id="${task.id}" title="Regenerate subtasks">↻</button>` : ''}
        </div>
      </div>
    `;
}

function wireSubtaskEvents(li, task) {
    const wrap = li.querySelector('.subtasks-wrap');
    if (!wrap) return;

    wrap.querySelectorAll('.subtask-check').forEach(cb => {
        cb.addEventListener('change', () => toggleSubtask(task.id, cb.closest('.subtask-item').dataset.subId));
    });

    wrap.querySelectorAll('.subtask-del').forEach(btn => {
        btn.addEventListener('click', () => deleteSubtask(task.id, btn.closest('.subtask-item').dataset.subId));
    });

    // Double-click subtask text to edit inline
    wrap.querySelectorAll('.subtask-text').forEach(span => {
        span.addEventListener('dblclick', () => {
            const subId = span.closest('.subtask-item').dataset.subId;
            const input = document.createElement('input');
            input.className = 'subtask-text-input';
            input.value = span.textContent;
            span.replaceWith(input);
            input.focus();
            const save = () => { editSubtask(task.id, subId, input.value); };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') renderTask(task.id);
            });
        });
    });

    const addInput = wrap.querySelector('.add-subtask-input');
    const addBtn = wrap.querySelector('.add-sub-btn');

    if (addBtn && addInput) {
        const doAdd = () => { addSubtask(task.id, addInput.value); addInput.value = ''; };
        addBtn.addEventListener('click', doAdd);
        addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    }

    wireAiGenButton(wrap, task);
}

// --- Escape HTML -------------------------------------------
function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Priority picker (add form) -----------------------------
document.getElementById('priority-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.prio-btn');
    if (!btn) return;
    const picker = document.getElementById('priority-picker');
    picker.querySelectorAll('.prio-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    picker.dataset.val = btn.dataset.val;
});

// --- Inline add form ----------------------------------------
const addForm = document.getElementById('add-form');
const taskInput = document.getElementById('task-input');
const notesInput = document.getElementById('notes-input');
const saveTaskBtn = document.getElementById('save-task-btn');
const cancelBtn = document.getElementById('cancel-add-btn');
const addTaskBtn = document.getElementById('add-task-btn');
const addFirstBtn = document.getElementById('add-first-btn');

function showAddForm() {
    addForm?.classList.remove('hidden');
    taskInput?.focus();
}

function hideAddForm() {
    addForm?.classList.add('hidden');
    if (taskInput) taskInput.value = '';
    if (notesInput) notesInput.value = '';
    // Reset picker to medium
    const picker = document.getElementById('priority-picker');
    if (picker) {
        picker.querySelectorAll('.prio-btn').forEach(b => b.classList.remove('active'));
        picker.querySelector('[data-val="medium"]')?.classList.add('active');
        picker.dataset.val = 'medium';
    }
}

function doAddTask() {
    const pri = document.getElementById('priority-picker')?.dataset.val || 'medium';
    addTask(taskInput?.value || '', pri, notesInput?.value || '');
    taskInput.value = '';
    notesInput.value = '';
    taskInput?.focus();
}

addTaskBtn?.addEventListener('click', showAddForm);
addFirstBtn?.addEventListener('click', showAddForm);
saveTaskBtn?.addEventListener('click', doAddTask);
cancelBtn?.addEventListener('click', hideAddForm);
taskInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddTask();
    if (e.key === 'Escape') hideAddForm();
});

// --- Keyboard shortcuts -------------------------------------
document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        showAddForm();
    }
    if (e.code === 'Space') {
        e.preventDefault();
        // Toggle in-page pomodoro if open
        const toggleOl = document.getElementById('ol-pom-toggle');
        if (toggleOl && !document.getElementById('pom-overlay').classList.contains('hidden')) {
            toggleOl.click();
        }
    }
});

// --- Pomodoro (in-page overlay for browser / backup) --------
// These variables drive the in-page overlay timer
let olTasks = [], olIndex = 0, olSecs = 30 * 60, olTotal = 30 * 60,
    olRunning = false, olInterval = null, olBreak = false,
    olPomsDone = 0;

const RING_CIRC = 553;

function openInPagePomodoro(tasks) {
    olTasks = tasks.filter(t => !t.completed);
    olIndex = 0;
    olSecs = 30 * 60;
    olTotal = 30 * 60;
    olBreak = false;
    olPomsDone = 0;
    olRunning = false;

    document.getElementById('pom-overlay')?.classList.remove('hidden');
    olRenderAll();
}

function olRenderAll() {
    const task = olTasks[olIndex];
    const modeEl = document.getElementById('ol-pom-mode');
    const taskEl = document.getElementById('ol-pom-task');
    const timeEl = document.getElementById('ol-pom-time');
    const ringEl = document.getElementById('ol-ring-fg');
    const dotsEl = document.getElementById('ol-pom-dots');
    const listEl = document.getElementById('ol-pom-list');
    const toggleBtn = document.getElementById('ol-pom-toggle');

    if (modeEl) modeEl.textContent = olBreak ? 'Short break' : 'Focus';
    if (taskEl) taskEl.textContent = task ? task.text : 'All done';

    const m = Math.floor(olSecs / 60), s = olSecs % 60;
    if (timeEl) timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (ringEl) {
        const pct = olSecs / olTotal;
        ringEl.style.strokeDashoffset = RING_CIRC * (1 - pct);
        ringEl.classList.toggle('break-mode', olBreak);
        ringEl.classList.toggle('danger', !olBreak && olSecs <= 300);
        ringEl.classList.toggle('warning', !olBreak && olSecs > 300 && olSecs <= 600);
    }

    if (dotsEl) {
        dotsEl.innerHTML = '';
        for (let i = 0; i < Math.min(olPomsDone + 1, 8); i++) {
            const d = document.createElement('div');
            d.className = 'pom-dot' + (i < olPomsDone ? ' done' : '');
            dotsEl.appendChild(d);
        }
    }

    if (listEl) {
        listEl.innerHTML = '';
        olTasks.forEach((t, i) => {
            const li = document.createElement('li');
            li.textContent = t.text;
            li.className = i < olIndex ? 'pom-done' : i === olIndex ? 'pom-current' : '';
            listEl.appendChild(li);
        });
    }

    if (toggleBtn) {
        toggleBtn.textContent = olRunning ? 'Pause' : (olSecs < olTotal ? 'Resume' : 'Start');
        toggleBtn.classList.toggle('paused', olRunning);
    }
}

function olTick() {
    olSecs--;
    if (olSecs <= 0) {
        clearInterval(olInterval);
        olRunning = false;
        playSound();
        olPomsDone++;

        // Update focus stats
        const key = todayKey();
        const focus = loadFocus();
        if (!focus[key]) focus[key] = { mins: 0, poms: 0 };
        focus[key].mins += olBreak ? 0 : 30;
        focus[key].poms += olBreak ? 0 : 1;
        saveFocus(focus);
        renderMeta();

        // Mark task pomodoro count
        const task = state.tasks.find(t => t.id === olTasks[olIndex]?.id);
        if (task && !olBreak) task.pomodoroCount++;
        saveTasks();

        if (!olBreak) {
            // Start break
            olBreak = true;
            olSecs = 5 * 60;
            olTotal = 5 * 60;
        } else {
            // Break done, next task
            olBreak = false;
            olIndex++;
            if (olIndex >= olTasks.length) {
                document.getElementById('pom-overlay')?.classList.add('hidden');
                render();
                return;
            }
            olSecs = 30 * 60;
            olTotal = 30 * 60;
        }
        olRenderAll();
        return;
    }
    olRenderAll();
}

function olToggle() {
    if (olRunning) {
        clearInterval(olInterval);
        olRunning = false;
    } else {
        olRunning = true;
        olInterval = setInterval(olTick, 1000);
    }
    olRenderAll();
}

document.getElementById('ol-pom-toggle')?.addEventListener('click', olToggle);
document.getElementById('ol-pom-close')?.addEventListener('click', () => {
    clearInterval(olInterval);
    olRunning = false;
    document.getElementById('pom-overlay')?.classList.add('hidden');
    render();
});
document.getElementById('ol-pom-next')?.addEventListener('click', () => {
    clearInterval(olInterval);
    olRunning = false;
    olIndex = Math.min(olIndex + 1, olTasks.length - 1);
    olBreak = false; olSecs = 30 * 60; olTotal = 30 * 60;
    olRenderAll();
});
document.getElementById('ol-pom-prev')?.addEventListener('click', () => {
    clearInterval(olInterval);
    olRunning = false;
    olIndex = Math.max(olIndex - 1, 0);
    olBreak = false; olSecs = 30 * 60; olTotal = 30 * 60;
    olRenderAll();
});

// --- Start Pomodoro button ----------------------------------
document.getElementById('start-pom-btn')?.addEventListener('click', async () => {
    const pending = state.tasks.filter(t => !t.completed);
    if (pending.length === 0) {
        showToast('No pending tasks');
        return;
    }
    await fetchColombiaHour();
    if (!isWorkHour()) {
        showToast(`Outside work hours (${WORK_START}AM - ${WORK_END % 12}PM Colombia)`);
        return;
    }
    if (IS_ELECTRON) {
        eAPI.openPomodoro(pending);
    } else {
        openInPagePomodoro(pending);
    }
});

// View report button
document.getElementById('view-report-btn')?.addEventListener('click', openReportModal);

// --- IPC events (Electron) ----------------------------------
eAPI.onTaskDone((id) => {
    const t = state.tasks.find(t => t.id === id);
    if (t) { t.pomodoroCount++; saveTasks(); render(); }
});

eAPI.onSessionComplete(() => {
    render();
    showToast('Session complete');
});

eAPI.onPomodoroClose(() => {
    render();
});

// --- Sound --------------------------------------------------
function playSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
            osc.start(t); osc.stop(t + 0.7);
        });
    } catch { }
}

// --- Toast notification -------------------------------------
let notifTimeout = null;

function showToast(message) {
    const el = document.getElementById('notification');
    const sub = document.getElementById('notif-task-text');
    if (!el) return;
    if (sub) sub.textContent = message;
    el.classList.remove('hidden');
    el.offsetHeight;
    el.classList.add('show');
    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(hideNotification, 5000);
}

function hideNotification() {
    const el = document.getElementById('notification');
    el?.classList.remove('show');
    setTimeout(() => el?.classList.add('hidden'), 400);
}

// Expose hideNotification for onclick in HTML
window.hideNotification = hideNotification;

// --- Sidebar date -------------------------------------------
function renderDate() {
    const el = document.getElementById('sidebar-date');
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// --- Mandatory task modal -----------------------------------
const MODAL_KEY = 'tm_modal_tasks_v3';
let modalTasks = [];

function loadModalTasks() {
    try { return JSON.parse(localStorage.getItem(MODAL_KEY)) || []; } catch { return []; }
}
function saveModalTasks() { localStorage.setItem(MODAL_KEY, JSON.stringify(modalTasks)); }

function renderModalList() {
    const list = document.getElementById('modal-task-list');
    const prog = document.getElementById('modal-progress');
    const cnt = document.getElementById('modal-counter');
    const btn = document.getElementById('modal-start-btn');
    if (!list) return;

    list.innerHTML = '';
    modalTasks.forEach((t, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${esc(t.text)}</span><button class="del-btn">&#215;</button>`;
        li.querySelector('.del-btn').addEventListener('click', () => {
            modalTasks.splice(i, 1);
            saveModalTasks();
            renderModalList();
        });
        list.appendChild(li);
    });

    const n = modalTasks.length;
    const pct = Math.min((n / MIN_TASKS) * 100, 100);
    if (prog) prog.style.width = pct + '%';
    if (cnt) cnt.textContent = `${n} of ${MIN_TASKS} tasks`;
    if (btn) {
        btn.disabled = n < MIN_TASKS;
        btn.textContent = n >= MIN_TASKS ? 'Start working' : `${MIN_TASKS - n} more task${MIN_TASKS - n !== 1 ? 's' : ''} needed`;
    }
}

document.getElementById('modal-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('modal-input');
    if (!input?.value.trim()) { input.style.borderColor = 'var(--red)'; setTimeout(() => input.style.borderColor = '', 800); return; }
    modalTasks.push(createTask(input.value.trim()));
    input.value = '';
    saveModalTasks();
    renderModalList();
    input.focus();
});

document.getElementById('modal-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modal-add-btn')?.click();
});

document.getElementById('modal-start-btn')?.addEventListener('click', () => {
    if (modalTasks.length < MIN_TASKS) return;
    // Merge modal tasks into main state (avoid duplicates by id)
    const existingIds = new Set(state.tasks.map(t => t.id));
    modalTasks.forEach(t => { if (!existingIds.has(t.id)) state.tasks.push(t); });
    saveTasks();
    document.getElementById('task-modal')?.classList.add('hidden');
    render();
});

// Block ESC on modals
document.addEventListener('keydown', (e) => {
    const modalOpen = !document.getElementById('task-modal')?.classList.contains('hidden');
    const reportOpen = !document.getElementById('report-modal')?.classList.contains('hidden');
    if ((modalOpen || reportOpen) && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Shake the visible modal
        const card = (modalOpen
            ? document.querySelector('#task-modal .modal-card')
            : document.querySelector('#report-modal .modal-card'));
        if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = 'shake .4s'; }
    }
}, true);

// Block click outside modal
['task-modal', 'report-modal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
        if (e.target.id === id) {
            const card = e.target.querySelector('.modal-card');
            if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = 'shake .4s'; }
        }
    });
});

// Add shake keyframe via JS
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake { 0%,100%{transform:scale(1) translateX(0)} 25%{transform:scale(1) translateX(-8px)} 75%{transform:scale(1) translateX(8px)} }`;
document.head.appendChild(shakeStyle);

// --- 5 PM Report modal --------------------------------------
function openReportModal() {
    const list = document.getElementById('report-checklist');
    if (!list) return;

    list.innerHTML = '';
    state.tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = t.completed ? 'r-done' : '';
        li.dataset.id = t.id;
        li.innerHTML = `<input type="checkbox" ${t.completed ? 'checked' : ''}><label>${esc(t.text)}</label>`;
        li.querySelector('input').addEventListener('change', (e) => {
            li.classList.toggle('r-done', e.target.checked);
        });
        li.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') li.querySelector('input').click();
        });
        list.appendChild(li);
    });

    document.getElementById('report-modal')?.classList.remove('hidden');
    renderHistory();
}

document.getElementById('report-save-btn')?.addEventListener('click', () => {
    const checks = [...document.querySelectorAll('#report-checklist input')];
    const anyDone = checks.some(c => c.checked);
    const notes = document.getElementById('report-notes')?.value.trim();
    const errEl = document.getElementById('report-error');

    if (!anyDone || !notes) {
        errEl?.classList.remove('hidden');
        return;
    }

    errEl?.classList.add('hidden');

    const reports = loadReports().filter(r => r.date !== todayKey());
    reports.unshift({
        date: todayKey(),
        notes,
        tasks: [...document.querySelectorAll('#report-checklist li')].map(li => ({
            text: li.querySelector('label')?.textContent || '',
            done: li.querySelector('input')?.checked || false,
        })),
    });
    saveReports(reports);
    document.getElementById('report-modal')?.classList.add('hidden');
});

document.getElementById('history-toggle')?.addEventListener('click', () => {
    const list = document.getElementById('history-list');
    list?.classList.toggle('hidden');
    document.getElementById('history-toggle').textContent =
        list?.classList.contains('hidden') ? 'Show history (last 7 days)' : 'Hide history';
    if (!list?.classList.contains('hidden')) renderHistory();
});

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const reports = loadReports();
    if (reports.length === 0) { list.innerHTML = '<p style="font-size:13px;color:var(--text-4)">No history yet.</p>'; return; }
    list.innerHTML = reports.map(r => {
        const taskLines = (r.tasks || []).map(t =>
            `<span class="${t.done ? 'h-done' : 'h-skip'}">${t.done ? '+' : '-'} ${esc(t.text)}</span>`
        ).join('<br>');
        return `<div class="h-entry">
            <div class="h-date">${r.date}</div>
            <div class="h-note">"${esc(r.notes)}"</div>
            <div class="h-tasks">${taskLines}</div>
        </div>`;
    }).join('');
}

function alreadyReportedToday() { return loadReports().some(r => r.date === todayKey()); }

// Check 5PM every minute
setInterval(async () => {
    await fetchColombiaHour();
    if (colombiaHour !== null && colombiaHour >= REPORT_HOUR && !alreadyReportedToday() && state.tasks.length > 0) {
        openReportModal();
    }
}, 60 * 1000);

// --- Electron titlebar wiring -------------------------------
if (IS_ELECTRON) {
    document.getElementById('titlebar')?.classList.remove('hidden');
    document.body.classList.add('has-titlebar');
    document.getElementById('tb-min')?.addEventListener('click', () => eAPI.minimize());
    document.getElementById('tb-max')?.addEventListener('click', () => eAPI.maximize());
    document.getElementById('tb-close')?.addEventListener('click', () => eAPI.close());
}

// --- AI Subtask Generation (Groq API) -----------------------
// Groq usa formato igual que OpenAI
let GROQ_KEY = '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Llama a Groq, pide 4 subtareas, devuelve array
async function callGroq(taskTitle) {
    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{
                role: 'user',
                content: `Generate exactly 4 short practical subtasks for this task: "${taskTitle}".
Return ONLY a JSON array of 4 strings. No explanation. No markdown. Example:
["Step one", "Step two", "Step three", "Step four"]`,
            }],
            temperature: 1,
            max_completion_tokens: 256,
            top_p: 1,
            stream: false,
        }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    // Sacar el array JSON de la respuesta
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Bad response');
    return JSON.parse(match[0]);
}

// Genera y agrega las 4 subtareas a la tarea
async function handleGenerateSubtasks(taskId) {
    const btn = document.querySelector(`.ai-gen-btn[data-task-id="${taskId}"]`);
    const task = state.tasks.find(t => t.id === taskId);
    if (!btn || !task) return;

    // Loading state
    btn.textContent = 'Generating...';
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const subtasks = await callGroq(task.text);
        subtasks.forEach(text => {
            if (text?.trim()) task.subtasks.push({ id: uid(), text: text.trim(), completed: false });
        });
        saveTasks();
        renderTask(taskId);
    } catch (err) {
        btn.textContent = 'Error - try again';
        btn.classList.remove('loading');
        btn.disabled = false;
        console.error('Groq error:', err);
    }
}

// Conectar el botón AI (wireSubtaskEvents llama esto)
// Ahora el click va a showQuestionsModal por event delegation arriba
function wireAiGenButton(wrap, task) {
    const btn = wrap.querySelector('.ai-regen-btn');
    if (!btn) return;
    // La delegation ya captura los clicks
}

// --- Info Tooltip & Questions Modal ---------------------------
const QUESTIONS = [
    {
        text: '¿Cuál es el objetivo principal?',
        options: ['Aprender algo nuevo', 'Completar proyecto', 'Resolver problema']
    },
    {
        text: '¿Cuánto tiempo tienes?',
        options: ['Menos de 1 hora', '1-3 horas', 'Más de 3 horas']
    },
    {
        text: '¿Qué necesitas primero?',
        options: ['Investigar/planear', 'Herramientas/recursos', 'Ayuda de alguien']
    },
    {
        text: '¿Nivel de experiencia en esto?',
        options: ['Primera vez', 'Ya lo he hecho', 'Soy experto']
    },
    {
        text: '¿Cuál es el mayor obstáculo?',
        options: ['No sé por dónde empezar', 'Falta de tiempo', 'Falta de recursos']
    }
];

let currentQuestionTaskId = null;

// Show tooltip con explicación de IA
async function showTooltip(taskId, event) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const tooltip = document.getElementById('info-tooltip');
    const text = document.getElementById('tooltip-text');

    if (!tooltip || !text) return;

    // Show loading
    text.textContent = 'Loading explanation...';
    tooltip.classList.remove('hidden');

    try {
        // Get plain text explanation
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{
                    role: 'user',
                    content: `Explain in 1-2 sentences what this task is and what to do: "${task.text}". Be concise and clear.`,
                }],
                temperature: 1,
                max_completion_tokens: 128,
                top_p: 1,
                stream: false,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            const explanation = data.choices?.[0]?.message?.content || '';
            text.textContent = explanation || 'Task: ' + task.text;
        } else {
            text.textContent = 'Task: ' + task.text;
        }
    } catch (err) {
        text.textContent = 'Task: ' + task.text;
        console.error('Tooltip error:', err);
    }

    // Position tooltip near button
    const btn = event.target;
    const rect = btn.getBoundingClientRect();
    tooltip.style.top = (rect.top - 100) + 'px';
    tooltip.style.left = (rect.left - 50) + 'px';

    // Hide on click elsewhere
    setTimeout(() => {
        document.addEventListener('click', function hideTooltip(e) {
            if (!tooltip.contains(e.target) && e.target !== btn) {
                tooltip.classList.add('hidden');
                document.removeEventListener('click', hideTooltip);
            }
        });
    }, 50);
}

// Show questions modal
function showQuestionsModal(taskId) {
    currentQuestionTaskId = taskId;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const list = document.getElementById('questions-list');
    if (!list) return;

    // Clear and build questions
    list.innerHTML = '';
    QUESTIONS.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'question-item';
        div.innerHTML = `
            <p class="question-text">${idx + 1}. ${q.text}</p>
            <div class="question-options">
                ${q.options.map((opt, i) => `
                    <label class="radio-option">
                        <input type="radio" name="q${idx}" value="${opt}" data-question="${idx}">
                        <span>${opt}</span>
                    </label>
                `).join('')}
                <label class="radio-option radio-otro">
                    <input type="radio" name="q${idx}" value="otro" data-question="${idx}" class="otro-radio">
                    <span>Otro:</span>
                    <input type="text" class="otro-input" data-question="${idx}" placeholder="Your answer...">
                </label>
            </div>
        `;
        list.appendChild(div);
    });

    // Wire radio buttons to show/hide "Otro" input
    list.querySelectorAll('.otro-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const idx = radio.dataset.question;
            const otrInput = list.querySelector(`.otro-input[data-question="${idx}"]`);
            if (otrInput) otrInput.style.display = 'block';
        });
    });

    list.querySelectorAll('input[type="radio"]:not(.otro-radio)').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const idx = radio.dataset.question;
            const otrInput = list.querySelector(`.otro-input[data-question="${idx}"]`);
            if (otrInput) otrInput.style.display = 'none';
        });
    });

    document.getElementById('questions-modal')?.classList.remove('hidden');
}

// Collect answers from modal
function collectAnswers() {
    const answers = [];
    QUESTIONS.forEach((q, idx) => {
        const selected = document.querySelector(`input[name="q${idx}"]:checked`);
        if (!selected) {
            answers.push('No response');
            return;
        }

        if (selected.value === 'otro') {
            const otrInput = document.querySelector(`.otro-input[data-question="${idx}"]`);
            answers.push(otrInput?.value?.trim() || 'Otro');
        } else {
            answers.push(selected.value);
        }
    });
    return answers;
}

// Call Groq with context
async function callGroqWithContext(taskTitle, contextAnswers) {
    let content;
    if (contextAnswers && contextAnswers.length === 5) {
        content = `Eres asistente experto productividad.
Tarea: "${taskTitle}"

Contexto del usuario:
- Objetivo: ${contextAnswers[0]}
- Tiempo disponible: ${contextAnswers[1]}
- Necesita primero: ${contextAnswers[2]}
- Experiencia: ${contextAnswers[3]}
- Mayor obstáculo: ${contextAnswers[4]}

Genera exactamente 4 subtareas específicas y accionables considerando TODO el contexto.
Responde SOLO con array JSON: ["subtarea 1", "subtarea 2", "subtarea 3", "subtarea 4"]`;
    } else {
        // Sin contexto, simple
        content = `Generate exactly 4 short practical subtasks for: "${taskTitle}".
Return ONLY a JSON array of 4 strings, no markdown.
["Step one", "Step two", "Step three", "Step four"]`;
    }

    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content }],
            temperature: 1,
            max_completion_tokens: 256,
            top_p: 1,
            stream: false,
        }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Bad response');
    return JSON.parse(match[0]);
}

// Regenerate subtasks (delete old ones, generate new)
async function regenerateSubtasks(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const btn = document.querySelector(`.ai-regen-btn[data-task-id="${taskId}"]`);
    if (!btn) return;

    // Loading state
    btn.textContent = '↻ Regenerating...';
    btn.disabled = true;

    try {
        // Delete old subtasks
        task.subtasks = [];

        // Generate new ones
        const subtasks = await callGroq(task.text);
        subtasks.forEach(text => {
            if (text?.trim()) task.subtasks.push({ id: uid(), text: text.trim(), completed: false });
        });
        saveTasks();
        renderTask(taskId);
    } catch (err) {
        btn.textContent = '↻ Error';
        btn.disabled = false;
        console.error('Regen error:', err);
        setTimeout(() => { btn.textContent = '↻'; btn.disabled = false; }, 2000);
    }
}

// Wire info button
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('info-btn')) {
        e.stopPropagation();
        const taskId = e.target.dataset.taskId;
        showTooltip(taskId, e);
    }
});

// Wire regenerate button
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ai-regen-btn')) {
        e.stopPropagation();
        const taskId = e.target.dataset.taskId;
        regenerateSubtasks(taskId);
    }
});

// Wire generate button to show questions modal instead
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ai-gen-btn')) {
        e.stopPropagation();
        const taskId = e.target.dataset.taskId;
        showQuestionsModal(taskId);
    }
});

// Questions modal buttons
document.getElementById('gen-with-answers-btn')?.addEventListener('click', async () => {
    if (!currentQuestionTaskId) return;

    const task = state.tasks.find(t => t.id === currentQuestionTaskId);
    if (!task) return;

    const btn = document.getElementById('gen-with-answers-btn');
    const modal = document.getElementById('questions-modal');

    // Loading state
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const answers = collectAnswers();
        const subtasks = await callGroqWithContext(task.text, answers);

        subtasks.forEach(text => {
            if (text?.trim()) task.subtasks.push({ id: uid(), text: text.trim(), completed: false });
        });

        saveTasks();
        modal?.classList.add('hidden');
        renderTask(currentQuestionTaskId);
        btn.textContent = 'Generate subtasks';
        btn.disabled = false;
        currentQuestionTaskId = null;
    } catch (err) {
        btn.textContent = 'Error - try again';
        btn.disabled = false;
        console.error('Generate error:', err);
    }
});

document.getElementById('cancel-questions-btn')?.addEventListener('click', () => {
    document.getElementById('questions-modal')?.classList.add('hidden');
    currentQuestionTaskId = null;
});

// --- Shortcuts toggle ----------------------------------------
document.getElementById('shortcuts-toggle')?.addEventListener('click', () => {
    const rows = document.getElementById('shortcut-rows');
    const icon = document.getElementById('shortcuts-icon');
    rows?.classList.toggle('hidden');
    if (icon) {
        const isOpen = !rows?.classList.contains('hidden');
        icon.textContent = isOpen ? '−' : '+';
        icon.classList.toggle('open', isOpen);
    }
});

// --- INIT ---------------------------------------------------
async function init() {
    // Cargar API Key desde el entorno
    if (IS_ELECTRON) {
        GROQ_KEY = await eAPI.getGroqApiKey();
    }

    // Load tasks
    state.tasks = loadTasks();

    // Streak
    updateStreak();
    const streak = loadStreak();
    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = streak.count;

    // Sidebar date
    renderDate();

    // Colombia time
    await fetchColombiaHour();

    // Render
    render();

    // Show mandatory modal if no tasks yet today
    const modalTasks_ = loadModalTasks();
    if (state.tasks.length === 0) {
        modalTasks = modalTasks_;
        renderModalList();
        // Modal stays open
    } else {
        // Already have tasks - hide modal
        document.getElementById('task-modal')?.classList.add('hidden');
        modalTasks = state.tasks.map(t => ({ ...t }));
    }

    // Check if 5PM report needed
    if (colombiaHour !== null && colombiaHour >= REPORT_HOUR && !alreadyReportedToday() && state.tasks.length > 0) {
        openReportModal();
    }
}

init();
