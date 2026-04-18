/**
 * TEMPO — Time Tracker
 * Pure frontend SPA with localStorage persistence
 * Modular ES6+ structure
 */

'use strict';

/* =========================================
   STORAGE MODULE
   ========================================= */
const Storage = (() => {
  const KEYS = { projects: 'tempo_projects', entries: 'tempo_entries', templates: 'tempo_templates', settings: 'tempo_settings' };

  const get = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  };
  const set = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error('Storage error', e); } };

  return {
    getProjects: () => get(KEYS.projects) || [],
    setProjects: (v) => set(KEYS.projects, v),
    getEntries: () => get(KEYS.entries) || [],
    setEntries: (v) => set(KEYS.entries, v),
    getTemplates: () => get(KEYS.templates) || [],
    setTemplates: (v) => set(KEYS.templates, v),
    getSettings: () => get(KEYS.settings) || { weeklyLimit: 40, theme: 'light' },
    setSettings: (v) => set(KEYS.settings, v),
    exportAll: () => ({
      projects: get(KEYS.projects) || [],
      entries: get(KEYS.entries) || [],
      templates: get(KEYS.templates) || [],
      settings: get(KEYS.settings) || {},
      exportedAt: new Date().toISOString()
    }),
    importAll: (data) => {
      if (data.projects) set(KEYS.projects, data.projects);
      if (data.entries) set(KEYS.entries, data.entries);
      if (data.templates) set(KEYS.templates, data.templates);
      if (data.settings) set(KEYS.settings, data.settings);
    }
  };
})();

/* =========================================
   TIMER MODULE
   ========================================= */
const Timer = (() => {
  let interval = null;
  let startTime = null;
  let running = false;

  const format = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  return {
    start: () => { startTime = Date.now(); running = true; },
    stop: () => {
      const elapsed = running ? Math.floor((Date.now() - startTime) / 1000) : 0;
      running = false; startTime = null;
      return elapsed;
    },
    getElapsed: () => running ? Math.floor((Date.now() - startTime) / 1000) : 0,
    getStartTime: () => startTime,
    isRunning: () => running,
    format,
    startInterval: (cb) => { interval = setInterval(cb, 1000); },
    clearInterval: () => { if (interval) { clearInterval(interval); interval = null; } }
  };
})();

/* =========================================
   WEEKLY CALCULATION MODULE
   ========================================= */
const WeekCalc = (() => {
  // Get Monday of current week (local time)
  const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun,1=Mon,...
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  };

  const getWeekEnd = () => {
    const mon = getWeekStart();
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return sun;
  };

  const getToday = () => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  };

  const getTomorrow = () => {
    const d = getToday(); d.setDate(d.getDate()+1); return d;
  };

  return {
    getWeekStart,
    getWeekEnd,
    // Total completed seconds in current week
    weeklySeconds: (entries) => {
      const ws = getWeekStart().getTime();
      const we = getWeekEnd().getTime();
      return entries
        .filter(e => e.end && e.start >= ws && e.start <= we)
        .reduce((acc, e) => acc + (e.duration || 0), 0);
    },
    // Today's completed seconds
    todaySeconds: (entries) => {
      const ts = getToday().getTime();
      const te = getTomorrow().getTime();
      return entries
        .filter(e => e.end && e.start >= ts && e.start < te)
        .reduce((acc, e) => acc + (e.duration || 0), 0);
    },
    isInWeek: (timestamp) => {
      const t = new Date(timestamp).getTime();
      return t >= getWeekStart().getTime() && t <= getWeekEnd().getTime();
    },
    isToday: (timestamp) => {
      const t = new Date(timestamp).getTime();
      return t >= getToday().getTime() && t < getTomorrow().getTime();
    },
    formatDuration: (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    },
    formatDurationShort: (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  };
})();

/* =========================================
   UI RENDERING MODULE
   ========================================= */
const UI = (() => {
  const PROJECT_COLORS = ['#ff6b35','#4ecdc4','#52b788','#f4a261','#e63946','#6a4c93','#1982c4','#8ac926','#ff595e','#6d6875'];

  // Escape HTML
  const esc = (str) => String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // Format time from timestamp
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
    const entryDay = new Date(d); entryDay.setHours(0,0,0,0);
    if (entryDay.getTime() === today.getTime()) return 'Today';
    if (entryDay.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const getProjectColor = (projects, projectId) => {
    const p = projects.find(p => p.id === projectId);
    return p ? p.color : '#9c9a94';
  };

  const getProjectName = (projects, projectId) => {
    if (!projectId) return '';
    const p = projects.find(p => p.id === projectId);
    return p ? p.name : '(deleted)';
  };

  // Render a single entry row
  const renderEntryRow = (entry, projects, { onEdit, onDelete }) => {
    const color = getProjectColor(projects, entry.project);
    const pName = getProjectName(projects, entry.project);
    const dur = WeekCalc.formatDurationShort(entry.duration || 0);
    const startStr = formatTime(entry.start);
    const endStr = entry.end ? formatTime(entry.end) : '';
    const isRunning = !entry.end;

    const row = document.createElement('div');
    row.className = 'entry-row';
    row.dataset.id = entry.id;
    row.innerHTML = `
      <div class="entry-project-dot" style="background:${esc(color)}"></div>
      <div class="entry-info">
        <div class="entry-task">${esc(entry.task || 'Untitled')}</div>
        <div class="entry-meta">
          ${pName ? `<span class="entry-project-tag">${esc(pName)}</span>` : ''}
          ${entry.description ? `<span>${esc(entry.description)}</span>` : ''}
          <span>${startStr}${endStr ? ' → ' + endStr : ''}</span>
        </div>
      </div>
      <div class="entry-duration ${isRunning ? 'running' : ''}" id="dur-${entry.id}">
        ${isRunning ? '<span class="running-indicator"><span class="running-dot"></span> Running</span>' : dur}
      </div>
      <div class="entry-actions">
        <button class="btn-icon" data-action="edit" title="Edit"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10L10 2l2 2-8 8H2v-2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></button>
        <button class="btn-icon" data-action="delete" title="Delete" style="color:var(--red)"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.8 8h6.4l.8-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); onEdit(entry); });
    row.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); onDelete(entry.id); });
    return row;
  };

  // Group entries by day
  const groupByDay = (entries) => {
    const groups = {};
    [...entries].sort((a,b) => b.start - a.start).forEach(e => {
      const d = new Date(e.start); d.setHours(0,0,0,0);
      const key = d.getTime();
      if (!groups[key]) groups[key] = { date: d, entries: [] };
      groups[key].entries.push(e);
    });
    return Object.values(groups).sort((a,b) => b.date-a.date);
  };

  // Render grouped entries
  const renderGroupedEntries = (container, entries, projects, handlers) => {
    container.innerHTML = '';
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div>No entries yet</div></div>';
      return;
    }
    const groups = groupByDay(entries);
    groups.forEach(group => {
      const completed = group.entries.filter(e => e.end);
      const total = completed.reduce((a, e) => a + (e.duration || 0), 0);
      const el = document.createElement('div');
      el.className = 'entries-day-group';
      el.innerHTML = `<div class="day-header"><span class="day-label">${esc(formatDate(group.date.getTime()))}</span><span class="day-total">${WeekCalc.formatDuration(total)}</span></div>`;
      group.entries.forEach(e => {
        el.appendChild(renderEntryRow(e, projects, handlers));
      });
      container.appendChild(el);
    });
  };

  const populateProjectSelects = (projects) => {
    const selects = document.querySelectorAll('.project-select, #timerProject, #manualProject, #filterProject, #templateProject, #editEntryProject');
    selects.forEach(sel => {
      const val = sel.value;
      const isFilter = sel.id === 'filterProject';
      sel.innerHTML = isFilter ? '<option value="">All Projects</option>' : '<option value="">No Project</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      if (val) sel.value = val;
    });
  };

  const renderProjectList = (projects, onDelete) => {
    const list = document.getElementById('projectList');
    list.innerHTML = '';
    if (!projects.length) {
      list.innerHTML = '<li style="padding:6px 8px;font-size:0.8rem;color:var(--text-3)">No projects</li>';
      return;
    }
    projects.forEach(p => {
      const li = document.createElement('li');
      li.className = 'project-item';
      li.innerHTML = `
        <span class="project-dot" style="background:${esc(p.color)}"></span>
        <span class="project-item-name">${esc(p.name)}</span>
        <button class="project-delete" data-id="${esc(p.id)}" title="Delete">✕</button>
      `;
      li.querySelector('.project-delete').addEventListener('click', (e) => { e.stopPropagation(); onDelete(p.id); });
      list.appendChild(li);
    });
  };

  return { esc, formatTime, formatDate, renderEntryRow, renderGroupedEntries, groupByDay, populateProjectSelects, renderProjectList, getProjectColor, getProjectName, PROJECT_COLORS };
})();

/* =========================================
   CHARTS MODULE
   ========================================= */
const Charts = (() => {
  const renderBarChart = (container, entries) => {
    container.innerHTML = '';
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(d.getDate()+1);
      const secs = entries.filter(e => e.end && e.start >= d.getTime() && e.start < next.getTime()).reduce((a,e)=>a+(e.duration||0),0);
      const isToday = i === 0;
      days.push({ label: isToday ? 'Today' : d.toLocaleDateString([],{weekday:'short'}), secs, isToday });
    }
    const maxSecs = Math.max(...days.map(d=>d.secs), 1);
    days.forEach(day => {
      const pct = Math.round((day.secs / maxSecs) * 100);
      const h = WeekCalc.formatDuration(day.secs);
      const col = document.createElement('div');
      col.className = 'bar-col';
      col.innerHTML = `
        <div class="bar-bar ${day.isToday ? 'today' : ''}" style="height:${pct}%" data-tip="${h}"></div>
        <span class="bar-label">${UI.esc(day.label)}</span>
      `;
      container.appendChild(col);
    });
  };

  const renderPieChart = (canvas, legend, entries, projects) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Group by project
    const totals = {};
    entries.filter(e=>e.end).forEach(e => {
      const k = e.project || '__none__';
      totals[k] = (totals[k] || 0) + (e.duration || 0);
    });
    const totalAll = Object.values(totals).reduce((a,b)=>a+b, 0);
    legend.innerHTML = '';

    if (!totalAll) {
      ctx.fillStyle = 'var(--border)';
      ctx.beginPath(); ctx.arc(W/2, H/2, W/2-4, 0, Math.PI*2); ctx.fill();
      legend.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem">No data yet</div>';
      return;
    }

    const slices = Object.entries(totals).map(([k, secs]) => ({
      project: k, secs, pct: secs / totalAll,
      color: k === '__none__' ? '#ccc' : (projects.find(p=>p.id===k)?.color || '#ccc'),
      name: k === '__none__' ? 'No Project' : (projects.find(p=>p.id===k)?.name || 'Unknown')
    }));

    let angle = -Math.PI / 2;
    const cx = W/2, cy = H/2, r = W/2 - 6;
    slices.forEach(s => {
      const sweep = s.pct * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      angle += sweep;
    });

    // White center hole
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI*2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff';
    ctx.fill();

    slices.forEach(s => {
      const item = document.createElement('div');
      item.className = 'pie-legend-item';
      item.innerHTML = `<div class="pie-legend-dot" style="background:${UI.esc(s.color)}"></div><span>${UI.esc(s.name)}</span><span style="margin-left:auto;font-family:var(--font-mono);font-size:0.75rem;color:var(--text-3)">${WeekCalc.formatDuration(s.secs)}</span>`;
      legend.appendChild(item);
    });
  };

  return { renderBarChart, renderPieChart };
})();

/* =========================================
   APP STATE & MAIN CONTROLLER
   ========================================= */
const App = (() => {
  let state = {
    view: 'dashboard',
    entries: [],
    projects: [],
    templates: [],
    settings: {},
    filterProject: '',
    filterTask: '',
    filterStart: null,
    filterEnd: null,
    runningEntry: null, // { task, project, description, startTime }
  };

  const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ---- Load state from storage ----
  const loadState = () => {
    state.entries = Storage.getEntries();
    state.projects = Storage.getProjects();
    state.templates = Storage.getTemplates();
    state.settings = Storage.getSettings();
    // Check if timer was running (basic persistence via localStorage)
    const rt = localStorage.getItem('tempo_running_timer');
    if (rt) {
      try { state.runningEntry = JSON.parse(rt); } catch {}
    }
  };

  const saveEntries = () => Storage.setEntries(state.entries);
  const saveProjects = () => Storage.setProjects(state.projects);
  const saveTemplates = () => Storage.setTemplates(state.templates);

  // ---- Navigation ----
  const navigateTo = (view) => {
    state.view = view;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    renderCurrentView();
  };

  // ---- Weekly bar ----
  const updateWeeklyBar = () => {
    const limit = (state.settings.weeklyLimit || 40) * 3600;
    let secs = WeekCalc.weeklySeconds(state.entries);
    if (Timer.isRunning()) secs += Timer.getElapsed();

    const pct = Math.min((secs / limit) * 100, 100);
    const fill = document.getElementById('weeklyBarFill');
    const display = document.getElementById('weeklyHoursDisplay');
    const overtime = document.getElementById('weeklyOvertime');

    fill.style.width = pct + '%';
    fill.classList.remove('warn','full');
    if (pct >= 100) fill.classList.add('full');
    else if (pct >= 75) fill.classList.add('warn');

    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const limitH = state.settings.weeklyLimit || 40;
    display.textContent = `${h}h ${m}m / ${limitH}h`;

    if (secs > limit) {
      const over = secs - limit;
      const oh = Math.floor(over / 3600);
      const om = Math.floor((over % 3600) / 60);
      overtime.textContent = `+${oh}h ${om}m overtime`;
      overtime.style.display = '';
    } else {
      overtime.style.display = 'none';
    }
  };

  // ---- Timer ----
  const updateTimerDisplay = () => {
    const el = document.getElementById('timerDisplay');
    if (!el) return;
    const elapsed = Timer.getElapsed();
    el.textContent = Timer.format(elapsed);
    el.classList.toggle('running', Timer.isRunning());
    updateWeeklyBar();
    // Update running entry in today's list
    if (state.runningEntry) {
      const dur = document.getElementById(`dur-${state.runningEntry.id}`);
      if (dur) dur.innerHTML = `<span class="running-indicator"><span class="running-dot"></span>${Timer.format(elapsed)}</span>`;
    }
    // Update dashboard stats if visible
    if (state.view === 'dashboard') {
      const sw = document.getElementById('statWeek');
      if (sw) {
        let secs = WeekCalc.weeklySeconds(state.entries);
        if (Timer.isRunning()) secs += Timer.getElapsed();
        sw.textContent = WeekCalc.formatDuration(secs);
      }
      const st = document.getElementById('statToday');
      if (st) {
        let secs = WeekCalc.todaySeconds(state.entries);
        if (Timer.isRunning()) secs += Timer.getElapsed();
        st.textContent = WeekCalc.formatDuration(secs);
      }
    }
  };

  const startTimer = (task, project, description) => {
    if (Timer.isRunning()) return;
    Timer.start();
    state.runningEntry = { id: genId(), task: task || 'Untitled', project: project || '', description: description || '', startTime: Timer.getStartTime() };
    localStorage.setItem('tempo_running_timer', JSON.stringify(state.runningEntry));
    Timer.startInterval(updateTimerDisplay);

    // Add a "live" entry row to today
    const todayList = document.getElementById('todayEntriesList');
    if (todayList) {
      renderTodayEntries();
    }
    updateToggleButton(true);
    updateTimerDisplay();
  };

  const stopTimer = () => {
    if (!Timer.isRunning()) return;
    const elapsed = Timer.stop();
    Timer.clearInterval();

    if (state.runningEntry && elapsed > 1) {
      const entry = {
        id: state.runningEntry.id,
        task: state.runningEntry.task,
        project: state.runningEntry.project,
        description: state.runningEntry.description,
        start: state.runningEntry.startTime,
        end: Date.now(),
        duration: elapsed
      };
      state.entries.push(entry);
      saveEntries();
    }
    state.runningEntry = null;
    localStorage.removeItem('tempo_running_timer');
    updateToggleButton(false);
    updateTimerDisplay();
    renderCurrentView();
  };

  const updateToggleButton = (running) => {
    const btn = document.getElementById('timerToggle');
    const icon = document.getElementById('timerIcon');
    if (!btn) return;
    btn.classList.toggle('running', running);
    if (running) {
      icon.innerHTML = '<rect x="4" y="4" width="4" height="12" rx="1" fill="currentColor"/><rect x="12" y="4" width="4" height="12" rx="1" fill="currentColor"/>';
    } else {
      icon.innerHTML = '<polygon points="6,4 16,10 6,16" fill="currentColor"/>';
    }
  };

  // ---- Render views ----
  const renderCurrentView = () => {
    switch (state.view) {
      case 'dashboard': renderDashboard(); break;
      case 'tracker': renderTracker(); break;
      case 'history': renderHistory(); break;
      case 'recurring': renderTemplates(); break;
    }
  };

  const renderDashboard = () => {
    // Date
    const el = document.getElementById('dashboardDate');
    if (el) el.textContent = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let todaySecs = WeekCalc.todaySeconds(state.entries);
    let weekSecs = WeekCalc.weeklySeconds(state.entries);
    if (Timer.isRunning()) { todaySecs += Timer.getElapsed(); weekSecs += Timer.getElapsed(); }

    const st = document.getElementById('statToday'); if (st) st.textContent = WeekCalc.formatDuration(todaySecs);
    const sw = document.getElementById('statWeek'); if (sw) sw.textContent = WeekCalc.formatDuration(weekSecs);
    const sp = document.getElementById('statProjects'); if (sp) sp.textContent = state.projects.length;
    const se = document.getElementById('statEntries'); if (se) se.textContent = state.entries.filter(e=>e.end).length;

    const barChart = document.getElementById('weekBarChart');
    if (barChart) Charts.renderBarChart(barChart, state.entries);

    const pie = document.getElementById('projectPieChart');
    const legend = document.getElementById('pieLegend');
    if (pie && legend) {
      // Redraw with correct surface color
      setTimeout(() => Charts.renderPieChart(pie, legend, state.entries, state.projects), 50);
    }

    const recentList = document.getElementById('recentEntriesList');
    if (recentList) {
      const recent = [...state.entries].filter(e=>e.end).sort((a,b)=>b.start-a.start).slice(0, 5);
      if (!recent.length) {
        recentList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><div>Start tracking time to see your history here.</div></div>';
      } else {
        recentList.innerHTML = '';
        recent.forEach(e => recentList.appendChild(UI.renderEntryRow(e, state.projects, {
          onEdit: editEntry, onDelete: deleteEntry
        })));
      }
    }

    updateWeeklyBar();
  };

  const renderTracker = () => {
    updateToggleButton(Timer.isRunning());
    const display = document.getElementById('timerDisplay');
    if (display) {
      display.textContent = Timer.format(Timer.getElapsed());
      display.classList.toggle('running', Timer.isRunning());
    }
    if (Timer.isRunning() && state.runningEntry) {
      const taskEl = document.getElementById('timerTask');
      if (taskEl && !taskEl.value) taskEl.value = state.runningEntry.task;
    }
    renderTodayEntries();
    UI.populateProjectSelects(state.projects);
    updateWeeklyBar();
  };

  const renderTodayEntries = () => {
    const todayList = document.getElementById('todayEntriesList');
    if (!todayList) return;

    let todayEntries = state.entries.filter(e => WeekCalc.isToday(e.start)).sort((a,b)=>b.start-a.start);

    // Add running entry if exists
    if (state.runningEntry) {
      const fake = { ...state.runningEntry, start: state.runningEntry.startTime, end: null, duration: Timer.getElapsed() };
      todayEntries = [fake, ...todayEntries];
    }

    if (!todayEntries.length) {
      todayList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏱</div><div>No entries today. Start the timer!</div></div>';
      return;
    }
    todayList.innerHTML = '';
    todayEntries.forEach(e => todayList.appendChild(UI.renderEntryRow(e, state.projects, { onEdit: editEntry, onDelete: deleteEntry })));
  };

  const renderHistory = () => {
    UI.populateProjectSelects(state.projects);

    let filtered = [...state.entries].filter(e => e.end);

    if (state.filterProject) filtered = filtered.filter(e => e.project === state.filterProject);
    if (state.filterTask) filtered = filtered.filter(e => (e.task||'').toLowerCase().includes(state.filterTask.toLowerCase()));
    if (state.filterStart) filtered = filtered.filter(e => e.start >= state.filterStart);
    if (state.filterEnd) {
      const end = state.filterEnd + 86400000 - 1;
      filtered = filtered.filter(e => e.start <= end);
    }

    UI.renderGroupedEntries(document.getElementById('historyList'), filtered, state.projects, { onEdit: editEntry, onDelete: deleteEntry });
  };

  const renderTemplates = () => {
    const container = document.getElementById('templateList');
    if (!container) return;
    if (!state.templates.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔁</div><div>No templates yet. Save a recurring task.</div></div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'template-grid';
    state.templates.forEach(t => {
      const color = UI.getProjectColor(state.projects, t.project);
      const pName = UI.getProjectName(state.projects, t.project);
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-card-header">
          <span class="template-tag ${t.recurrence === 'weekly' ? 'weekly' : ''}">${UI.esc(t.recurrence || 'daily')}</span>
          <div class="template-card-actions">
            <button class="btn-icon" data-action="delete-template" data-id="${UI.esc(t.id)}" title="Delete"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.8 8h6.4l.8-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
        </div>
        <div class="template-name">${UI.esc(t.task)}</div>
        <div class="template-project">${pName ? `<span class="project-dot" style="background:${UI.esc(color)};width:8px;height:8px;border-radius:50%;display:inline-block"></span>${UI.esc(pName)}` : '<span style="color:var(--text-3)">No project</span>'}</div>
        ${t.description ? `<div style="font-size:0.78rem;color:var(--text-3);margin-top:6px">${UI.esc(t.description)}</div>` : ''}
        <div class="template-footer">
          <button class="btn btn-primary" style="flex:1;justify-content:center" data-action="start-template" data-id="${UI.esc(t.id)}">▶ Start Timer</button>
        </div>
      `;
      card.querySelector('[data-action="start-template"]').addEventListener('click', () => startFromTemplate(t));
      card.querySelector('[data-action="delete-template"]').addEventListener('click', () => deleteTemplate(t.id));
      grid.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(grid);
  };

  // ---- Entry CRUD ----
  const deleteEntry = (id) => {
    if (!confirm('Delete this entry?')) return;
    state.entries = state.entries.filter(e => e.id !== id);
    saveEntries();
    renderCurrentView();
    updateWeeklyBar();
  };

  const editEntry = (entry) => {
    const startDate = new Date(entry.start);
    const endDate = entry.end ? new Date(entry.end) : new Date();
    const localStart = new Date(startDate.getTime() - startDate.getTimezoneOffset()*60000).toISOString().slice(0,16);
    const localEnd = new Date(endDate.getTime() - endDate.getTimezoneOffset()*60000).toISOString().slice(0,16);

    const projectOptions = ['<option value="">No Project</option>', ...state.projects.map(p => `<option value="${UI.esc(p.id)}"${p.id === entry.project ? ' selected' : ''}>${UI.esc(p.name)}</option>`)].join('');

    openModal('Edit Entry', `
      <div class="form-group"><label>Task</label><input type="text" id="editEntryTask" class="form-input" value="${UI.esc(entry.task)}" /></div>
      <div class="form-group"><label>Project</label><select id="editEntryProject" class="form-input">${projectOptions}</select></div>
      <div class="form-group"><label>Description</label><input type="text" id="editEntryDesc" class="form-input" value="${UI.esc(entry.description||'')}" /></div>
      <div class="form-group"><label>Start</label><input type="datetime-local" id="editEntryStart" class="form-input" value="${localStart}" /></div>
      <div class="form-group"><label>End</label><input type="datetime-local" id="editEntryEnd" class="form-input" value="${localEnd}" /></div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
      { label: 'Save', cls: 'btn-primary', action: () => {
        const task = document.getElementById('editEntryTask')?.value.trim();
        const project = document.getElementById('editEntryProject')?.value;
        const description = document.getElementById('editEntryDesc')?.value.trim();
        const start = new Date(document.getElementById('editEntryStart')?.value).getTime();
        const end = new Date(document.getElementById('editEntryEnd')?.value).getTime();
        if (!task) return alert('Task name is required');
        if (!start || !end || end <= start) return alert('Invalid time range');
        const duration = Math.floor((end - start) / 1000);
        const idx = state.entries.findIndex(e => e.id === entry.id);
        if (idx > -1) {
          state.entries[idx] = { ...state.entries[idx], task, project, description, start, end, duration };
          saveEntries();
        }
        closeModal();
        renderCurrentView();
        updateWeeklyBar();
      }}
    ]);
  };

  // ---- Manual entry ----
  const addManualEntry = () => {
    const task = document.getElementById('manualTask')?.value.trim();
    const project = document.getElementById('manualProject')?.value;
    const description = document.getElementById('manualDescription')?.value.trim();
    const startVal = document.getElementById('manualStart')?.value;
    const endVal = document.getElementById('manualEnd')?.value;
    const durVal = document.getElementById('manualDuration')?.value;

    if (!task) return alert('Task name is required');

    let start, end, duration;

    if (startVal && endVal) {
      start = new Date(startVal).getTime();
      end = new Date(endVal).getTime();
      if (end <= start) return alert('End time must be after start time');
      duration = Math.floor((end - start) / 1000);
    } else if (startVal && durVal) {
      start = new Date(startVal).getTime();
      const [hh, mm] = durVal.split(':').map(Number);
      duration = (hh || 0) * 3600 + (mm || 0) * 60;
      end = start + duration * 1000;
    } else {
      return alert('Please enter start + end time, or start + duration');
    }

    if (duration <= 0) return alert('Duration must be positive');

    state.entries.push({ id: genId(), task, project, description, start, end, duration });
    saveEntries();

    // Reset form
    ['manualTask','manualDescription','manualStart','manualEnd','manualDuration'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('manualProject').value = '';

    renderCurrentView();
    updateWeeklyBar();
  };

  // ---- Projects ----
  const addProject = () => {
    const colors = UI.PROJECT_COLORS;
    let selectedColor = colors[state.projects.length % colors.length];

    openModal('New Project', `
      <div class="form-group"><label>Project Name</label><input type="text" id="newProjectName" class="form-input" placeholder="e.g. Website Redesign" /></div>
      <div class="form-group"><label>Color</label>
        <div class="color-swatches" id="colorSwatches">
          ${colors.map(c => `<div class="color-swatch${c === selectedColor ? ' selected' : ''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
      { label: 'Create', cls: 'btn-primary', action: () => {
        const name = document.getElementById('newProjectName')?.value.trim();
        if (!name) return alert('Name is required');
        state.projects.push({ id: genId(), name, color: selectedColor });
        saveProjects();
        UI.renderProjectList(state.projects, deleteProject);
        UI.populateProjectSelects(state.projects);
        closeModal();
        renderCurrentView();
      }}
    ]);

    // Color picker
    setTimeout(() => {
      document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          selectedColor = sw.dataset.color;
          document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s === sw));
        });
      });
      document.getElementById('newProjectName')?.focus();
    }, 50);
  };

  const deleteProject = (id) => {
    if (!confirm('Delete this project? Entries will keep their data but lose the project link.')) return;
    state.projects = state.projects.filter(p => p.id !== id);
    saveProjects();
    UI.renderProjectList(state.projects, deleteProject);
    UI.populateProjectSelects(state.projects);
    renderCurrentView();
  };

  // ---- Templates ----
  const addTemplate = () => {
    const projectOptions = ['<option value="">No Project</option>', ...state.projects.map(p => `<option value="${UI.esc(p.id)}">${UI.esc(p.name)}</option>`)].join('');
    openModal('New Template', `
      <div class="form-group"><label>Task Name *</label><input type="text" id="newTplTask" class="form-input" placeholder="e.g. Daily Standup" /></div>
      <div class="form-group"><label>Project</label><select id="newTplProject" class="form-input">${projectOptions}</select></div>
      <div class="form-group"><label>Description</label><input type="text" id="newTplDesc" class="form-input" placeholder="Optional" /></div>
      <div class="form-group"><label>Recurrence (label only)</label>
        <select id="newTplRecurrence" class="form-input">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
      { label: 'Save Template', cls: 'btn-primary', action: () => {
        const task = document.getElementById('newTplTask')?.value.trim();
        if (!task) return alert('Task name required');
        state.templates.push({
          id: genId(),
          task,
          project: document.getElementById('newTplProject')?.value || '',
          description: document.getElementById('newTplDesc')?.value.trim() || '',
          recurrence: document.getElementById('newTplRecurrence')?.value || 'daily'
        });
        saveTemplates();
        closeModal();
        renderTemplates();
      }}
    ]);
    setTimeout(() => document.getElementById('newTplTask')?.focus(), 50);
  };

  const deleteTemplate = (id) => {
    if (!confirm('Delete this template?')) return;
    state.templates = state.templates.filter(t => t.id !== id);
    saveTemplates();
    renderTemplates();
  };

  const startFromTemplate = (t) => {
    if (Timer.isRunning()) {
      if (!confirm('A timer is already running. Stop it and start this one?')) return;
      stopTimer();
    }
    navigateTo('tracker');
    setTimeout(() => {
      const taskEl = document.getElementById('timerTask');
      const projEl = document.getElementById('timerProject');
      const descEl = document.getElementById('timerDescription');
      if (taskEl) taskEl.value = t.task;
      if (projEl) projEl.value = t.project || '';
      if (descEl) descEl.value = t.description || '';
      startTimer(t.task, t.project, t.description);
    }, 100);
  };

  // ---- Modal ----
  const openModal = (title, bodyHtml, buttons) => {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    const footer = document.getElementById('modalFooter');
    footer.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = `btn ${b.cls}`;
      btn.textContent = b.label;
      btn.addEventListener('click', b.action);
      footer.appendChild(btn);
    });
    document.getElementById('modalOverlay').classList.add('open');
  };

  const closeModal = () => {
    document.getElementById('modalOverlay').classList.remove('open');
  };

  // ---- Export / Import ----
  const exportData = () => {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tempo-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm('This will overwrite all current data. Continue?')) return;
        Storage.importAll(data);
        loadState();
        UI.renderProjectList(state.projects, deleteProject);
        UI.populateProjectSelects(state.projects);
        renderCurrentView();
        updateWeeklyBar();
        alert('Data imported successfully!');
      } catch {
        alert('Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  // ---- Theme ----
  const setTheme = (theme) => {
    document.body.setAttribute('data-theme', theme);
    state.settings.theme = theme;
    Storage.setSettings(state.settings);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.querySelector('span').textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    // Redraw pie chart with new colors
    if (state.view === 'dashboard') {
      setTimeout(() => {
        const pie = document.getElementById('projectPieChart');
        const legend = document.getElementById('pieLegend');
        if (pie && legend) Charts.renderPieChart(pie, legend, state.entries, state.projects);
      }, 100);
    }
  };

  // ---- Keyboard shortcuts ----
  const setupShortcuts = () => {
    document.addEventListener('keydown', (e) => {
      // Space to start/stop timer (when not in input)
      if (e.code === 'Space' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        toggleTimer();
      }
    });
  };

  const toggleTimer = () => {
    if (Timer.isRunning()) {
      stopTimer();
    } else {
      const task = document.getElementById('timerTask')?.value.trim() || 'Untitled';
      const project = document.getElementById('timerProject')?.value || '';
      const desc = document.getElementById('timerDescription')?.value.trim() || '';
      startTimer(task, project, desc);
    }
  };

  // ---- Init ----
  const init = () => {
    loadState();

    // If timer was supposedly running, restore it (simple reconnect)
    if (state.runningEntry && !Timer.isRunning()) {
      // Can't truly restore elapsed time from a page refresh reliably without backend
      // So we just clear the stale state
      localStorage.removeItem('tempo_running_timer');
      state.runningEntry = null;
    }

    // Apply theme
    setTheme(state.settings.theme || 'light');

    // Render project list
    UI.renderProjectList(state.projects, deleteProject);
    UI.populateProjectSelects(state.projects);

    // Weekly bar
    updateWeeklyBar();

    // Navigate to initial view
    navigateTo('dashboard');

    // Event listeners
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    document.getElementById('sidebarToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('addProjectBtn').addEventListener('click', addProject);

    document.getElementById('timerToggle').addEventListener('click', () => {
      if (Timer.isRunning()) {
        stopTimer();
      } else {
        const task = document.getElementById('timerTask')?.value.trim() || 'Untitled';
        const project = document.getElementById('timerProject')?.value || '';
        const desc = document.getElementById('timerDescription')?.value.trim() || '';
        if (!task || task === 'Untitled') {
          const taskInput = document.getElementById('timerTask');
          if (taskInput) taskInput.focus();
        }
        startTimer(task, project, desc);
        navigateTo('tracker');
      }
    });

    document.getElementById('timerTask')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !Timer.isRunning()) {
        const task = e.target.value.trim() || 'Untitled';
        const project = document.getElementById('timerProject')?.value || '';
        const desc = document.getElementById('timerDescription')?.value.trim() || '';
        startTimer(task, project, desc);
      }
    });

    document.getElementById('addManualEntry')?.addEventListener('click', addManualEntry);

    // Filters
    document.getElementById('filterProject')?.addEventListener('change', e => { state.filterProject = e.target.value; renderHistory(); });
    document.getElementById('filterTask')?.addEventListener('input', e => { state.filterTask = e.target.value; renderHistory(); });
    document.getElementById('filterStart')?.addEventListener('change', e => {
      state.filterStart = e.target.value ? new Date(e.target.value).getTime() : null;
      renderHistory();
    });
    document.getElementById('filterEnd')?.addEventListener('change', e => {
      state.filterEnd = e.target.value ? new Date(e.target.value).getTime() : null;
      renderHistory();
    });
    document.getElementById('clearFilters')?.addEventListener('click', () => {
      state.filterProject = ''; state.filterTask = ''; state.filterStart = null; state.filterEnd = null;
      document.getElementById('filterProject').value = '';
      document.getElementById('filterTask').value = '';
      document.getElementById('filterStart').value = '';
      document.getElementById('filterEnd').value = '';
      renderHistory();
    });

    // Templates
    document.getElementById('addTemplateBtn')?.addEventListener('click', addTemplate);

    // Export/Import
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      setTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalOverlay')) closeModal();
    });

    // Keyboard shortcuts
    setupShortcuts();

    // Set default date for manual entry
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
    const manualStart = document.getElementById('manualStart');
    const manualEnd = document.getElementById('manualEnd');
    if (manualStart) manualStart.value = localNow;
    if (manualEnd) manualEnd.value = localNow;

    // If timer was already running (e.g. from template), restart interval
    if (Timer.isRunning()) {
      Timer.startInterval(updateTimerDisplay);
    }
  };

  return { init };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
