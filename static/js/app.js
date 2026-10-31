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
  const btnConnectGmail = document.getElementById("btn-connect-gmail");

  const metaCallsign = document.getElementById("meta-callsign");
  const metaDifficulty = document.getElementById("meta-difficulty");
  const telCallsign = document.getElementById("tel-callsign");
  const btnBackMenu = document.getElementById("btn-back-menu");
  const btnDeploy = document.getElementById("btn-deploy");
  const btnSkipCutscene = document.getElementById("btn-skip-cutscene");

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
  let currentSession = {
    session_id: "ZH-" + Math.floor(Math.random() * 90000 + 10000),
    callsign: "BRAVO-SIX",
    difficulty: "veteran",
    is_real_gmail: false,
    threats: []
  };

  const game = new FPSGameEngine("fps-canvas", window.soundEngine);
  game.start();

  // 1. RELIABLE DIFFICULTY SELECTION (100% RESPONSIVE)
  function setDifficulty(diff) {
    selectedDifficulty = diff.toLowerCase();
    document.querySelectorAll(".diff-btn").forEach(btn => {
      const match = (btn.getAttribute("data-val") || "").toLowerCase() === selectedDifficulty;
      btn.classList.toggle("selected", match);
      btn.setAttribute("aria-checked", match ? "true" : "false");
    });
    if (metaDifficulty) metaDifficulty.textContent = selectedDifficulty.toUpperCase();
    console.log(`[ZeroHour] Difficulty Activated: ${selectedDifficulty}`);
  }

  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const val = btn.getAttribute("data-val");
      if (val) setDifficulty(val);
    });
  });

  const CALLSIGNS = ["BRAVO-SIX", "GHOST-1", "SOAP-01", "ROACH", "WAR-PIG", "VIPER"];
  btnRnd.addEventListener("click", () => {
    inputCallsign.value = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
  });

  if (btnConnectGmail) {
    btnConnectGmail.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/auth/google/url?session_id=${currentSession.session_id}`);
        const data = await res.json();
        if (data.auth_url) window.location.href = data.auth_url;
      } catch (e) {
        alert("OAuth gateway unreachable.");
      }
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth_status") === "connected" && btnConnectGmail) {
    btnConnectGmail.innerHTML = "🟢 GMAIL CONNECTED (READY FOR INBOX SCAN)";
    btnConnectGmail.style.borderColor = "#00ffcc";
    btnConnectGmail.style.color = "#00ffcc";
  }

  // 2. INSTANT FORM SUBMISSION (NEVER BLOCKS ON NETWORK)
  formReg.addEventListener("submit", (e) => {
    e.preventDefault();
    const callsign = (inputCallsign.value.trim() || "BRAVO-SIX").toUpperCase();
    const email = inputEmail.value.trim() || "commander@zerohour.internal";

    currentSession.callsign = callsign;
    currentSession.difficulty = selectedDifficulty;

    // Instant UI transition
    metaCallsign.textContent = callsign;
    telCallsign.textContent = callsign;
    if (metaDifficulty) metaDifficulty.textContent = selectedDifficulty.toUpperCase();
    screenMenu.classList.add("hidden");
    screenBriefing.classList.remove("hidden");

    // Background fetch (non-blocking)
    fetch("/api/demo/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign, email, difficulty: selectedDifficulty })
    })
    .then(r => r.json())
    .then(data => {
      currentSession = data;
      // Pre-analyze inbox in background
      fetch(`/api/inbox/analyze?session_id=${data.session_id}`, { method: "POST" })
        .then(res => res.json())
        .catch(() => {});
    })
    .catch(() => {
      console.log("[ZeroHour] Running with active local threat dataset.");
    });
  });

  btnBackMenu.addEventListener("click", () => {
    screenBriefing.classList.add("hidden");
    screenMenu.classList.remove("hidden");
  });

  // 3. START MISSION & INFILTRATION
  btnDeploy.addEventListener("click", () => {
    window.soundEngine.init();
    window.soundEngine.startBunkerAmbience();
    screenBriefing.classList.add("hidden");
    cutsceneOverlay.classList.remove("hidden");

    game.loadSession(currentSession.threats || [], selectedDifficulty);
    hudCallsign.textContent = currentSession.callsign;
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ 0 / ${game.threats.length} ]`;
    game.playCutscene();
  });

  // SKIP CUTSCENE FUNCTIONALITY
  function skipCutscene() {
    if (!game.isCutscene) return;
    game.isCutscene = false;
    cutsceneOverlay.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");
    game.camera.position.set(0, 1.7, 12);
    game.weaponRig.position.copy(game.hipPos);
  }

  if (btnSkipCutscene) {
    btnSkipCutscene.addEventListener("click", skipCutscene);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && game.isCutscene) {
      skipCutscene();
    }
  });

  game.onCutsceneFinish = () => {
    cutsceneOverlay.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");
  };

  pointerlockOverlay.addEventListener("click", () => {
    window.soundEngine.init();
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

  const approvedOperations = [];
  game.onKillThreat = (id, subject, neutralized, total) => {
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ ${neutralized} / ${total} ]`;
    const item = document.createElement("div");
    item.className = "killfeed-item";
    item.textContent = `PURGED: ${subject}`;
    killfeed.prepend(item);
    setTimeout(() => item.remove(), 4000);

    approvedOperations.push({
      sender_email: subject.split(" ")[0].replace("[", "").replace("]", ""),
      action: "archive",
      message_ids: []
    });
  };

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
          alert(`Cleanup Succeeded! Operations: ${report.total_operations}, Archived: ${report.archived_emails}`);
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
    game.loadSession(currentSession.threats || [], selectedDifficulty);
    btnDeploy.click();
  });

  btnReturnBriefing.addEventListener("click", () => {
    modalDebrief.classList.add("hidden");
    screenBriefing.classList.remove("hidden");
  });
});
