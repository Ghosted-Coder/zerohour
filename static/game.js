(function () {
  "use strict";
  const state = {
    sessionId: null, currentWave: 1, totalWaves: 1, cards: [], selectedCardIndex: null,
    score: 0, combo: 0, maxCombo: 0, inboxRemaining: 5000, isCalmMode: false,
    cardDisplayedAt: null, pendingAction: null, lastDecisionId: null
  };

  const DOM = {
    hudInbox: document.getElementById("hud-inbox-remaining"),
    hudScore: document.getElementById("hud-score"),
    hudCombo: document.getElementById("hud-combo"),
    hudWave: document.getElementById("hud-wave-display"),
    btnAudio: document.getElementById("btn-audio-toggle"),
    audioIcon: document.getElementById("audio-icon"),
    btnCalm: document.getElementById("btn-calm-toggle"),
    calmStatus: document.getElementById("calm-status"),
    viewIntro: document.getElementById("view-intro"),
    viewMap: document.getElementById("view-map"),
    viewDebrief: document.getElementById("view-debrief"),
    introText: document.getElementById("intro-terminal-text"),
    introControls: document.getElementById("intro-controls"),
    btnSkipIntro: document.getElementById("btn-skip-intro"),
    btnLaunchDemo: document.getElementById("btn-launch-demo"),
    fileUploadInput: document.getElementById("file-upload-input"),
    canvas: document.getElementById("tactical-canvas"),
    intelPanel: document.getElementById("target-intel-panel"),
    btnCloseIntel: document.getElementById("btn-close-intel"),
    intelCategory: document.getElementById("intel-category-badge"),
    intelSenderName: document.getElementById("intel-sender-name"),
    intelSenderAddr: document.getElementById("intel-sender-address"),
    intelPayloadCount: document.getElementById("intel-payload-count"),
    intelUnreadRatio: document.getElementById("intel-unread-ratio"),
    intelDateRange: document.getElementById("intel-date-range"),
    intelBossStatus: document.getElementById("intel-boss-status"),
    intelSubjectsList: document.getElementById("intel-sample-subjects"),
    intelAiSource: document.getElementById("intel-ai-source"),
    intelAiConfidence: document.getElementById("intel-ai-confidence"),
    intelAiReason: document.getElementById("intel-ai-reason"),
    cmdArchive: document.getElementById("cmd-archive"),
    cmdTrash: document.getElementById("cmd-trash"),
    cmdKeep: document.getElementById("cmd-keep"),
    cmdUnsub: document.getElementById("cmd-unsub"),
    cmdUndo: document.getElementById("cmd-undo"),
    cmdEndMission: document.getElementById("cmd-end-mission"),
    bossModal: document.getElementById("boss-alert-modal"),
    bossModalDesc: document.getElementById("boss-modal-desc"),
    btnEngageBoss: document.getElementById("btn-engage-boss"),
    confirmModal: document.getElementById("confirm-modal"),
    btnCancelConfirm: document.getElementById("btn-cancel-confirm"),
    btnExecuteConfirm: document.getElementById("btn-execute-confirm"),
    dbAnalyzed: document.getElementById("db-analyzed"),
    dbCleared: document.getElementById("db-cleared"),
    dbKept: document.getElementById("db-kept"),
    dbTimeSaved: document.getElementById("db-time-saved"),
    dbReconFormula: document.getElementById("db-recon-formula"),
    downloadFilters: document.getElementById("download-filters"),
    downloadCleaned: document.getElementById("download-cleaned"),
    downloadUnsub: document.getElementById("download-unsub"),
    formLeaderboard: document.getElementById("form-leaderboard"),
    lbNickname: document.getElementById("lb-nickname"),
    lbDisplay: document.getElementById("lb-leaderboard-list"),
    btnRedeploy: document.getElementById("btn-redeploy")
  };

  const canvasCtx = DOM.canvas.getContext("2d");
  let radarAngle = 0, mapNodes = [], animFrameId = null;

  function init() {
    setupEventListeners();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    startIntroBriefing();
  }

  function setupEventListeners() {
    DOM.btnAudio.addEventListener("click", () => {
      const isMuted = window.soundEngine.toggleMute();
      DOM.audioIcon.textContent = isMuted ? "🔇" : "🔊";
    });
    DOM.btnCalm.addEventListener("click", () => {
      state.isCalmMode = !state.isCalmMode;
      DOM.calmStatus.textContent = state.isCalmMode ? "ON" : "OFF";
      DOM.calmStatus.style.color = state.isCalmMode ? "var(--teal)" : "var(--crimson)";
    });
    DOM.btnSkipIntro.addEventListener("click", skipIntroBriefing);
    DOM.btnLaunchDemo.addEventListener("click", () => createSession("demo"));
    DOM.fileUploadInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) createSession("upload", e.target.files[0]);
    });
    DOM.btnCloseIntel.addEventListener("click", deselectTarget);
    DOM.cmdArchive.addEventListener("click", () => issueCommand("archive"));
    DOM.cmdTrash.addEventListener("click", () => issueCommand("trash"));
    DOM.cmdKeep.addEventListener("click", () => issueCommand("keep"));
    DOM.cmdUnsub.addEventListener("click", () => issueCommand("unsubscribe"));
    DOM.cmdUndo.addEventListener("click", executeUndo);
    DOM.cmdEndMission.addEventListener("click", loadMissionDebrief);
    DOM.btnCancelConfirm.addEventListener("click", () => { DOM.confirmModal.classList.add("hidden"); state.pendingAction = null; });
    DOM.btnExecuteConfirm.addEventListener("click", () => {
      DOM.confirmModal.classList.add("hidden");
      if (state.pendingAction) { issueCommand(state.pendingAction, true); state.pendingAction = null; }
    });
    DOM.btnEngageBoss.addEventListener("click", () => {
      DOM.bossModal.classList.add("hidden");
      openIntelPanel(state.selectedCardIndex);
    });
    DOM.formLeaderboard.addEventListener("submit", submitLeaderboard);
    DOM.btnRedeploy.addEventListener("click", () => location.reload());
    DOM.canvas.addEventListener("click", handleCanvasClick);
    window.addEventListener("keydown", handleKeyboardControls);
  }

  function handleKeyboardControls(e) {
    if (e.target.tagName === "INPUT") return;
    switch (e.key.toLowerCase()) {
      case "escape":
        if (!DOM.confirmModal.classList.contains("hidden")) DOM.confirmModal.classList.add("hidden");
        else if (!DOM.bossModal.classList.contains("hidden")) DOM.bossModal.classList.add("hidden");
        else if (!DOM.intelPanel.classList.contains("hidden")) deselectTarget();
        break;
      case "a": if (state.selectedCardIndex !== null) issueCommand("archive"); break;
      case "t": if (state.selectedCardIndex !== null) issueCommand("trash"); break;
      case "k": if (state.selectedCardIndex !== null) issueCommand("keep"); break;
      case "u": if (state.selectedCardIndex !== null) issueCommand("unsubscribe"); break;
      case "z": executeUndo(); break;
      case " ": e.preventDefault(); DOM.btnCalm.click(); break;
    }
  }

  const briefingLines = [
    "ZEROHOUR SYSTEM INITIALIZING...",
    ">> SECURE UPLINK ESTABLISHED.",
    ">> 5,000 HOSTILE SIGNALS OVERWHELMING INBOX SECTOR.",
    ">> COMMAND BRIEFING: You are our final triage operator.",
    ">> Cleanse the infected sector. Secure classified assets.",
    ">> OPERATION STATUS: AWAITING AUTHORIZATION."
  ];
  let lineIdx = 0;

  function startIntroBriefing() {
    window.soundEngine.playBootTone();
    typeNextBriefingLine();
  }

  function typeNextBriefingLine() {
    if (lineIdx < briefingLines.length) {
      const p = document.createElement("p");
      p.textContent = briefingLines[lineIdx];
      DOM.introText.appendChild(p);
      window.soundEngine.playRadioStatic(0.08);
      lineIdx++;
      setTimeout(typeNextBriefingLine, 600);
    } else {
      DOM.introControls.classList.remove("hidden");
    }
  }

  function skipIntroBriefing() {
    DOM.introText.innerHTML = briefingLines.map(l => `<p>${l}</p>`).join("");
    DOM.introControls.classList.remove("hidden");
    lineIdx = briefingLines.length;
  }

  async function createSession(sourceType, file = null) {
    try {
      let resp;
      if (sourceType === "demo") {
        resp = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "demo" }) });
      } else {
        const formData = new FormData();
        formData.append("source", file.name.endsWith(".csv") ? "csv" : "mbox");
        formData.append("file", file);
        resp = await fetch("/api/sessions", { method: "POST", body: formData });
      }
      if (!resp.ok) throw new Error("Session creation failed.");
      const data = await resp.json();
      state.sessionId = data.session_id;
      state.inboxRemaining = data.stats.total_emails;
      state.totalWaves = data.stats.total_waves;
      updateHUD();
      transitionToView("map");
      await loadWave(1);
    } catch (err) {
      alert(`DEPLOYMENT FAILED: ${err.message}`);
    }
  }

  function transitionToView(viewName) {
    DOM.viewIntro.classList.remove("active");
    DOM.viewMap.classList.remove("active");
    DOM.viewDebrief.classList.remove("active");
    if (viewName === "map") { DOM.viewMap.classList.add("active"); startTacticalMap(); }
    else if (viewName === "debrief") { DOM.viewDebrief.classList.add("active"); }
  }

  async function loadWave(waveNumber) {
    try {
      const resp = await fetch(`/api/sessions/${state.sessionId}/deck?wave=${waveNumber}`);
      if (!resp.ok) throw new Error("Failed to load wave.");
      const data = await resp.json();
      state.currentWave = data.wave;
      state.totalWaves = data.total_waves;
      state.cards = data.cards;
      DOM.hudWave.textContent = `WAVE ${state.currentWave} // ${state.currentWave === 1 ? "SECTOR ALPHA" : "SECTOR BRAVO"}`;
      generateMapNodes();
    } catch (err) { console.error(err); }
  }

  function resizeCanvas() {
    DOM.canvas.width = DOM.canvas.clientWidth * window.devicePixelRatio;
    DOM.canvas.height = DOM.canvas.clientHeight * window.devicePixelRatio;
    if (mapNodes.length > 0) generateMapNodes();
  }

  function generateMapNodes() {
    const w = DOM.canvas.width, h = DOM.canvas.height, centerX = w / 2, centerY = h / 2;
    const maxRadius = Math.min(w, h) * 0.42;
    mapNodes = [];

    state.cards.forEach((card, idx) => {
      const hash = Math.abs(parseInt(card.cluster_id.slice(0, 8), 16) || (idx * 9301));
      const angle = (hash % 360) * (Math.PI / 180);
      const dist = 60 + (hash % Math.round(maxRadius - 60));
      mapNodes.push({ index: idx, card: card, x: centerX + Math.cos(angle) * dist, y: centerY + Math.sin(angle) * dist, radius: card.is_boss ? 14 : (card.protected ? 10 : 7), pulse: 0 });
    });
  }

  function startTacticalMap() {
    if (!animFrameId) animFrameId = requestAnimationFrame(loopTacticalMap);
  }

  function loopTacticalMap() {
    const w = DOM.canvas.width, h = DOM.canvas.height, ctx = canvasCtx, centerX = w / 2, centerY = h / 2;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(41, 67, 92, 0.35)"; ctx.lineWidth = 1;
    for (let r = 80; r < Math.min(w, h) * 0.48; r += 80) { ctx.beginPath(); ctx.arc(centerX, centerY, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();

    radarAngle += 0.015;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, Math.min(w, h) * 0.46, radarAngle, radarAngle + 0.35);
    ctx.closePath();
    const grad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.min(w, h) * 0.46);
    grad.addColorStop(0, "rgba(0, 243, 255, 0)"); grad.addColorStop(1, "rgba(0, 243, 255, 0.15)");
    ctx.fillStyle = grad; ctx.fill(); ctx.restore();

    mapNodes.forEach(node => {
      const c = node.card, isSelected = state.selectedCardIndex === node.index, isDecided = c.status === "decided";
      ctx.save(); ctx.beginPath();
      if (isDecided) { ctx.fillStyle = "rgba(112, 134, 157, 0.25)"; ctx.strokeStyle = "#29435c"; }
      else if (c.is_boss) { ctx.fillStyle = "#ff2a55"; ctx.strokeStyle = isSelected ? "#fff" : "#ff2a55"; }
      else if (c.protected) { ctx.fillStyle = "#ffaa00"; ctx.strokeStyle = isSelected ? "#fff" : "#ffaa00"; }
      else { ctx.fillStyle = "#00f3ff"; ctx.strokeStyle = isSelected ? "#fff" : "#00f3ff"; }

      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.lineWidth = isSelected ? 3 : 1; ctx.stroke();

      if (isSelected) {
        node.pulse = (node.pulse + 0.05) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + Math.sin(node.pulse) * 4 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff"; ctx.stroke();
      }
      ctx.restore();
    });
    animFrameId = requestAnimationFrame(loopTacticalMap);
  }

  function handleCanvasClick(e) {
    const rect = DOM.canvas.getBoundingClientRect();
    const scaleX = DOM.canvas.width / rect.width, scaleY = DOM.canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX, clickY = (e.clientY - rect.top) * scaleY;

    for (let node of mapNodes) {
      if (Math.hypot(node.x - clickX, node.y - clickY) <= node.radius + 8) {
        selectNode(node.index);
        return;
      }
    }
  }

  function selectNode(index) {
    const card = state.cards[index];
    state.selectedCardIndex = index;
    window.soundEngine.playTargetLock();

    if (card.is_boss && card.status === "open") {
      DOM.bossModalDesc.textContent = `Massive cluster: ${card.sender_name} (${card.count} messages).`;
      DOM.bossModal.classList.remove("hidden");
      window.soundEngine.playBossAlert();
    } else {
      openIntelPanel(index);
    }
  }

  function openIntelPanel(index) {
    const card = state.cards[index];
    state.cardDisplayedAt = performance.now();
    DOM.intelSenderName.textContent = card.sender_name;
    DOM.intelSenderAddr.textContent = card.sender_address;
    DOM.intelPayloadCount.textContent = `${card.count} EMAILS`;
    DOM.intelUnreadRatio.textContent = `${Math.round(card.unread_ratio * 100)}%`;
    DOM.intelDateRange.textContent = card.date_range;
    DOM.intelCategory.textContent = `CATEGORY: ${(card.category || "OTHER").toUpperCase()}`;
    DOM.intelBossStatus.textContent = card.is_boss ? "HIGH-VALUE (BOSS)" : "STANDARD";
    DOM.intelAiSource.textContent = `RECON: ${(card.decision_source || "GEMINI").toUpperCase()}`;
    DOM.intelAiConfidence.textContent = `CONF: ${Math.round((card.confidence || 0.8) * 100)}%`;
    DOM.intelAiReason.textContent = card.reason || "Recommendation verified.";
    DOM.intelSubjectsList.innerHTML = card.sample_subjects.map(s => `<li>${s.replace(/[&<>'"]/g, "")}</li>`).join("");
    DOM.intelPanel.classList.remove("hidden");
  }

  function deselectTarget() {
    state.selectedCardIndex = null;
    DOM.intelPanel.classList.add("hidden");
  }

  async function issueCommand(actionType, confirmed = false) {
    if (state.selectedCardIndex === null) return;
    const card = state.cards[state.selectedCardIndex];

    if (card.protected && (actionType === "trash" || actionType === "unsubscribe") && !confirmed) {
      state.pendingAction = actionType;
      DOM.confirmModal.classList.remove("hidden");
      return;
    }

    const decisionId = crypto.randomUUID();
    const responseMs = state.isCalmMode ? null : Math.round(performance.now() - (state.cardDisplayedAt || performance.now()));

    if (actionType === "archive") window.soundEngine.playArchive();
    else if (actionType === "trash") window.soundEngine.playTrash();
    else if (actionType === "keep") window.soundEngine.playKeep();
    else window.soundEngine.playTrash();

    try {
      const resp = await fetch(`/api/sessions/${state.sessionId}/decisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: decisionId, cluster_id: card.cluster_id, action: actionType, response_ms: responseMs, confirmed: confirmed })
      });
      if (!resp.ok) throw new Error("Command rejected by server.");
      const resData = await resp.json();

      if (resData.requires_confirmation) {
        state.pendingAction = actionType;
        DOM.confirmModal.classList.remove("hidden");
        return;
      }

      card.status = "decided";
      card.decision = { decision_id: decisionId, action: actionType };
      state.lastDecisionId = decisionId;
      state.score = resData.result.score;
      state.combo = resData.result.combo;
      state.inboxRemaining = resData.result.inbox_remaining;
      updateHUD();

      const nextIdx = state.cards.findIndex(c => c.status === "open");
      if (nextIdx !== -1) selectNode(nextIdx);
      else {
        deselectTarget();
        if (state.currentWave < state.totalWaves) loadWave(state.currentWave + 1);
      }
    } catch (err) { alert(`STRIKE FAILED: ${err.message}`); }
  }

  async function executeUndo() {
    if (!state.lastDecisionId) return;
    window.soundEngine.playUndo();
    try {
      const resp = await fetch(`/api/sessions/${state.sessionId}/undo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: state.lastDecisionId })
      });
      if (!resp.ok) throw new Error("Undo rejected.");
      const data = await resp.json();
      const restored = state.cards.find(c => c.cluster_id === data.restored_cluster_id);
      if (restored) { restored.status = "open"; restored.decision = null; }
      state.score = data.score;
      state.combo = data.combo;
      state.inboxRemaining = data.inbox_remaining;
      state.lastDecisionId = null;
      updateHUD();
    } catch (err) { alert(`REVERT FAILED: ${err.message}`); }
  }

  function updateHUD() {
    DOM.hudScore.textContent = String(state.score).padStart(6, "0");
    DOM.hudCombo.textContent = `x${state.combo} [${state.combo >= 5 ? "ON FIRE" : "ACTIVE"}]`;
    DOM.hudInbox.textContent = `${state.inboxRemaining.toLocaleString()} SIGNALS`;
  }

  async function loadMissionDebrief() {
    try {
      const resp = await fetch(`/api/sessions/${state.sessionId}/report`);
      if (!resp.ok) throw new Error("Could not compile debrief.");
      const data = await resp.json(), hl = data.headline;
      DOM.dbAnalyzed.textContent = hl.emails_analyzed.toLocaleString();
      DOM.dbCleared.textContent = hl.processed_in_session.toLocaleString();
      DOM.dbKept.textContent = hl.reviewed_kept.toLocaleString();
      DOM.dbTimeSaved.textContent = `${hl.estimated_minutes_saved}m`;
      DOM.dbReconFormula.textContent = `Processed (${hl.processed_in_session}) + Kept (${hl.reviewed_kept}) + Undecided (${hl.undecided}) + Personal (${hl.excluded_personal}) + Singletons (${hl.left_out_singletons}) = Analyzed (${hl.emails_analyzed})`;
      DOM.downloadFilters.href = `/api/sessions/${state.sessionId}/export/filters.xml`;
      DOM.downloadCleaned.href = `/api/sessions/${state.sessionId}/export/cleaned.csv`;
      DOM.downloadUnsub.href = `/api/sessions/${state.sessionId}/export/unsubscribe.csv`;

      fetchLeaderboard();
      transitionToView("debrief");
    } catch (err) { alert(`DEBRIEF FAILED: ${err.message}`); }
  }

  async function fetchLeaderboard() {
    try {
      const resp = await fetch("/api/leaderboard");
      if (resp.ok) {
        const entries = await resp.json();
        DOM.lbDisplay.innerHTML = entries.map((e, i) => `<div style="display:flex; justify-content:space-between; padding:4px 0;"><span>#${i+1} ${e.nickname}</span><span>SCORE: ${e.score}</span></div>`).join("");
      }
    } catch(e) {}
  }

  async function submitLeaderboard(e) {
    e.preventDefault();
    const nick = DOM.lbNickname.value.trim();
    if (!nick) return;
    try {
      const resp = await fetch("/api/leaderboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.sessionId, nickname: nick })
      });
      if (resp.ok) { fetchLeaderboard(); DOM.formLeaderboard.reset(); }
    } catch(e) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();
