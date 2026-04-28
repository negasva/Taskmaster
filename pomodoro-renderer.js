// Pomodoro popup window logic
// Runs in the floating always-on-top window

const FOCUS_MIN  = 30;
const BREAK_MIN  = 5;
const LONG_BREAK = 15;
const POMS_BEFORE_LONG = 4;
const RING_CIRC  = 553; // 2 * PI * 88

// State
let tasks        = [];
let taskIndex    = 0;
let seconds      = FOCUS_MIN * 60;
let totalSeconds = FOCUS_MIN * 60;
let running      = false;
let interval     = null;
let pomsThisTask = 0;
let pomsTotal    = 0;
let isBreak      = false;

// Elements
const modeEl    = document.getElementById('pom-mode');
const taskEl    = document.getElementById('pom-task-name');
const dotsEl    = document.getElementById('pom-dots');
const timerEl   = document.getElementById('pom-timer');
const ringFg    = document.getElementById('pom-ring-fg');
const toggleBtn = document.getElementById('pom-toggle');
const prevBtn   = document.getElementById('pom-prev');
const nextBtn   = document.getElementById('pom-next');
const closeBtn  = document.getElementById('pom-close');
const listEl    = document.getElementById('pom-list');

// Sound (Web Audio API, no files)
function playChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
            osc.start(t);
            osc.stop(t + 0.7);
        });
    } catch (_) {}
}

function playBreakChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
    } catch (_) {}
}

// Render
function renderMode() {
    if (isBreak) {
        const isLong = pomsTotal % POMS_BEFORE_LONG === 0 && pomsTotal > 0;
        modeEl.textContent = isLong ? 'Long break' : 'Short break';
        modeEl.classList.add('break-mode');
        ringFg.classList.remove('warning', 'danger');
        ringFg.classList.add('break-mode');
    } else {
        modeEl.textContent = 'Focus';
        modeEl.classList.remove('break-mode');
        ringFg.classList.remove('break-mode');
    }
}

function renderTask() {
    const t = tasks[taskIndex];
    taskEl.textContent = t ? t.text : 'All tasks complete';
}

function renderDots() {
    dotsEl.innerHTML = '';
    for (let i = 0; i < Math.min(pomsThisTask + 1, 8); i++) {
        const dot = document.createElement('div');
        dot.className = 'pom-dot' + (i < pomsThisTask ? (isBreak ? ' break' : ' done') : '');
        dotsEl.appendChild(dot);
    }
}

function renderTimer() {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    // Ring progress
    const pct = seconds / totalSeconds;
    ringFg.style.strokeDashoffset = RING_CIRC * (1 - pct);

    // Color warnings (focus mode only)
    if (!isBreak) {
        ringFg.classList.toggle('danger',  seconds <= 5 * 60 && seconds > 0);
        ringFg.classList.toggle('warning', seconds <= 10 * 60 && seconds > 5 * 60);
        if (seconds > 10 * 60) ringFg.classList.remove('warning', 'danger');
    }
}

function renderList() {
    listEl.innerHTML = '';
    tasks.forEach((t, i) => {
        const li = document.createElement('li');
        li.textContent = t.text;
        if (t.completed || i < taskIndex) li.classList.add('pom-done');
        else if (i === taskIndex)         li.classList.add('pom-current');
        listEl.appendChild(li);
    });
}

function renderAll() {
    renderMode();
    renderTask();
    renderDots();
    renderTimer();
    renderList();
}

// Timer control
function startFocus() {
    isBreak      = false;
    seconds      = FOCUS_MIN * 60;
    totalSeconds = FOCUS_MIN * 60;
    pomsThisTask = 0;
    renderAll();
}

function startBreak() {
    isBreak = true;
    const isLong = pomsTotal % POMS_BEFORE_LONG === 0 && pomsTotal > 0;
    const mins = isLong ? LONG_BREAK : BREAK_MIN;
    seconds      = mins * 60;
    totalSeconds = mins * 60;
    renderAll();
}

function tick() {
    seconds--;

    if (seconds <= 0) {
        clearInterval(interval);
        running = false;
        toggleBtn.textContent = 'Start';
        toggleBtn.classList.remove('paused');

        if (isBreak) {
            playBreakChime();
            // Break done, back to focus for next task
            goNextTask(false);
        } else {
            playChime();
            pomsTotal++;
            pomsThisTask++;
            // Notify main window
            window.electronAPI?.taskDone?.(tasks[taskIndex]?.id);
            startBreak();
        }
        return;
    }

    renderTimer();
}

function toggle() {
    if (running) {
        clearInterval(interval);
        running = false;
        toggleBtn.textContent = 'Resume';
        toggleBtn.classList.add('paused');
    } else {
        running = true;
        toggleBtn.textContent = 'Pause';
        toggleBtn.classList.add('paused');
        interval = setInterval(tick, 1000);
    }
}

function goNextTask(resetSeconds = true) {
    clearInterval(interval);
    running = false;
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('paused');

    // Mark current task done if we skipped past it
    if (tasks[taskIndex]) tasks[taskIndex].completed = true;

    taskIndex++;

    if (taskIndex >= tasks.length) {
        // All tasks done
        window.electronAPI?.sessionDone?.();
        return;
    }

    isBreak      = false;
    seconds      = FOCUS_MIN * 60;
    totalSeconds = FOCUS_MIN * 60;
    pomsThisTask = 0;
    renderAll();
}

function goPrevTask() {
    clearInterval(interval);
    running = false;
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('paused');

    taskIndex = Math.max(0, taskIndex - 1);
    isBreak   = false;
    seconds   = FOCUS_MIN * 60;
    totalSeconds = FOCUS_MIN * 60;
    pomsThisTask = 0;
    renderAll();
}

// Events
toggleBtn.addEventListener('click', toggle);
nextBtn.addEventListener('click', () => goNextTask(true));
prevBtn.addEventListener('click', goPrevTask);
closeBtn.addEventListener('click', () => {
    clearInterval(interval);
    window.electronAPI?.sessionDone?.();
});

// Receive tasks from main process (Electron)
window.electronAPI?.onInitTasks?.((t) => {
    tasks      = t;
    taskIndex  = 0;
    pomsTotal  = 0;
    startFocus();
});

window.electronAPI?.onUpdateTasks?.((t) => {
    tasks = t;
    renderList();
});

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
});

// Init (browser preview fallback)
if (!window.electronAPI) {
    tasks = [{ id: '1', text: 'Sample task', completed: false }];
    startFocus();
}
