const STORAGE_KEY = "personal-dashboard-v1";
const WIDGET_DEFAULTS = {
  knowledge: ["knowledge-notes", "knowledge-goals", "knowledge-goal-chart"],
  physical: ["physical-habits", "physical-workouts", "physical-workout-chart"],
  financial: ["financial-budget", "financial-expenses", "financial-expense-chart"],
};

const defaultState = {
  knowledge: { notes: [], goals: [] },
  physical: { habits: [], workouts: [] },
  financial: { budget: 0, expenses: [] },
  layout: structuredClone(WIDGET_DEFAULTS),
};

let state = loadState();
let supabaseClient = null;
let currentUser = null;
let saveTimeout = null;
let draggingCard = null;
let draggingDomain = null;

const $ = (id) => document.getElementById(id);

function uuid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLayout(layout) {
  const normalized = {};

  Object.entries(WIDGET_DEFAULTS).forEach(([domain, defaults]) => {
    const existing = Array.isArray(layout?.[domain]) ? layout[domain] : [];
    const deduped = existing.filter((id, index) => defaults.includes(id) && existing.indexOf(id) === index);
    const missing = defaults.filter((id) => !deduped.includes(id));
    normalized[domain] = [...deduped, ...missing];
  });

  return normalized;
}

function normalizeState(raw) {
  return {
    knowledge: {
      notes: Array.isArray(raw?.knowledge?.notes) ? raw.knowledge.notes : [],
      goals: Array.isArray(raw?.knowledge?.goals) ? raw.knowledge.goals : [],
    },
    physical: {
      habits: Array.isArray(raw?.physical?.habits) ? raw.physical.habits : [],
      workouts: Array.isArray(raw?.physical?.workouts) ? raw.physical.workouts : [],
    },
    financial: {
      budget: Number(raw?.financial?.budget || 0),
      expenses: Array.isArray(raw?.financial?.expenses) ? raw.financial.expenses : [],
    },
    layout: normalizeLayout(raw?.layout),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRemoteSave();
}

function scheduleRemoteSave() {
  if (!supabaseClient || !currentUser) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveRemoteState, 550);
}

async function saveRemoteState() {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient
    .from("dashboard_states")
    .upsert({ user_id: currentUser.id, data: state }, { onConflict: "user_id" });

  if (error) {
    setAuthStatus(`Sync error: ${error.message}`);
    return;
  }
  setAuthStatus(`Synced for ${currentUser.email}`);
}

async function loadRemoteState() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from("dashboard_states")
    .select("data")
    .eq("user_id", currentUser.id)
    .single();

  if (error && error.code !== "PGRST116") {
    setAuthStatus(`Sync load error: ${error.message}`);
    return;
  }

  if (data?.data) {
    state = normalizeState(data.data);
    persistLocalState();
    renderAll();
  }
}

function setupNavigation() {
  const navButtons = document.querySelectorAll(".nav-link");
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const domain = button.dataset.domain;
      document.querySelectorAll(".domain-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === domain);
      });
      navButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    });
  });
}

function applyWidgetOrder(domain) {
  const panel = document.getElementById(domain);
  if (!panel) return;

  const order = state.layout[domain] || WIDGET_DEFAULTS[domain];
  order.forEach((widgetId) => {
    const card = panel.querySelector(`[data-widget-id="${widgetId}"]`);
    if (card) panel.appendChild(card);
  });
}

function applyAllWidgetOrders() {
  Object.keys(WIDGET_DEFAULTS).forEach(applyWidgetOrder);
}

function saveWidgetOrder(domain) {
  const panel = document.getElementById(domain);
  if (!panel) return;

  state.layout[domain] = [...panel.querySelectorAll(".widget-card")].map((card) => card.dataset.widgetId);
  persistLocalState();
}

function nearestCard(panel, x, y) {
  const cards = [...panel.querySelectorAll(".widget-card:not(.dragging)")];
  if (!cards.length) return { before: null };

  let closest = null;
  let distance = Infinity;

  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const d = Math.hypot(cx - x, cy - y);

    if (d < distance) {
      distance = d;
      closest = card;
    }
  });

  if (!closest) return { before: null };

  const rect = closest.getBoundingClientRect();
  const insertBefore = y < rect.top + rect.height / 2;
  return { before: insertBefore ? closest : closest.nextElementSibling, target: closest };
}

function setupDragAndDrop() {
  document.querySelectorAll(".widget-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (!event.target.closest(".drag-handle")) {
        event.preventDefault();
        return;
      }

      draggingCard = card;
      draggingDomain = card.closest(".domain-panel")?.id || null;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.widgetId);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggingCard = null;
      draggingDomain = null;
      document.querySelectorAll(".widget-card").forEach((el) => el.classList.remove("drop-target"));
    });
  });

  document.querySelectorAll(".domain-panel").forEach((panel) => {
    panel.addEventListener("dragover", (event) => {
      if (!draggingCard) return;
      if (panel.id !== draggingDomain) return;
      event.preventDefault();

      const location = nearestCard(panel, event.clientX, event.clientY);
      document.querySelectorAll(".widget-card").forEach((el) => el.classList.remove("drop-target"));
      if (location.target) location.target.classList.add("drop-target");

      if (location.before === null) {
        panel.appendChild(draggingCard);
      } else {
        panel.insertBefore(draggingCard, location.before);
      }
    });

    panel.addEventListener("drop", () => {
      if (!draggingCard) return;
      if (panel.id !== draggingDomain) return;
      saveWidgetOrder(panel.id);
    });
  });
}

function itemRow(title, subtitle, actions = []) {
  const li = document.createElement("li");
  li.className = "item-row";

  const textWrap = document.createElement("div");
  textWrap.className = "item-text";

  const line1 = document.createElement("span");
  line1.textContent = title;
  textWrap.appendChild(line1);

  if (subtitle) {
    const line2 = document.createElement("span");
    line2.className = "item-subtext";
    line2.textContent = subtitle;
    textWrap.appendChild(line2);
  }

  const actionWrap = document.createElement("div");
  actionWrap.className = "item-actions";
  actions.forEach((action) => actionWrap.appendChild(action));

  li.appendChild(textWrap);
  li.appendChild(actionWrap);
  return li;
}

function iconButton(label, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function drawBarChart({ canvasId, labels, values, barColor, unitPrefix = "", unitSuffix = "" }) {
  const canvas = $(canvasId);
  if (!canvas) return;

  const rectWidth = canvas.clientWidth || 300;
  const rectHeight = canvas.clientHeight || 180;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rectWidth * ratio);
  canvas.height = Math.floor(rectHeight * ratio);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rectWidth, rectHeight);

  const padding = { top: 18, right: 12, bottom: 28, left: 12 };
  const chartWidth = rectWidth - padding.left - padding.right;
  const chartHeight = rectHeight - padding.top - padding.bottom;

  const maxValue = Math.max(...values, 1);
  const barGap = 8;
  const barWidth = (chartWidth - barGap * (values.length - 1)) / values.length;

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#6d6d6d";

  values.forEach((value, index) => {
    const scaled = value / maxValue;
    const height = chartHeight * scaled;
    const x = padding.left + index * (barWidth + barGap);
    const y = padding.top + chartHeight - height;

    ctx.fillStyle = barColor;
    ctx.fillRect(x, y, Math.max(8, barWidth), height);

    ctx.fillStyle = "#5f5f5f";
    ctx.textAlign = "center";
    ctx.fillText(labels[index], x + barWidth / 2, rectHeight - 10);

    if (value > 0) {
      ctx.fillStyle = "#1f1f1f";
      ctx.fillText(`${unitPrefix}${value}${unitSuffix}`, x + barWidth / 2, y - 6);
    }
  });

  if (values.every((value) => value === 0)) {
    ctx.fillStyle = "#7a7a7a";
    ctx.textAlign = "center";
    ctx.fillText("No activity yet", rectWidth / 2, rectHeight / 2);
  }
}

function last7Days() {
  const days = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(start);
    day.setDate(start.getDate() - i);
    const iso = day.toISOString().slice(0, 10);
    const label = day.toLocaleDateString(undefined, { weekday: "short" });
    days.push({ iso, label });
  }

  return days;
}

function drawGoalsChart() {
  const done = state.knowledge.goals.filter((goal) => goal.done).length;
  const todo = Math.max(state.knowledge.goals.length - done, 0);
  drawBarChart({
    canvasId: "goalsChart",
    labels: ["Done", "Open"],
    values: [done, todo],
    barColor: "#0d5f52",
  });
}

function drawWorkoutChart() {
  const days = last7Days();
  const totals = Object.fromEntries(days.map((d) => [d.iso, 0]));

  state.physical.workouts.forEach((workout) => {
    const dateKey = new Date(workout.date).toISOString().slice(0, 10);
    if (totals[dateKey] !== undefined) totals[dateKey] += 1;
  });

  drawBarChart({
    canvasId: "workoutChart",
    labels: days.map((d) => d.label),
    values: days.map((d) => totals[d.iso]),
    barColor: "#2a7f70",
  });
}

function drawSpendChart() {
  const days = last7Days();
  const totals = Object.fromEntries(days.map((d) => [d.iso, 0]));

  state.financial.expenses.forEach((expense) => {
    if (totals[expense.date] !== undefined) totals[expense.date] += Number(expense.amount || 0);
  });

  drawBarChart({
    canvasId: "spendChart",
    labels: days.map((d) => d.label),
    values: days.map((d) => Number(totals[d.iso].toFixed(2))),
    barColor: "#3776a4",
    unitPrefix: "$",
  });
}

function renderKnowledge() {
  const notesList = $("notesList");
  notesList.innerHTML = "";
  state.knowledge.notes
    .slice()
    .reverse()
    .forEach((note) => {
      notesList.appendChild(
        itemRow(note.text, new Date(note.createdAt).toLocaleDateString(), [
          iconButton(
            "Delete",
            () => {
              state.knowledge.notes = state.knowledge.notes.filter((n) => n.id !== note.id);
              persistLocalState();
              renderKnowledge();
            },
            "delete"
          ),
        ])
      );
    });

  const goalsList = $("goalsList");
  goalsList.innerHTML = "";
  state.knowledge.goals.forEach((goal) => {
    goalsList.appendChild(
      itemRow(goal.text, goal.done ? "Completed" : "In progress", [
        iconButton(goal.done ? "Undo" : "Done", () => {
          goal.done = !goal.done;
          persistLocalState();
          renderKnowledge();
        }),
        iconButton(
          "Delete",
          () => {
            state.knowledge.goals = state.knowledge.goals.filter((g) => g.id !== goal.id);
            persistLocalState();
            renderKnowledge();
          },
          "delete"
        ),
      ])
    );
  });

  drawGoalsChart();
}

function renderPhysical() {
  const habitsList = $("habitsList");
  habitsList.innerHTML = "";
  const completedHabits = state.physical.habits.filter((habit) => habit.doneToday).length;
  $("habitProgress").textContent = `${completedHabits}/${state.physical.habits.length || 0} habits done today`;

  state.physical.habits.forEach((habit) => {
    habitsList.appendChild(
      itemRow(habit.text, habit.doneToday ? "Done today" : "Not done", [
        iconButton(habit.doneToday ? "Undo" : "Done", () => {
          habit.doneToday = !habit.doneToday;
          persistLocalState();
          renderPhysical();
        }),
        iconButton(
          "Delete",
          () => {
            state.physical.habits = state.physical.habits.filter((h) => h.id !== habit.id);
            persistLocalState();
            renderPhysical();
          },
          "delete"
        ),
      ])
    );
  });

  const workoutsList = $("workoutsList");
  workoutsList.innerHTML = "";
  state.physical.workouts
    .slice()
    .reverse()
    .forEach((workout) => {
      workoutsList.appendChild(
        itemRow(workout.title, `${new Date(workout.date).toLocaleDateString()} • ${workout.notes || "No notes"}`, [
          iconButton(
            "Delete",
            () => {
              state.physical.workouts = state.physical.workouts.filter((w) => w.id !== workout.id);
              persistLocalState();
              renderPhysical();
            },
            "delete"
          ),
        ])
      );
    });

  drawWorkoutChart();
}

function renderFinancial() {
  const expensesList = $("expensesList");
  expensesList.innerHTML = "";

  const monthlySpend = state.financial.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = Number(state.financial.budget || 0);
  $("budgetSummary").textContent = budget
    ? `$${monthlySpend.toFixed(2)} spent of $${budget.toFixed(2)}`
    : `$${monthlySpend.toFixed(2)} tracked this month`;
  $("budgetInput").value = budget || "";

  state.financial.expenses
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((expense) => {
      expensesList.appendChild(
        itemRow(`${expense.title}`, `${expense.date} • $${Number(expense.amount).toFixed(2)}`, [
          iconButton(
            "Delete",
            () => {
              state.financial.expenses = state.financial.expenses.filter((e) => e.id !== expense.id);
              persistLocalState();
              renderFinancial();
            },
            "delete"
          ),
        ])
      );
    });

  drawSpendChart();
}

function renderAll() {
  applyAllWidgetOrders();
  renderKnowledge();
  renderPhysical();
  renderFinancial();
}

function setupForms() {
  $("noteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("noteInput").value.trim();
    if (!text) return;
    state.knowledge.notes.push({ id: uuid(), text, createdAt: new Date().toISOString() });
    $("noteInput").value = "";
    persistLocalState();
    renderKnowledge();
  });

  $("goalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("goalInput").value.trim();
    if (!text) return;
    state.knowledge.goals.push({ id: uuid(), text, done: false });
    $("goalInput").value = "";
    persistLocalState();
    renderKnowledge();
  });

  $("habitForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("habitInput").value.trim();
    if (!text) return;
    state.physical.habits.push({ id: uuid(), text, doneToday: false });
    $("habitInput").value = "";
    persistLocalState();
    renderPhysical();
  });

  $("workoutForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("workoutTitleInput").value.trim();
    const notes = $("workoutNotesInput").value.trim();
    if (!title) return;
    state.physical.workouts.push({ id: uuid(), title, notes, date: new Date().toISOString() });
    $("workoutTitleInput").value = "";
    $("workoutNotesInput").value = "";
    persistLocalState();
    renderPhysical();
  });

  $("budgetForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = Number($("budgetInput").value);
    state.financial.budget = Number.isFinite(value) ? value : 0;
    persistLocalState();
    renderFinancial();
  });

  $("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("expenseTitleInput").value.trim();
    const amount = Number($("expenseAmountInput").value);
    const date = $("expenseDateInput").value || new Date().toISOString().slice(0, 10);
    if (!title || !Number.isFinite(amount)) return;

    state.financial.expenses.push({ id: uuid(), title, amount, date });
    $("expenseTitleInput").value = "";
    $("expenseAmountInput").value = "";
    $("expenseDateInput").value = new Date().toISOString().slice(0, 10);
    persistLocalState();
    renderFinancial();
  });
}

function setAuthStatus(message) {
  $("authStatus").textContent = message;
}

async function setupSupabase() {
  if (!window.DASHBOARD_CONFIG?.supabaseUrl || !window.DASHBOARD_CONFIG?.supabaseAnonKey) {
    return;
  }

  $("authCard").hidden = false;
  supabaseClient = window.supabase.createClient(
    window.DASHBOARD_CONFIG.supabaseUrl,
    window.DASHBOARD_CONFIG.supabaseAnonKey
  );

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("emailInput").value.trim();
    if (!email) return;

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
      },
    });

    setAuthStatus(error ? `Login failed: ${error.message}` : `Magic link sent to ${email}`);
  });

  $("logoutButton").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    currentUser = null;
    $("logoutButton").hidden = true;
    setAuthStatus("Signed out. Local mode active.");
  });

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    $("logoutButton").hidden = false;
    setAuthStatus(`Connected as ${currentUser.email}`);
    await loadRemoteState();
  } else {
    setAuthStatus("Connect Supabase to sync across devices.");
  }

  supabaseClient.auth.onAuthStateChange(async (_event, sessionUpdate) => {
    currentUser = sessionUpdate?.user || null;
    $("logoutButton").hidden = !currentUser;

    if (currentUser) {
      setAuthStatus(`Connected as ${currentUser.email}`);
      await loadRemoteState();
    } else {
      setAuthStatus("Signed out. Local mode active.");
    }
  });
}

function setTodayText() {
  const now = new Date();
  $("today").textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  $("expenseDateInput").value = now.toISOString().slice(0, 10);
}

function start() {
  setTodayText();
  setupNavigation();
  setupForms();
  setupDragAndDrop();
  renderAll();
  setupSupabase();

  window.addEventListener("resize", () => {
    drawGoalsChart();
    drawWorkoutChart();
    drawSpendChart();
  });
}

start();
