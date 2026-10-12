(() => {
  "use strict";

  const STORAGE_KEY = "exaltyard-timer:v1";
  const MAX_DURATION_SECONDS = 24 * 60 * 60;
  const DEFAULT_PROGRAM_RULE = Object.freeze({ decrementSeconds: 30, loopsPerStep: 2 });

  const DEFAULT_PROGRAM = Array.from({ length: 25 }, (_, index) => ({
    loop: index + 1,
    duration: 600 - Math.floor(index / 2) * 30,
  }));

  const els = {
    mainScreen: document.querySelector("#main-screen"),
    configScreen: document.querySelector("#config-screen"),
    raceBoard: document.querySelector("#race-board"),
    raceStatus: document.querySelector("#race-status"),
    loopLabel: document.querySelector("#loop-label"),
    loopCurrent: document.querySelector("#loop-current"),
    loopTotal: document.querySelector("#loop-total"),
    timer: document.querySelector("#timer"),
    timerCaption: document.querySelector("#timer-caption"),
    currentLimit: document.querySelector("#current-limit"),
    nextLimit: document.querySelector("#next-limit"),
    currentCumulative: document.querySelector("#current-cumulative"),
    completedSummary: document.querySelector("#completed-summary"),
    announcement: document.querySelector("#announcement"),
    start: document.querySelector("#start-button"),
    pause: document.querySelector("#pause-button"),
    resume: document.querySelector("#resume-button"),
    previous: document.querySelector("#previous-button"),
    next: document.querySelector("#next-button"),
    sound: document.querySelector("#sound-button"),
    timelineBody: document.querySelector("#timeline-body"),
    timelineNote: document.querySelector("#timeline-note"),
    configRaceNote: document.querySelector("#config-race-note"),
    programBody: document.querySelector("#program-body"),
    programRuleStatus: document.querySelector("#program-rule-status"),
    ruleDecrementInput: document.querySelector("#rule-decrement-input"),
    ruleLoopsInput: document.querySelector("#rule-loops-input"),
    ruleError: document.querySelector("#program-rule-error"),
    ruleSummary: document.querySelector("#program-rule-summary"),
    previewRule: document.querySelector("#preview-rule-button"),
    cancelRule: document.querySelector("#cancel-rule-button"),
    applyRule: document.querySelector("#apply-rule-button"),
    addLoop: document.querySelector("#add-loop-button"),
    removeLoop: document.querySelector("#remove-loop-button"),
    saveProgram: document.querySelector("#save-program-button"),
    configMessage: document.querySelector("#config-message"),
    editModal: document.querySelector("#edit-modal"),
    editLoopLabel: document.querySelector("#edit-loop-label"),
    durationInput: document.querySelector("#duration-input"),
    durationError: document.querySelector("#duration-error"),
    changePreview: document.querySelector("#change-preview"),
    previewOld: document.querySelector("#preview-old"),
    previewNew: document.querySelector("#preview-new"),
    previewDelta: document.querySelector("#preview-delta"),
    previewImpact: document.querySelector("#preview-impact"),
    applyChange: document.querySelector("#apply-change-button"),
    confirmModal: document.querySelector("#confirm-modal"),
    confirmTitle: document.querySelector("#confirm-title"),
    confirmText: document.querySelector("#confirm-text"),
    confirmButton: document.querySelector("#confirm-button"),
    toast: document.querySelector("#toast"),
  };

  function cloneDefaultProgram() {
    return DEFAULT_PROGRAM.map((entry) => ({ ...entry }));
  }

  function normaliseProgramRule(value) {
    const decrementSeconds = Number(value && value.decrementSeconds);
    const loopsPerStep = Number(value && value.loopsPerStep);
    if (!Number.isInteger(decrementSeconds) || decrementSeconds <= 0 || decrementSeconds > MAX_DURATION_SECONDS) return null;
    if (!Number.isSafeInteger(loopsPerStep) || loopsPerStep < 1) return null;
    return { decrementSeconds, loopsPerStep };
  }

  function durationFromRule(baseDuration, index, rule) {
    return baseDuration - Math.floor(index / rule.loopsPerStep) * rule.decrementSeconds;
  }

  function createProgramFromRule(baseDuration, length, rule) {
    const program = [];
    for (let index = 0; index < length; index += 1) {
      const duration = durationFromRule(baseDuration, index, rule);
      if (duration <= 0) return { invalidIndex: index };
      program.push({ loop: index + 1, duration });
    }
    return { program };
  }

  function programFollowsRule(program, rule) {
    if (!program.length) return false;
    return program.every((entry, index) => entry.duration === durationFromRule(program[0].duration, index, rule));
  }

  function normaliseProgram(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    const result = [];
    for (const entry of value) {
      const duration = Number(entry && entry.duration);
      if (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) return null;
      result.push({ loop: result.length + 1, duration });
    }
    return result;
  }

  function loadStoredState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const program = normaliseProgram(saved && saved.program);
      const selectedProgram = program || cloneDefaultProgram();
      const programRule = normaliseProgramRule(saved && saved.programRule) || { ...DEFAULT_PROGRAM_RULE };
      return {
        program: selectedProgram,
        programRule,
        ruleApplied: saved && saved.ruleApplied === false
          ? false
          : programFollowsRule(selectedProgram, programRule),
        soundEnabled: saved && typeof saved.soundEnabled === "boolean" ? saved.soundEnabled : true,
      };
    } catch {
      return {
        program: cloneDefaultProgram(),
        programRule: { ...DEFAULT_PROGRAM_RULE },
        ruleApplied: true,
        soundEnabled: true,
      };
    }
  }

  function makeRace() {
    return {
      phase: "idle", // idle | running | paused | finished
      currentIndex: 0,
      timeline: [],
      raceStartedAt: null,
      currentStartedAt: null,
      currentSegmentStartedAt: null,
      activeElapsedMs: 0,
      pausedAt: null,
      pausedDuringCurrentMs: 0,
      alertState: { loopIndex: null, previousSeconds: null },
      rafId: null,
      starting: false,
    };
  }

  const stored = loadStoredState();
  const state = {
    program: stored.program,
    programRule: stored.programRule,
    ruleApplied: stored.ruleApplied,
    rulePreview: null,
    soundEnabled: stored.soundEnabled,
    view: "main",
    race: makeRace(),
    editIndex: null,
    pendingChange: null,
    confirmation: null,
    toastTimeout: null,
  };

  const AudioEngine = {
    context: null,
    async unlock() {
      if (!state.soundEnabled) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.context) this.context = new AudioContextClass();
      if (this.context.state === "suspended") {
        try { await this.context.resume(); } catch { /* The visual timer remains fully usable. */ }
      }
    },
    tone(frequency, duration, offset = 0, volume = 0.13, type = "sine") {
      if (!state.soundEnabled || !this.context || this.context.state !== "running") return;
      const start = this.context.currentTime + offset;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    },
    sweep(fromFrequency, toFrequency, duration, offset = 0, volume = 0.13, type = "sawtooth") {
      if (!state.soundEnabled || !this.context || this.context.state !== "running") return;
      const start = this.context.currentTime + offset;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(fromFrequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    },
    start() {
      this.tone(392, 0.11, 0, 0.16, "square");
      this.tone(523, 0.13, 0.14, 0.18, "square");
      this.tone(784, 0.34, 0.3, 0.2, "sawtooth");
      this.sweep(640, 1260, 0.34, 0.3, 0.13, "triangle");
    },
    loopEnd() {
      this.tone(235, 0.12, 0, 0.19, "square");
      this.tone(470, 0.25, 0.11, 0.18, "sawtooth");
    },
    warning30() {
      this.tone(390, 0.1, 0, 0.16, "square");
      this.tone(520, 0.17, 0.13, 0.18, "square");
    },
    warning10() {
      this.tone(620, 0.12, 0, 0.18, "square");
      this.tone(760, 0.12, 0.17, 0.19, "square");
      this.tone(930, 0.18, 0.34, 0.2, "square");
    },
    countdown(seconds) {
      const isFinalSecond = seconds === 1;
      this.tone(isFinalSecond ? 1320 : 940, isFinalSecond ? 0.23 : 0.11, 0, isFinalSecond ? 0.22 : 0.18, "square");
      if (isFinalSecond) this.tone(660, 0.34, 0.05, 0.13, "sawtooth");
    },
    complete() {
      this.tone(523, 0.16, 0, 0.18, "triangle");
      this.tone(659, 0.16, 0.18, 0.18, "triangle");
      this.tone(784, 0.18, 0.36, 0.2, "triangle");
      this.tone(1047, 0.52, 0.57, 0.21, "sawtooth");
      this.tone(784, 0.52, 0.57, 0.1, "triangle");
    },
    test() {
      this.tone(392, 0.1, 0, 0.16, "square");
      this.tone(523, 0.12, 0.14, 0.18, "square");
      this.tone(784, 0.32, 0.29, 0.2, "sawtooth");
      this.sweep(640, 1260, 0.32, 0.29, 0.13, "triangle");
    },
  };

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        program: state.program,
        programRule: state.programRule,
        ruleApplied: state.ruleApplied,
        soundEnabled: state.soundEnabled,
      }));
      return true;
    } catch {
      announce("Le navigateur ne peut pas enregistrer les réglages localement.");
      return false;
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function formatDelta(seconds) {
    const sign = seconds >= 0 ? "+" : "−";
    return `${sign}${formatTime(Math.abs(seconds))}`;
  }

  function cumulativeDurationAt(index) {
    let total = 0;
    for (let i = 0; i <= index && i < state.program.length; i += 1) {
      total += state.program[i].duration;
    }
    return total;
  }

  function formatClock(timestamp) {
    if (!timestamp) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).format(new Date(timestamp));
  }

  function parseDuration(value) {
    const match = String(value).trim().match(/^(\d{1,4}):(\d{2})$/);
    if (!match) return { error: "Saisissez une durée au format MM:SS (ex. 09:30)." };
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const total = minutes * 60 + seconds;
    if (seconds > 59 || total <= 0 || total > MAX_DURATION_SECONDS) {
      return { error: "La durée doit être comprise entre 00:01 et 1440:00." };
    }
    return { value: total };
  }

  function programRuleSentence(rule) {
    const decrement = formatTime(rule.decrementSeconds);
    return rule.loopsPerStep === 1
      ? `Retirer ${decrement} à chaque boucle.`
      : `Retirer ${decrement} toutes les ${rule.loopsPerStep} boucles.`;
  }

  function programRulesAreEqual(first, second) {
    return first.decrementSeconds === second.decrementSeconds && first.loopsPerStep === second.loopsPerStep;
  }

  function readProgramRuleInputs() {
    const parsedDecrement = parseDuration(els.ruleDecrementInput.value);
    if (parsedDecrement.error) return { error: `Temps retiré : ${parsedDecrement.error}` };
    const rawLoops = String(els.ruleLoopsInput.value).trim();
    const loopsPerStep = Number(rawLoops);
    if (!/^\d+$/.test(rawLoops) || !Number.isSafeInteger(loopsPerStep) || loopsPerStep < 1) {
      return { error: "Le nombre de boucles par palier doit être un entier supérieur ou égal à 1." };
    }
    return { rule: { decrementSeconds: parsedDecrement.value, loopsPerStep } };
  }

  function resetProgramRuleEditor() {
    state.rulePreview = null;
    els.ruleDecrementInput.value = formatTime(state.programRule.decrementSeconds);
    els.ruleLoopsInput.value = String(state.programRule.loopsPerStep);
    els.ruleError.hidden = true;
  }

  function raceIsActive() {
    return state.race.phase === "running" || state.race.phase === "paused";
  }

  function currentDurationMs() {
    const entry = state.program[state.race.currentIndex];
    return entry ? entry.duration * 1000 : 0;
  }

  function currentRemainingMs() {
    const race = state.race;
    if (!raceIsActive()) return currentDurationMs();
    let elapsed = race.activeElapsedMs;
    if (race.phase === "running" && race.currentSegmentStartedAt !== null) {
      elapsed += Date.now() - race.currentSegmentStartedAt;
    }
    return Math.max(0, currentDurationMs() - elapsed);
  }

  function plannedCurrentEnd() {
    const race = state.race;
    if (race.currentStartedAt === null) return null;
    return race.currentStartedAt + currentDurationMs() + race.pausedDuringCurrentMs;
  }

  function rebuildFutureTimeline() {
    const race = state.race;
    if (!raceIsActive()) return;
    const index = race.currentIndex;
    const previous = race.timeline.slice(0, index);
    const currentEnd = plannedCurrentEnd();
    const current = { start: race.currentStartedAt, end: currentEnd };
    const nextTimeline = [...previous, current];
    let cursor = currentEnd;
    for (let i = index + 1; i < state.program.length; i += 1) {
      const end = cursor + state.program[i].duration * 1000;
      nextTimeline.push({ start: cursor, end });
      cursor = end;
    }
    race.timeline = nextTimeline;
  }

  function resetAlerts() {
    state.race.alertState = {
      loopIndex: state.race.currentIndex,
      previousSeconds: Math.ceil(state.program[state.race.currentIndex].duration) + 1,
    };
  }

  function beginLoop(index, startAt, phase = "running") {
    const race = state.race;
    race.currentIndex = index;
    race.currentStartedAt = startAt;
    race.activeElapsedMs = 0;
    race.pausedDuringCurrentMs = 0;
    race.pausedAt = phase === "paused" ? Date.now() : null;
    race.currentSegmentStartedAt = phase === "running" ? startAt : null;
    rebuildFutureTimeline();
    resetAlerts();
    if (phase === "running") AudioEngine.start();
  }

  function startTicker() {
    if (state.race.rafId !== null) return;
    state.race.rafId = requestAnimationFrame(tick);
  }

  function stopTicker() {
    if (state.race.rafId !== null) cancelAnimationFrame(state.race.rafId);
    state.race.rafId = null;
  }

  function processAlerts(remainingMs) {
    const alerts = state.race.alertState;
    const nowSeconds = Math.ceil(remainingMs / 1000);
    if (alerts.loopIndex !== state.race.currentIndex) resetAlerts();
    const previous = state.race.alertState.previousSeconds;
    if (previous > 30 && nowSeconds <= 30 && nowSeconds > 0) AudioEngine.warning30();
    if (previous > 10 && nowSeconds <= 10 && nowSeconds > 0) AudioEngine.warning10();
    if (nowSeconds >= 1 && nowSeconds <= 5 && previous !== nowSeconds) AudioEngine.countdown(nowSeconds);
    state.race.alertState.previousSeconds = nowSeconds;
  }

  function completeCurrentLoop() {
    const race = state.race;
    const completedIndex = race.currentIndex;
    AudioEngine.loopEnd();
    if (completedIndex >= state.program.length - 1) {
      race.phase = "finished";
      race.currentSegmentStartedAt = null;
      race.activeElapsedMs = currentDurationMs();
      race.pausedAt = null;
      stopTicker();
      AudioEngine.complete();
      announce(`Course terminée : ${state.program.length} boucles terminées.`);
      renderAll();
      return;
    }

    const nextStart = race.timeline[completedIndex].end;
    beginLoop(completedIndex + 1, nextStart, "running");
    announce(`Départ de la boucle ${completedIndex + 2}.`);
    renderAll();
  }

  function tick() {
    state.race.rafId = null;
    if (state.race.phase !== "running") return;

    let guard = 0;
    while (state.race.phase === "running" && currentRemainingMs() <= 0 && guard < state.program.length + 1) {
      completeCurrentLoop();
      guard += 1;
    }

    if (state.race.phase === "running") {
      processAlerts(currentRemainingMs());
      renderMain(false);
      startTicker();
    }
  }

  function announce(message) {
    els.announcement.textContent = message;
  }

  function showToast(message) {
    clearTimeout(state.toastTimeout);
    els.toast.textContent = message;
    els.toast.hidden = false;
    state.toastTimeout = window.setTimeout(() => { els.toast.hidden = true; }, 3300);
  }

  function setScreen(view) {
    state.view = view;
    els.mainScreen.hidden = view !== "main";
    els.configScreen.hidden = view !== "config";
    if (view === "config") {
      resetProgramRuleEditor();
      renderConfig();
    } else {
      state.rulePreview = null;
      renderMain(true);
    }
  }

  function renderLoopCounter(current, total, isFinished = false) {
    const currentText = String(current).padStart(2, "0");
    const totalText = String(total).padStart(2, "0");
    const label = isFinished ? `${total} boucles terminées sur ${total}` : `Boucle ${current} sur ${total}`;
    if (els.loopCurrent.textContent !== currentText) els.loopCurrent.textContent = currentText;
    if (els.loopTotal.textContent !== totalText) els.loopTotal.textContent = totalText;
    if (els.loopLabel.getAttribute("aria-label") !== label) els.loopLabel.setAttribute("aria-label", label);
  }

  function renderMain(shouldRenderTimeline = true) {
    const race = state.race;
    const isFinished = race.phase === "finished";
    const index = race.currentIndex;
    const currentProgram = state.program[index] || state.program[state.program.length - 1];
    const remaining = raceIsActive() ? currentRemainingMs() : currentProgram.duration * 1000;
    const remainingSeconds = Math.ceil(remaining / 1000);

    let boardClass = `state-${race.phase}`;
    if (race.phase === "running") {
      if (remainingSeconds <= 10) boardClass = "state-danger";
      else if (remainingSeconds <= 30) boardClass = "state-warning";
    }
    els.raceBoard.className = `race-board ${boardClass}`;

    const statusMap = {
      idle: ["PRÊT", "status-idle"],
      running: ["EN COURSE", "status-running"],
      paused: ["EN PAUSE", "status-paused"],
      finished: ["TERMINÉE", "status-finished"],
    };
    const [statusText, statusClass] = statusMap[race.phase];
    els.raceStatus.textContent = statusText;
    els.raceStatus.className = `status ${statusClass}`;

    if (isFinished) {
      renderLoopCounter(state.program.length, state.program.length, true);
      els.timer.textContent = "COURSE TERMINÉE";
      els.timerCaption.textContent = "CHRONOMÉTRAGE FINALISÉ";
      els.currentLimit.textContent = "—";
      els.nextLimit.textContent = "—";
      els.currentCumulative.textContent = formatTime(cumulativeDurationAt(state.program.length - 1));
      els.completedSummary.hidden = false;
      els.completedSummary.textContent = `${state.program.length} / ${state.program.length} BOUCLES TERMINÉES`;
    } else {
      renderLoopCounter(index + 1, state.program.length);
      els.timer.textContent = formatTime(remaining / 1000);
      els.timerCaption.textContent = race.phase === "paused" ? "TEMPS FIGÉ — COURSE EN PAUSE" : "TEMPS RESTANT";
      els.currentLimit.textContent = formatTime(currentProgram.duration);
      els.nextLimit.textContent = index < state.program.length - 1 ? formatTime(state.program[index + 1].duration) : "DERNIÈRE BOUCLE";
      els.currentCumulative.textContent = formatTime(cumulativeDurationAt(index));
      els.completedSummary.hidden = true;
    }

    const idle = race.phase === "idle";
    els.start.hidden = !idle;
    els.pause.hidden = race.phase !== "running";
    els.resume.hidden = race.phase !== "paused";
    els.start.disabled = race.starting;
    els.previous.disabled = (idle && index === 0) || isFinished;
    els.next.disabled = (idle && index >= state.program.length - 1) || isFinished;
    els.sound.textContent = state.soundEnabled ? "Son : activé" : "Son : désactivé";

    if (shouldRenderTimeline) renderTimeline();
  }

  function timelineStatus(index) {
    const race = state.race;
    if (race.phase === "finished" || index < race.currentIndex) return ["Terminée", "done"];
    if (index === race.currentIndex) return [race.phase === "paused" ? "En pause" : race.phase === "idle" ? "Sélectionnée" : "En cours", "current"];
    return ["À venir", "future"];
  }

  function renderTimeline() {
    const active = raceIsActive() || state.race.phase === "finished";
    els.timelineNote.textContent = active
      ? `Départ initial : ${formatClock(state.race.raceStartedAt)} · les pauses décalent les échéances futures.`
      : "Les horaires absolus apparaissent au départ.";
    els.timelineBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.program.forEach((entry, index) => {
      const row = document.createElement("tr");
      const schedule = state.race.timeline[index];
      const [stateText, stateClass] = timelineStatus(index);
      if (index === state.race.currentIndex && state.race.phase !== "finished") row.classList.add("row-current");
      if (index < state.race.currentIndex || state.race.phase === "finished") row.classList.add("row-finished");
      row.innerHTML = `<td>${entry.loop}</td><td>${schedule ? formatClock(schedule.start) : "—"}</td><td>${schedule ? formatClock(schedule.end) : "—"}</td><td><span class="timeline-state ${stateClass}">${stateText}</span></td>`;
      fragment.append(row);
    });
    els.timelineBody.append(fragment);
  }

  function renderProgramRuleEditor(active, finished) {
    const locked = active || finished;
    const preview = state.rulePreview;
    const parsedInputs = readProgramRuleInputs();
    const inputRule = parsedInputs.rule;

    els.ruleDecrementInput.disabled = locked;
    els.ruleLoopsInput.disabled = locked;
    els.previewRule.disabled = locked;
    els.cancelRule.hidden = !preview;
    els.applyRule.hidden = !preview;

    if (locked) {
      els.programRuleStatus.textContent = "RÈGLE VERROUILLÉE";
      els.programRuleStatus.className = "rule-status locked";
      els.ruleSummary.textContent = `La règle globale est disponible avant le départ, après un Reset. ${programRuleSentence(state.programRule)}`;
      return;
    }

    if (preview) {
      const plural = preview.changedCount === 1 ? "" : "s";
      const changedLabel = `${preview.changedCount} boucle${plural} modifiée${plural}`;
      els.programRuleStatus.textContent = "PRÉVISUALISATION";
      els.programRuleStatus.className = "rule-status preview";
      els.ruleSummary.textContent = `${programRuleSentence(preview.rule)} ${changedLabel} sur ${state.program.length}.`;
      return;
    }

    if (state.ruleApplied) {
      els.programRuleStatus.textContent = "RÈGLE ACTIVE";
      els.programRuleStatus.className = "rule-status";
    } else {
      els.programRuleStatus.textContent = "PROGRAMME PERSONNALISÉ";
      els.programRuleStatus.className = "rule-status custom";
    }

    if (!inputRule) {
      els.ruleSummary.textContent = "Renseignez un temps retiré et un nombre entier de boucles, puis lancez la prévisualisation.";
    } else if (!programRulesAreEqual(inputRule, state.programRule)) {
      els.ruleSummary.textContent = `Réglage à prévisualiser : ${programRuleSentence(inputRule)} La boucle 1 reste à ${formatTime(state.program[0].duration)}.`;
    } else if (state.ruleApplied) {
      els.ruleSummary.textContent = `Règle active : ${programRuleSentence(state.programRule)} La boucle 1 dure ${formatTime(state.program[0].duration)}.`;
    } else {
      els.ruleSummary.textContent = `Règle enregistrée : ${programRuleSentence(state.programRule)} Le programme contient des ajustements manuels.`;
    }
  }

  function renderConfig() {
    const race = state.race;
    const active = raceIsActive();
    const finished = race.phase === "finished";
    const statusText = active ? (race.phase === "paused" ? "COURSE EN PAUSE" : "COURSE EN COURS") : finished ? "COURSE TERMINÉE" : "PROGRAMME";
    const statusClass = active ? (race.phase === "paused" ? "status-paused" : "status-running") : finished ? "status-finished" : "status-idle";
    els.configRaceNote.textContent = statusText;
    els.configRaceNote.className = `status ${statusClass}`;
    els.configMessage.textContent = active
      ? "Les boucles terminées sont verrouillées. Une modification de la boucle actuelle demandera confirmation."
      : finished
        ? "La course est terminée. Utilisez Reset pour démarrer une nouvelle course avec ce programme."
        : "Les durées sont exprimées en minutes et secondes.";

    renderProgramRuleEditor(active, finished);

    els.programBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    const displayedProgram = state.rulePreview ? state.rulePreview.program : state.program;
    let cumulativeDuration = 0;
    displayedProgram.forEach((entry, index) => {
      cumulativeDuration += entry.duration;
      const row = document.createElement("tr");
      const locked = (active || finished) && (finished || index < race.currentIndex);
      const isPreviewChange = Boolean(state.rulePreview) && entry.duration !== state.program[index].duration;
      if (isPreviewChange) row.classList.add("row-rule-preview");
      const action = state.rulePreview
        ? `<span class="${isPreviewChange ? "preview-state" : "unavailable"}">${isPreviewChange ? "Nouvelle durée" : "Inchangée"}</span>`
        : locked
          ? '<span class="unavailable">Boucle terminée</span>'
          : `<button class="button" type="button" data-action="edit-loop" data-index="${index}">Modifier</button>`;
      row.innerHTML = `<td>${entry.loop}</td><td>${formatTime(entry.duration)}</td><td>${formatTime(cumulativeDuration)}</td><td>${action}</td>`;
      fragment.append(row);
    });
    els.programBody.append(fragment);
    const lastIndex = state.program.length - 1;
    const previewActive = Boolean(state.rulePreview);
    els.addLoop.disabled = previewActive;
    els.removeLoop.disabled = previewActive || state.program.length <= 1 || ((active || finished) && lastIndex <= race.currentIndex);
    els.saveProgram.disabled = previewActive;
  }

  function renderAll() {
    renderMain(true);
    if (state.view === "config") renderConfig();
  }

  async function startRace() {
    const race = state.race;
    if (race.phase !== "idle" || race.starting) return;
    race.starting = true;
    renderMain(false);
    await AudioEngine.unlock();
    if (race.phase !== "idle") return;
    const now = Date.now();
    race.phase = "running";
    race.starting = false;
    race.raceStartedAt = now;
    race.timeline = [];
    beginLoop(0, now, "running");
    announce("Course démarrée. Boucle 1 en cours.");
    renderAll();
    startTicker();
  }

  function pauseRace() {
    const race = state.race;
    if (race.phase !== "running") return;
    race.activeElapsedMs += Date.now() - race.currentSegmentStartedAt;
    race.currentSegmentStartedAt = null;
    race.pausedAt = Date.now();
    race.phase = "paused";
    stopTicker();
    announce("Course en pause. Le temps restant est figé.");
    renderAll();
  }

  async function resumeRace() {
    const race = state.race;
    if (race.phase !== "paused") return;
    await AudioEngine.unlock();
    const now = Date.now();
    race.pausedDuringCurrentMs += now - race.pausedAt;
    race.pausedAt = null;
    race.currentSegmentStartedAt = now;
    race.phase = "running";
    rebuildFutureTimeline();
    resetAlerts();
    announce("Course reprise. Les échéances futures ont été décalées de la durée de la pause.");
    renderAll();
    startTicker();
  }

  function moveToNext() {
    const race = state.race;
    if (race.phase === "finished") return;
    if (race.phase === "idle") {
      if (race.currentIndex < state.program.length - 1) race.currentIndex += 1;
      renderAll();
      return;
    }
    if (race.currentIndex >= state.program.length - 1) {
      showToast("Vous êtes déjà sur la dernière boucle.");
      return;
    }
    const now = Date.now();
    race.timeline[race.currentIndex].end = now;
    const nextPhase = race.phase;
    beginLoop(race.currentIndex + 1, now, nextPhase);
    announce(`Passage manuel à la boucle ${race.currentIndex + 1}.`);
    renderAll();
    if (nextPhase === "running") startTicker();
  }

  function moveToPrevious() {
    const race = state.race;
    if (race.phase === "finished") return;
    if (race.currentIndex === 0) return;
    if (race.phase === "idle") {
      race.currentIndex -= 1;
      renderAll();
      return;
    }
    const now = Date.now();
    const nextPhase = race.phase;
    race.timeline = race.timeline.slice(0, race.currentIndex - 1 < 0 ? 0 : race.currentIndex - 1);
    beginLoop(race.currentIndex - 1, now, nextPhase);
    announce(`Retour confirmé à la boucle ${race.currentIndex + 1}. La timeline a été recalculée à partir de cette boucle.`);
    renderAll();
    if (nextPhase === "running") startTicker();
  }

  function resetRace() {
    stopTicker();
    state.race = makeRace();
    closeEdit();
    announce("Course réinitialisée. Le programme est prêt.");
    renderAll();
    showToast("Course réinitialisée.");
  }

  function previewProgramRule() {
    if (raceIsActive() || state.race.phase === "finished") {
      showToast("La règle globale est disponible avant le départ, après un Reset.");
      return;
    }
    const parsed = readProgramRuleInputs();
    if (parsed.error) {
      els.ruleError.textContent = parsed.error;
      els.ruleError.hidden = false;
      state.rulePreview = null;
      renderConfig();
      return;
    }
    const generated = createProgramFromRule(state.program[0].duration, state.program.length, parsed.rule);
    if (!generated.program) {
      els.ruleError.textContent = `Cette règle rendrait la durée de la boucle ${generated.invalidIndex + 1} nulle ou négative. Réduisez le temps retiré ou augmentez le nombre de boucles par palier.`;
      els.ruleError.hidden = false;
      state.rulePreview = null;
      renderConfig();
      return;
    }
    const changedCount = generated.program.reduce((total, entry, index) => (
      total + (entry.duration === state.program[index].duration ? 0 : 1)
    ), 0);
    state.rulePreview = { rule: parsed.rule, program: generated.program, changedCount };
    els.ruleError.hidden = true;
    renderConfig();
  }

  function cancelProgramRulePreview() {
    resetProgramRuleEditor();
    renderConfig();
  }

  function applyProgramRule() {
    const preview = state.rulePreview;
    if (!preview) return;
    state.program = preview.program.map((entry) => ({ ...entry }));
    state.programRule = { ...preview.rule };
    state.ruleApplied = true;
    state.rulePreview = null;
    persist();
    resetProgramRuleEditor();
    renderAll();
    showToast(`Règle appliquée : ${programRuleSentence(state.programRule)}`);
  }

  function requestProgramRuleApplication() {
    if (!state.rulePreview) return;
    if (!state.ruleApplied) {
      askConfirmation(
        "Remplacer les ajustements manuels ?",
        "L’application de cette règle va régénérer toutes les durées depuis la boucle 1 et remplacer les modifications manuelles actuelles.",
        "Appliquer la règle",
        applyProgramRule,
        "primary"
      );
      return;
    }
    applyProgramRule();
  }

  function addLoop() {
    const last = state.program[state.program.length - 1];
    const index = state.program.length;
    const duration = state.ruleApplied
      ? durationFromRule(state.program[0].duration, index, state.programRule)
      : last.duration;
    if (duration <= 0) {
      showToast("Impossible d’ajouter cette boucle : la règle active produirait une durée nulle ou négative.");
      return;
    }
    state.program.push({ loop: index + 1, duration });
    if (raceIsActive()) rebuildFutureTimeline();
    persist();
    renderAll();
    showToast(`Boucle ${state.program.length} ajoutée avec une durée de ${formatTime(duration)}.`);
  }

  function removeLastLoop() {
    const lastIndex = state.program.length - 1;
    if (state.program.length <= 1) {
      showToast("Le programme doit contenir au moins une boucle.");
      return;
    }
    if ((raceIsActive() || state.race.phase === "finished") && lastIndex <= state.race.currentIndex) {
      showToast("La dernière boucle est déjà en cours ou terminée : elle ne peut pas être supprimée.");
      return;
    }
    state.program.pop();
    if (raceIsActive()) rebuildFutureTimeline();
    persist();
    renderAll();
    showToast("Dernière boucle supprimée.");
  }

  function openEdit(index) {
    const race = state.race;
    if (!Number.isInteger(index) || !state.program[index]) return;
    if ((raceIsActive() || race.phase === "finished") && (race.phase === "finished" || index < race.currentIndex)) {
      showToast("Une boucle terminée ne peut pas être modifiée.");
      return;
    }
    if (raceIsActive() && index === race.currentIndex) {
      askConfirmation(
        "Modifier la boucle actuelle ?",
        "Cette action conserve le temps déjà écoulé et peut provoquer un passage immédiat à la boucle suivante si la nouvelle limite est dépassée.",
        "Continuer",
        () => showEdit(index),
        "primary"
      );
      return;
    }
    showEdit(index);
  }

  function showEdit(index) {
    state.editIndex = index;
    state.pendingChange = null;
    const entry = state.program[index];
    els.editLoopLabel.textContent = `Boucle ${entry.loop} — durée actuelle : ${formatTime(entry.duration)}.`;
    els.durationInput.value = formatTime(entry.duration);
    els.durationError.hidden = true;
    els.changePreview.hidden = true;
    els.applyChange.hidden = true;
    els.editModal.hidden = false;
    window.setTimeout(() => els.durationInput.focus(), 0);
  }

  function closeEdit() {
    state.editIndex = null;
    state.pendingChange = null;
    els.editModal.hidden = true;
  }

  function previewChange() {
    const index = state.editIndex;
    if (index === null) return;
    const parsed = parseDuration(els.durationInput.value);
    if (parsed.error) {
      els.durationError.textContent = parsed.error;
      els.durationError.hidden = false;
      els.changePreview.hidden = true;
      els.applyChange.hidden = true;
      return;
    }
    const oldDuration = state.program[index].duration;
    const delta = parsed.value - oldDuration;
    const invalid = state.program.slice(index).some((entry) => entry.duration + delta <= 0);
    if (invalid) {
      els.durationError.textContent = "Cette modification rendrait au moins une durée suivante nulle ou négative.";
      els.durationError.hidden = false;
      els.changePreview.hidden = true;
      els.applyChange.hidden = true;
      return;
    }
    state.pendingChange = { index, duration: parsed.value, delta };
    els.durationError.hidden = true;
    els.previewOld.textContent = formatTime(oldDuration);
    els.previewNew.textContent = formatTime(parsed.value);
    els.previewDelta.textContent = formatDelta(delta);
    els.previewImpact.textContent = `${state.program.length - index} boucle${state.program.length - index > 1 ? "s" : ""}`;
    els.changePreview.hidden = false;
    els.applyChange.hidden = false;
  }

  function applyChange() {
    const pending = state.pendingChange;
    if (!pending) return;
    const { index, delta } = pending;
    state.program = state.program.map((entry, entryIndex) => ({
      loop: entryIndex + 1,
      duration: entryIndex >= index ? entry.duration + delta : entry.duration,
    }));
    state.ruleApplied = programFollowsRule(state.program, state.programRule);
    persist();
    closeEdit();
    if (raceIsActive()) {
      rebuildFutureTimeline();
      if (state.race.phase === "running") {
        let guard = 0;
        while (state.race.phase === "running" && currentRemainingMs() <= 0 && guard < state.program.length + 1) {
          completeCurrentLoop();
          guard += 1;
        }
      }
    }
    renderAll();
    showToast(`Durée modifiée : le décalage ${formatDelta(delta)} a été appliqué à partir de la boucle ${index + 1}.`);
  }

  function askConfirmation(title, text, buttonLabel, callback, kind = "danger") {
    state.confirmation = callback;
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmButton.textContent = buttonLabel;
    els.confirmButton.className = `button ${kind === "primary" ? "button-primary" : "button-danger"}`;
    els.confirmModal.hidden = false;
    window.setTimeout(() => els.confirmButton.focus(), 0);
  }

  function closeConfirmation() {
    state.confirmation = null;
    els.confirmModal.hidden = true;
  }

  async function testSound() {
    if (!state.soundEnabled) {
      showToast("Le son est désactivé. Activez-le pour effectuer un test.");
      return;
    }
    await AudioEngine.unlock();
    AudioEngine.test();
    showToast("Signal sonore de test envoyé.");
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    persist();
    renderMain(false);
    showToast(state.soundEnabled ? "Son activé. Testez-le avant le départ." : "Son désactivé.");
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exitFullscreen) throw new Error("Fullscreen API unavailable");
        await exitFullscreen.call(document);
      } else {
        const requestFullscreen = els.raceBoard.requestFullscreen || els.raceBoard.webkitRequestFullscreen;
        if (!requestFullscreen) throw new Error("Fullscreen API unavailable");
        await requestFullscreen.call(els.raceBoard);
      }
    } catch {
      showToast("Le mode plein écran n’est pas disponible dans ce navigateur.");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    switch (action) {
      case "start": startRace(); break;
      case "pause": pauseRace(); break;
      case "resume": resumeRace(); break;
      case "next": moveToNext(); break;
      case "previous":
        if (raceIsActive() && state.race.currentIndex > 0) {
          askConfirmation("Revenir à la boucle précédente ?", "La boucle précédente redeviendra la boucle active et la timeline sera recalculée à partir d’elle.", "Revenir", moveToPrevious);
        } else moveToPrevious();
        break;
      case "reset": askConfirmation("Réinitialiser la course ?", "Le chronométrage en cours sera arrêté. Le programme enregistré sera conservé.", "Réinitialiser", resetRace); break;
      case "config": setScreen("config"); break;
      case "back-main": setScreen("main"); break;
      case "fullscreen": toggleFullscreen(); break;
      case "test-sound": testSound(); break;
      case "toggle-sound": toggleSound(); break;
      case "preview-rule": previewProgramRule(); break;
      case "cancel-rule": cancelProgramRulePreview(); break;
      case "apply-rule": requestProgramRuleApplication(); break;
      case "add-loop": addLoop(); break;
      case "remove-loop": removeLastLoop(); break;
      case "save-program":
        if (persist()) showToast("Programme enregistré dans ce navigateur.");
        break;
      case "edit-loop": openEdit(Number(button.dataset.index)); break;
      case "cancel-edit": closeEdit(); break;
      case "preview-change": previewChange(); break;
      case "apply-change": applyChange(); break;
      case "cancel-confirm": closeConfirmation(); break;
      case "confirm": {
        const callback = state.confirmation;
        closeConfirmation();
        if (callback) callback();
        break;
      }
      default: break;
    }
  });

  els.durationInput.addEventListener("input", () => {
    state.pendingChange = null;
    els.changePreview.hidden = true;
    els.applyChange.hidden = true;
    els.durationError.hidden = true;
  });

  els.durationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") previewChange();
  });

  [els.ruleDecrementInput, els.ruleLoopsInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.rulePreview = null;
      els.ruleError.hidden = true;
      renderConfig();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") previewProgramRule();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.editModal.hidden) closeEdit();
      else if (!els.confirmModal.hidden) closeConfirmation();
      else if (document.fullscreenElement === els.raceBoard || document.webkitFullscreenElement === els.raceBoard) toggleFullscreen();
      return;
    }
    if (!els.editModal.hidden || !els.confirmModal.hidden || event.target.matches("input, textarea, select")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (state.race.phase === "idle") startRace();
      else if (state.race.phase === "running") pauseRace();
      else if (state.race.phase === "paused") resumeRace();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (raceIsActive() && state.race.currentIndex > 0) {
        askConfirmation("Revenir à la boucle précédente ?", "La boucle précédente redeviendra la boucle active et la timeline sera recalculée à partir d’elle.", "Revenir", moveToPrevious);
      } else moveToPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveToNext();
    } else if (event.key.toLowerCase() === "f") {
      toggleFullscreen();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.race.phase === "running") {
      renderMain(false);
      startTicker();
    }
  });

  function renderFullscreenControl() {
    const raceBoardIsFullscreen = document.fullscreenElement === els.raceBoard || document.webkitFullscreenElement === els.raceBoard;
    document.querySelectorAll("[data-action='fullscreen']").forEach((button) => {
      button.textContent = raceBoardIsFullscreen ? "⛶ Quitter le plein écran" : "⛶ Plein écran";
      button.setAttribute("aria-label", raceBoardIsFullscreen ? "Quitter le plein écran" : "Activer le plein écran");
    });
  }

  document.addEventListener("fullscreenchange", renderFullscreenControl);
  document.addEventListener("webkitfullscreenchange", renderFullscreenControl);

  renderAll();
})();
