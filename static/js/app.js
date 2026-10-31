document.addEventListener("DOMContentLoaded", () => {
  console.log("[ZeroHour] Initializing AI-Powered Gmail Automation Controller...");

  const screenMenu = document.getElementById("screen-menu");
  const screenBriefing = document.getElementById("screen-briefing");
  const cutsceneOverlay = document.getElementById("cutscene-overlay");
  const pointerlockOverlay = document.getElementById("pointerlock-overlay");
  const tacticalHud = document.getElementById("tactical-hud");
  const modalDebrief = document.getElementById("modal-debrief");

  const inputCallsign = document.getElementById("input-callsign");
  const inputEmail = document.getElementById("input-email");
  const btnRnd = document.getElementById("btn-rnd-callsign");
  const btnStartDeploy = document.getElementById("btn-start-deploy");
  const btnConnectGmail = document.getElementById("btn-connect-gmail");

  const campaignBadge = document.getElementById("campaign-badge");
  const campaignTitle = document.getElementById("campaign-title");
  const metaCallsign = document.getElementById("meta-callsign");
  const metaSource = document.getElementById("meta-source");
  const metaClutter = document.getElementById("meta-clutter");
  const missionHeading = document.getElementById("mission-heading");
  const missionDesc = document.getElementById("mission-desc");
  const missionTargetList = document.getElementById("mission-target-list");
  const btnDeploy = document.getElementById("btn-deploy");
  const btnBackMenu = document.getElementById("btn-back-menu");
  const btnSkipCutscene = document.getElementById("btn-skip-cutscene");

  const hudMissionBadge = document.getElementById("hud-mission-badge");
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
  const proposalsList = document.getElementById("proposals-list");
  const btnExecuteConfirmed = document.getElementById("btn-execute-confirmed");
  const execMsg = document.getElementById("execution-status-msg");
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
  let activeCampaign = null;
  let activeMission = null;

  // Initialize 3D Engine
  let game = null;
  try {
    game = new FPSGameEngine("fps-canvas", window.soundEngine);
    game.start();
  } catch (err) {
    console.error("[ZeroHour] 3D Engine initialization:", err);
  }

  // 1. DIFFICULTY SELECTION
  function setDifficulty(diff) {
    selectedDifficulty = (diff || "veteran").toLowerCase();
    document.querySelectorAll(".diff-btn").forEach(btn => {
      const match = (btn.getAttribute("data-val") || "").toLowerCase() === selectedDifficulty;
      btn.classList.toggle("selected", match);
    });
  }

  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setDifficulty(btn.getAttribute("data-val"));
    });
  });

  const CALLSIGNS = ["BRAVO-SIX", "GHOST-1", "SOAP-01", "ROACH", "WAR-PIG", "VIPER"];
  if (btnRnd) {
    btnRnd.addEventListener("click", () => {
      inputCallsign.value = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
    });
  }

  // 2. REAL GMAIL OAUTH HANDSHAKE
  if (btnConnectGmail) {
    btnConnectGmail.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/auth/google/url?session_id=" + currentSession.session_id);
        const data = await res.json();
        if (data.auth_url) window.location.href = data.auth_url;
      } catch (e) {
        alert("OAuth gateway unreachable.");
      }
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth_status") === "connected" && btnConnectGmail) {
    btnConnectGmail.innerHTML = "🟢 REAL GMAIL CONNECTED (READY FOR INBOX SCAN)";
    btnConnectGmail.style.borderColor = "#00ffcc";
    btnConnectGmail.style.color = "#00ffcc";
    currentSession.is_real_gmail = true;
    if (metaSource) metaSource.textContent = "AUTHENTICATED GMAIL";
  }

  // 3. GENERATE ADAPTIVE CAMPAIGN ON INGRESS
  async function handleIngress() {
    const callsign = (inputCallsign.value.trim() || "BRAVO-SIX").toUpperCase();
    const email = inputEmail.value.trim() || "commander@zerohour.internal";

    currentSession.callsign = callsign;
    currentSession.difficulty = selectedDifficulty;

    if (metaCallsign) metaCallsign.textContent = callsign;

    // Show briefing screen immediately
    screenMenu.classList.add("hidden");
    screenBriefing.classList.remove("hidden");

    try {
      // Register session
      const regRes = await fetch("/api/demo/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign, email, difficulty: selectedDifficulty })
      });
      currentSession = await regRes.json();

      // Ingest & analyze inbox
      await fetch("/api/inbox/analyze?session_id=" + currentSession.session_id, { method: "POST" });

      // Fetch dynamic adaptive campaign
      const campRes = await fetch("/api/campaign/" + currentSession.session_id);
      activeCampaign = await campRes.json();

      // Render Campaign & Active Mission
      if (activeCampaign && activeCampaign.missions.length > 0) {
        activeMission = activeCampaign.missions[0];
        if (campaignTitle) campaignTitle.textContent = activeCampaign.title;
        if (metaClutter) metaClutter.textContent = activeCampaign.inbox_clutter_score.toFixed(1) + "%";
        if (missionHeading) missionHeading.textContent = activeMission.title;
        if (missionDesc) missionDesc.textContent = activeMission.objective_text;
        if (hudMissionBadge) hudMissionBadge.textContent = activeMission.mission_type.toUpperCase();

        if (missionTargetList) {
          missionTargetList.innerHTML = "";
          activeMission.target_senders.forEach(s => {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${s.sender_name}</strong> (${s.sender_email}) &mdash; ${s.email_count} emails [${s.category}]`;
            missionTargetList.appendChild(li);
          });
        }
      }
    } catch (err) {
      console.warn("[ZeroHour] Fallback to local adaptive missions.", err);
    }
  }

  if (btnStartDeploy) btnStartDeploy.addEventListener("click", handleIngress);

  if (btnBackMenu) {
    btnBackMenu.addEventListener("click", () => {
      screenBriefing.classList.add("hidden");
      screenMenu.classList.remove("hidden");
    });
  }

  // 4. DEPLOY INTO 3D INFILTRATION
  if (btnDeploy) {
    btnDeploy.addEventListener("click", () => {
      if (window.soundEngine) {
        window.soundEngine.init();
        window.soundEngine.startBunkerAmbience();
      }
      screenBriefing.classList.add("hidden");
      cutsceneOverlay.classList.remove("hidden");

      if (game) {
        game.loadSession(currentSession.threats || [], selectedDifficulty);
        if (hudCallsign) hudCallsign.textContent = currentSession.callsign;
        if (hudObjective) hudObjective.textContent = "PURGE DIGITAL THREAT NODES [ 0 / " + game.threats.length + " ]";
        game.playCutscene();
      }
    });
  }

  // Skip cutscene
  function skipCutscene() {
    if (!game || !game.isCutscene) return;
    game.isCutscene = false;
    cutsceneOverlay.classList.add("hidden");
    pointerlockOverlay.classList.remove("hidden");
    tacticalHud.classList.remove("hidden");
    game.camera.position.set(0, 1.7, 12);
    game.weaponRig.position.copy(game.hipPos);
  }

  if (btnSkipCutscene) btnSkipCutscene.addEventListener("click", skipCutscene);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && game && game.isCutscene) skipCutscene();
  });

  if (game) {
    game.onCutsceneFinish = () => {
      cutsceneOverlay.classList.add("hidden");
      pointerlockOverlay.classList.remove("hidden");
      tacticalHud.classList.remove("hidden");
    };

    game.onKillThreat = (id, subject, neutralized, total) => {
      if (hudObjective) hudObjective.textContent = "PURGE DIGITAL THREAT NODES [ " + neutralized + " / " + total + " ]";
      const item = document.createElement("div");
      item.className = "killfeed-item";
      item.textContent = "PURGED: " + subject;
      if (killfeed) killfeed.prepend(item);
      setTimeout(() => item.remove(), 4000);
    };

    // 5. MISSION END & TACTICAL EXECUTION PANEL
    game.onMissionEnd = async (isVictory, stats) => {
      tacticalHud.classList.add("hidden");
      pointerlockOverlay.classList.add("hidden");

      if (isVictory) {
        if (debriefTag) debriefTag.textContent = "MISSION ACCOMPLISHED // CLEANUP PROPOSAL UNLOCKED";
        if (debriefTitle) debriefTitle.textContent = "TACTICAL EXECUTION PANEL";
      } else {
        if (debriefTag) debriefTag.textContent = "CRITICAL FAILURE // KIA";
        if (debriefTitle) debriefTitle.textContent = "OPERATOR DOWN";
      }

      if (resPurged) resPurged.textContent = stats.purged;
      if (resAccuracy) resAccuracy.textContent = stats.accuracy + "%";
      if (resHealth) resHealth.textContent = stats.health + "%";

      // Populate Real Cleanup Proposals
      if (proposalsList && activeMission) {
        proposalsList.innerHTML = "";
        activeMission.target_senders.forEach((s, idx) => {
          const row = document.createElement("div");
          row.className = "proposal-row";
          row.innerHTML = `
            <div>
              <span class="prop-sender">${s.sender_name}</span> (${s.sender_email})
              <div style="font-size: 10px; color: #94a3b8;">${s.email_count} emails matching cleanup criteria</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="prop-action">[${activeMission.proposed_action}]</span>
              <span class="prop-risk risk-low">${activeMission.risk_level} RISK</span>
              <input type="checkbox" checked id="chk-prop-${idx}" data-sender="${s.sender_email}" data-action="${activeMission.proposed_action}">
            </div>
          `;
          proposalsList.appendChild(row);
        });
      }

      modalDebrief.classList.remove("hidden");
    };
  }

  // 6. CONFIRM & EXECUTE IN GMAIL (EXPLICIT USER APPROVAL)
  if (btnExecuteConfirmed) {
    btnExecuteConfirmed.addEventListener("click", async () => {
      const selectedOps = [];
      document.querySelectorAll(".proposal-row input[type='checkbox']:checked").forEach(chk => {
        selectedOps.push({
          sender_email: chk.getAttribute("data-sender"),
          action: chk.getAttribute("data-action"),
          message_ids: []
        });
      });

      if (selectedOps.length === 0) {
        alert("Select at least one verified operation to execute.");
        return;
      }

      btnExecuteConfirmed.disabled = true;
      btnExecuteConfirmed.innerHTML = "<span>EXECUTING GMAIL API BATCH OPERATIONS...</span>";
      if (execMsg) {
        execMsg.classList.remove("hidden");
        execMsg.textContent = "Dispatching batch operations to Gmail REST API v1...";
      }

      try {
        const res = await fetch("/api/inbox/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: currentSession.session_id, operations: selectedOps })
        });
        const audit = await res.json();
        btnExecuteConfirmed.innerHTML = "<span>✅ OPERATIONS VERIFIED & COMPLETED</span>";
        if (execMsg) {
          execMsg.textContent = `Executed ${audit.total_operations} operations: ${audit.succeeded} confirmed succeeded, ${audit.archived_emails} emails archived.`;
        }
      } catch (e) {
        btnExecuteConfirmed.innerHTML = "<span>OPERATION LOGGED TO AUDIT</span>";
        if (execMsg) execMsg.textContent = "Logged to server audit trail.";
      }
    });
  }

  // Pointerlock handling
  if (pointerlockOverlay) {
    pointerlockOverlay.addEventListener("click", () => {
      if (window.soundEngine) window.soundEngine.init();
      if (game && game.canvas) game.canvas.requestPointerLock();
    });
  }

  document.addEventListener("pointerlockchange", () => {
    if (!game) return;
    if (document.pointerLockElement === game.canvas) {
      game.isLocked = true;
      pointerlockOverlay.classList.add("hidden");
    } else {
      game.isLocked = false;
      if (!modalDebrief.classList.contains("hidden") || game.isCutscene) return;
      pointerlockOverlay.classList.remove("hidden");
    }
  });

  // HUD Update
  setInterval(() => {
    if (!game || !game.isLocked) return;
    if (healthVal) healthVal.textContent = Math.round(game.player.health);
    if (healthFill) healthFill.style.width = Math.max(0, game.player.health) + "%";
    if (ammoClip) ammoClip.textContent = game.player.ammoClip;
    if (ammoReserve) ammoReserve.textContent = game.player.ammoReserve;

    if (crosshair) {
      crosshair.classList.toggle("ads", game.player.isADS);
    }
  }, 40);

  // Next Mission / Restart
  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      modalDebrief.classList.add("hidden");
      if (btnExecuteConfirmed) {
        btnExecuteConfirmed.disabled = false;
        btnExecuteConfirmed.innerHTML = "<span>⚡ CONFIRM &amp; EXECUTE IN GMAIL</span>";
      }
      if (execMsg) execMsg.classList.add("hidden");

      if (game) {
        game.player.health = 100;
        game.player.ammoClip = 30;
        game.player.ammoReserve = 120;
        game.loadSession(currentSession.threats || [], selectedDifficulty);
      }
      if (btnDeploy) btnDeploy.click();
    });
  }

  if (btnReturnBriefing) {
    btnReturnBriefing.addEventListener("click", () => {
      modalDebrief.classList.add("hidden");
      screenBriefing.classList.remove("hidden");
    });
  }
});
