document.addEventListener("DOMContentLoaded", () => {
  const screenMenu = document.getElementById("screen-menu");
  const screenBriefing = document.getElementById("screen-briefing");
  const pointerlockOverlay = document.getElementById("pointerlock-overlay");
  const tacticalHud = document.getElementById("tactical-hud");
  const modalDebrief = document.getElementById("modal-debrief");

  const formReg = document.getElementById("form-registration");
  const inputCallsign = document.getElementById("input-callsign");
  const inputEmail = document.getElementById("input-email");
  const errCallsign = document.getElementById("err-callsign");
  const errEmail = document.getElementById("err-email");
  const btnRnd = document.getElementById("btn-rnd-callsign");

  const metaCallsign = document.getElementById("meta-callsign");
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

  let currentSession = null;
  const game = new FPSGameEngine("fps-canvas", window.soundEngine);
  game.start();

  const CALLSIGNS = ["GHOST-1", "BRAVO-SIX", "SOAP-01", "ROACH", "WAR-PIG", "VIPER"];
  btnRnd.addEventListener("click", () => {
    inputCallsign.value = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
    errCallsign.textContent = "";
  });

  // 1. REGISTRATION
  formReg.addEventListener("submit", async (e) => {
    e.preventDefault();
    const callsign = inputCallsign.value.trim();
    const email = inputEmail.value.trim();
    const diff = document.querySelector('input[name="difficulty"]:checked').value;

    let valid = true;
    if (!callsign) { errCallsign.textContent = "Callsign required."; valid = false; }
    if (!email || !email.includes("@")) { errEmail.textContent = "Valid email required."; valid = false; }
    if (!valid) return;

    try {
      const res = await fetch("/api/demo/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign, email, difficulty: diff })
      });
      currentSession = await res.json();
    } catch (err) {
      currentSession = {
        session_id: "OFFLINE",
        callsign: callsign.toUpperCase(),
        threats_total: 10,
        threats: [
          { id: "THR-1", category: "phishing", subject: "Critical Server Infiltration Node", threat_level: 5 },
          { id: "THR-2", category: "spam", subject: "Automated Crypto Syndicate Bot", threat_level: 3 },
          { id: "THR-3", category: "newsletter", subject: "Telemetry Scan Drone", threat_level: 2 },
          { id: "THR-4", category: "phishing", subject: "Trojan Credential Harvester", threat_level: 4 },
        ]
      };
    }

    metaCallsign.textContent = currentSession.callsign;
    screenMenu.classList.add("hidden");
    screenBriefing.classList.remove("hidden");
  });

  btnBackMenu.addEventListener("click", () => {
    screenBriefing.classList.add("hidden");
    screenMenu.classList.remove("hidden");
  });

  // 2. DEPLOY INTO 3D FPS
  btnDeploy.addEventListener("click", () => {
    screenBriefing.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");

    game.loadSession(currentSession.threats);
    hudCallsign.textContent = currentSession.callsign;
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ 0 / ${currentSession.threats.length} ]`;
  });

  // Engage Pointer Lock
  pointerlockOverlay.addEventListener("click", () => {
    game.canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === game.canvas) {
      game.isLocked = true;
      pointerlockOverlay.classList.add("hidden");
    } else {
      game.isLocked = false;
      if (!modalDebrief.classList.contains("hidden")) return;
      pointerlockOverlay.classList.remove("hidden");
    }
  });

  // In-Game UI Updates
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
  }, 50);

  // Killfeed Notification
  game.onKillThreat = (id, subject, neutralized, total) => {
    hudObjective.textContent = `PURGE DIGITAL THREAT NODES [ ${neutralized} / ${total} ]`;
    const item = document.createElement("div");
    item.className = "killfeed-item";
    item.textContent = `PURGED: ${subject}`;
    killfeed.prepend(item);
    setTimeout(() => item.remove(), 4000);

    fetch(`/api/demo/session/${currentSession.session_id}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threat_id: id, action: "purge" })
    }).catch(() => {});
  };

  // 3. MISSION END (VICTORY / DEFEAT)
  game.onMissionEnd = (isVictory, stats) => {
    tacticalHud.classList.add("hidden");
    pointerlockOverlay.classList.add("hidden");

    if (isVictory) {
      debriefTag.textContent = "MISSION ACCOMPLISHED // SECTOR PURIFIED";
      debriefTitle.textContent = "FACILITY SECURED";
    } else {
      debriefTag.textContent = "CRITICAL FAILURE // KIA";
      debriefTitle.textContent = "OPERATOR DOWN";
    }

    resPurged.textContent = stats.purged;
    resAccuracy.textContent = `${stats.accuracy}%`;
    resHealth.textContent = `${stats.health}%`;

    modalDebrief.classList.remove("hidden");
  };

  // Exports
  document.getElementById("btn-export-xml").addEventListener("click", () => {
    window.location.href = `/api/demo/session/${currentSession.session_id}/export/filters.xml`;
  });
  document.getElementById("btn-export-csv").addEventListener("click", () => {
    window.location.href = `/api/demo/session/${currentSession.session_id}/export/unsubscribe.csv`;
  });

  btnRestart.addEventListener("click", () => {
    modalDebrief.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");
    game.player.health = 100;
    game.player.ammoClip = 30;
    game.player.ammoReserve = 120;
    game.loadSession(currentSession.threats);
  });

  btnReturnBriefing.addEventListener("click", () => {
    modalDebrief.classList.add("hidden");
    screenBriefing.classList.remove("hidden");
  });
});
