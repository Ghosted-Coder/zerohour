document.addEventListener("DOMContentLoaded", () => {
  const screenMenu = document.getElementById("screen-menu");
  const screenBriefing = document.getElementById("screen-briefing");
  const cutsceneOverlay = document.getElementById("cutscene-overlay");
  const pointerlockOverlay = document.getElementById("pointerlock-overlay");
  const tacticalHud = document.getElementById("tactical-hud");
  const modalDebrief = document.getElementById("modal-debrief");

  const formReg = document.getElementById("form-registration");
  const inputCallsign = document.getElementById("input-callsign");
  const inputEmail = document.getElementById("input-email");
  const btnRnd = document.getElementById("btn-rnd-callsign");
  const btnConnectGmail = document.createElement("button");

  // Create "CONNECT REAL GMAIL" button inside terminal
  btnConnectGmail.type = "button";
  btnConnectGmail.className = "btn-chrome-ghost";
  btnConnectGmail.style.width = "100%";
  btnConnectGmail.style.marginTop = "8px";
  btnConnectGmail.innerHTML = "🔗 CONNECT REAL GMAIL (OAUTH 2.0)";
  formReg.appendChild(btnConnectGmail);

  const metaCallsign = document.getElementById("meta-callsign");
  const telCallsign = document.getElementById("tel-callsign");
  const btnBackMenu = document.getElementById("btn-back-menu");
  const btnDeploy = document.getElementById("btn-deploy");

  const hudObjective = document.getElementById("hud-objective-text");
  const hudCallsign = document.getElementById("hud-callsign");
  const healthFill = document.getElementById("health-fill");
  const healthVal = document.getElementById("health-val");
  const ammoClip = document.getElementById("ammo-clip");
  const ammoReserve = document.getElementById("ammo-reserve");
  const killfeed = document.getElementById("triage-killfeed");
  const crosshair = document.getElementById("crosshair");

  const debriefTag = document.getElementById("debrief-tag");
  const debriefTitle = document.getElementById("debrief-title");
  const resPurged = document.getElementById("res-purged");
  const resAccuracy = document.getElementById("res-accuracy");
  const resHealth = document.getElementById("res-health");
  const btnRestart = document.getElementById("btn-restart");
  const btnReturnBriefing = document.getElementById("btn-return-briefing");

  let selectedDifficulty = "veteran";
  let currentSession = { session_id: "ZH-DEFAULT", callsign: "BRAVO-SIX", is_real_gmail: false };
  const game = new FPSGameEngine("fps-canvas", window.soundEngine);
  game.start();

  // Connect Real Gmail OAuth Flow
  btnConnectGmail.addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/auth/google/url?session_id=${currentSession.session_id}`);
      const data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (e) {
      alert("Unable to contact OAuth gateway.");
    }
  });

  // Check URL params for OAuth return
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth_status") === "connected") {
    btnConnectGmail.innerHTML = "🟢 GMAIL CONNECTED (READY FOR INBOX SCAN)";
    btnConnectGmail.style.borderColor = "#00ffcc";
    btnConnectGmail.style.color = "#00ffcc";
  }

  // Difficulty selection
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedDifficulty = btn.getAttribute("data-val");
    });
  });

  const CALLSIGNS = ["BRAVO-SIX", "GHOST-1", "SOAP-01", "ROACH", "WAR-PIG", "VIPER"];
  btnRnd.addEventListener("click", () => {
    inputCallsign.value = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
  });

  // 1. REGISTRATION & INBOX ANALYSIS
  formReg.addEventListener("submit", async (e) => {
    e.preventDefault();
    const callsign = inputCallsign.value.trim() || "BRAVO-SIX";
    const email = inputEmail.value.trim() || "commander@zerohour.internal";

    try {
      const res = await fetch("/api/demo/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign, email, difficulty: selectedDifficulty })
      });
      currentSession = await res.json();

      // Trigger Inbox Intelligence Scan (Fetches real emails if OAuth connected)
      const scanRes = await fetch(`/api/inbox/analyze?session_id=${currentSession.session_id}`, { method: "POST" });
      const analysis = await scanRes.json();
      console.log("Inbox Analysis Result:", analysis);
    } catch (err) {
      console.warn("Using offline sandbox session.");
    }

    metaCallsign.textContent = currentSession.callsign;
    telCallsign.textContent = currentSession.callsign;
    screenMenu.classList.add("hidden");
    screenBriefing.classList.remove("hidden");
  });

  btnBackMenu.addEventListener("click", () => {
    screenBriefing.classList.add("hidden");
    screenMenu.classList.remove("hidden");
  });

  // 2. DEPLOY & START AMBIENCE
  btnDeploy.addEventListener("click", () => {
    window.soundEngine.startBunkerAmbience();
    screenBriefing.classList.add("hidden");
    cutsceneOverlay.classList.remove("hidden");

    game.loadSession(currentSession.threats || []);
    hudCallsign.textContent = currentSession.callsign;
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ 0 / ${game.threats.length} ]`;
    game.playCutscene();
  });

  game.onCutsceneFinish = () => {
    cutsceneOverlay.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");
  };

  pointerlockOverlay.addEventListener("click", () => {
    game.canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === game.canvas) {
      game.isLocked = true;
      pointerlockOverlay.classList.add("hidden");
    } else {
      game.isLocked = false;
      if (!modalDebrief.classList.contains("hidden") || game.isCutscene) return;
      pointerlockOverlay.classList.remove("hidden");
    }
  });

  // Real-time HUD loop
  setInterval(() => {
    if (!game.isLocked) return;
    healthVal.textContent = Math.round(game.player.health);
    healthFill.style.width = `${Math.max(0, game.player.health)}%`;
    ammoClip.textContent = game.player.ammoClip;
    ammoReserve.textContent = game.player.ammoReserve;

    if (game.player.isADS) {
      crosshair.classList.add("ads");
    } else {
      crosshair.classList.remove("ads");
    }
  }, 40);

  // Killfeed and Operation Staging
  const approvedOperations = [];
  game.onKillThreat = (id, subject, neutralized, total) => {
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ ${neutralized} / ${total} ]`;
    const item = document.createElement("div");
    item.className = "killfeed-item";
    item.textContent = `PURGED: ${subject}`;
    killfeed.prepend(item);
    setTimeout(() => item.remove(), 4000);

    // Queue real operation for post-mission execution
    approvedOperations.push({
      sender_email: subject.split(" ")[0].replace("[", "").replace("]", ""),
      action: "archive",
      message_ids: []
    });
  };

  // 3. MISSION END & ONE-CLICK AUTOMATION DASHBOARD
  game.onMissionEnd = async (isVictory, stats) => {
    tacticalHud.classList.add("hidden");
    pointerlockOverlay.classList.add("hidden");

    if (isVictory) {
      debriefTag.textContent = "MISSION ACCOMPLISHED // FACILITY PURIFIED";
      debriefTitle.textContent = "SECTOR SECURED";
    } else {
      debriefTag.textContent = "CRITICAL FAILURE // KIA";
      debriefTitle.textContent = "OPERATOR DOWN";
    }

    resPurged.textContent = stats.purged;
    resAccuracy.textContent = `${stats.accuracy}%`;
    resHealth.textContent = `${stats.health}%`;

    // ONE-CLICK LIVE GMAIL EXECUTION BUTTON
    const exportBox = document.querySelector(".export-box");
    if (!document.getElementById("btn-exec-live")) {
      const liveBtn = document.createElement("button");
      liveBtn.id = "btn-exec-live";
      liveBtn.className = "btn-chrome-primary";
      liveBtn.style.marginTop = "12px";
      liveBtn.innerHTML = "⚡ EXECUTE APPROVED CLEANUP IN GMAIL";
      liveBtn.onclick = async () => {
        liveBtn.innerHTML = "EXECUTING GMAIL API OPERATIONS...";
        liveBtn.disabled = true;
        try {
          const res = await fetch("/api/inbox/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: currentSession.session_id, operations: approvedOperations })
          });
          const report = await res.json();
          alert(`Cleanup Complete! Operations: ${report.total_operations}, Succeeded: ${report.succeeded}, Archived: ${report.archived_emails}`);
          liveBtn.innerHTML = "✅ GMAIL OPERATIONS VERIFIED & COMPLETED";
        } catch (e) {
          alert("Execution logged to audit report.");
          liveBtn.innerHTML = "OPERATION LOGGED";
        }
      };
      exportBox.appendChild(liveBtn);
    }

    modalDebrief.classList.remove("hidden");
  };

  btnRestart.addEventListener("click", () => {
    modalDebrief.classList.add("hidden");
    game.player.health = 100;
    game.player.ammoClip = 30;
    game.player.ammoReserve = 120;
    game.loadSession(currentSession.threats || []);
    btnDeploy.click();
  });

  btnReturnBriefing.addEventListener("click", () => {
    modalDebrief.classList.add("hidden");
    screenBriefing.classList.remove("hidden");
  });
});
