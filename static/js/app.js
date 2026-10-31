document.addEventListener('DOMContentLoaded', () => {
  const screenReg = document.getElementById('screen-registration');
  const screenBriefing = document.getElementById('screen-briefing');
  const screenGame = document.getElementById('screen-game');
  const modalDebrief = document.getElementById('modal-debrief');

  const formReg = document.getElementById('form-registration');
  const inputCallsign = document.getElementById('input-callsign');
  const inputEmail = document.getElementById('input-email');
  const errCallsign = document.getElementById('error-callsign');
  const errEmail = document.getElementById('error-email');
  const bannerError = document.getElementById('banner-registration-error');
  const btnRndCallsign = document.getElementById('btn-random-callsign');

  const briefingCallsign = document.getElementById('briefing-callsign');
  const briefingDifficulty = document.getElementById('briefing-difficulty');
  const btnBackReg = document.getElementById('btn-back-reg');
  const btnStartMission = document.getElementById('btn-start-mission');

  const hudCallsign = document.getElementById('hud-callsign');
  const hudThreats = document.getElementById('hud-threats');
  const hudIntegrityFill = document.getElementById('hud-integrity-fill');
  const hudIntegrityText = document.getElementById('hud-integrity-text');
  const hudScore = document.getElementById('hud-score');
  const hudLog = document.getElementById('hud-triage-log');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownNumber = document.getElementById('countdown-number');
  const btnAbort = document.getElementById('btn-pause-abort');

  const debriefStatusTag = document.getElementById('debrief-status-tag');
  const debriefTitle = document.getElementById('debrief-title');
  const debriefSummary = document.getElementById('debrief-summary');
  const statPurged = document.getElementById('stat-purged');
  const statScore = document.getElementById('stat-score');
  const statIntegrity = document.getElementById('stat-integrity');
  const btnDownloadXml = document.getElementById('btn-download-xml');
  const btnDownloadCsv = document.getElementById('btn-download-csv');
  const btnRestartMission = document.getElementById('btn-restart-mission');
  const btnExitBriefing = document.getElementById('btn-exit-briefing');

  let currentSession = null;
  const game = new ShooterEngine('game-canvas', window.soundFX);

  const CALLSIGNS = ['SPECTRE-7', 'VANGUARD-01', 'SHADOW-LEAD', 'ZERO-ACTUAL', 'GHOST-9', 'CYBER-REAPER'];
  btnRndCallsign.addEventListener('click', () => {
    inputCallsign.value = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
    errCallsign.textContent = '';
    window.soundFX.playUiClick();
  });

  function switchScreen(targetScreen) {
    [screenReg, screenBriefing, screenGame].forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    targetScreen.classList.remove('hidden');
    targetScreen.classList.add('active');
  }

  formReg.addEventListener('submit', async (e) => {
    e.preventDefault();
    errCallsign.textContent = '';
    errEmail.textContent = '';
    bannerError.classList.add('hidden');

    const callsign = inputCallsign.value.trim();
    const email = inputEmail.value.trim();
    const diffRadio = formReg.querySelector('input[name="difficulty"]:checked');
    const difficulty = diffRadio ? diffRadio.value : 'veteran';

    let valid = true;
    if (!callsign || callsign.length < 2) {
      errCallsign.textContent = 'Callsign must be at least 2 characters.';
      valid = false;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailPattern.test(email)) {
      errEmail.textContent = 'Enter a valid communications email.';
      valid = false;
    }

    if (!valid) {
      window.soundFX.playAlarm();
      return;
    }

    window.soundFX.playUiClick();

    try {
      const res = await fetch('/api/demo/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callsign, email, difficulty })
      });

      if (!res.ok) throw new Error('Ingress node rejection');
      currentSession = await res.json();
    } catch (err) {
      console.warn('Backend unavailable, using client-side tactical session', err);
      currentSession = {
        session_id: 'ZH-OFFLINE-' + Math.floor(Math.random() * 9000 + 1000),
        callsign: callsign.toUpperCase(),
        email: email,
        difficulty: difficulty,
        threats_total: difficulty === 'recruit' ? 20 : (difficulty === 'veteran' ? 40 : 60),
        threats_neutralized: 0,
        inbox_integrity: 100,
        threats: []
      };
      for (let i = 0; i < currentSession.threats_total; i++) {
        currentSession.threats.push({
          id: `THR-LOCAL-${i+1}`,
          sender: `spam-node-${i+1}@unverified.org`,
          subject: `Automated Threat Notification #${i+1}`,
          category: ['phishing', 'spam', 'newsletter', 'cold_outreach'][i % 4],
          threat_level: (i % 5) + 1,
          opt_out_link: `https://unverified.org/opt-out?id=${i+1}`
        });
      }
    }

    briefingCallsign.textContent = currentSession.callsign;
    briefingDifficulty.textContent = currentSession.difficulty.toUpperCase();
    switchScreen(screenBriefing);
  });

  btnBackReg.addEventListener('click', () => {
    window.soundFX.playUiClick();
    switchScreen(screenReg);
  });

  btnStartMission.addEventListener('click', () => {
    window.soundFX.playUiClick();
    switchScreen(screenGame);
    game.initSession(currentSession.threats);
    runMissionCountdown();
  });

  function runMissionCountdown() {
    countdownOverlay.classList.remove('hidden');
    let count = 3;
    countdownNumber.textContent = count;
    window.soundFX.playUiClick();

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        countdownNumber.textContent = count;
        window.soundFX.playUiClick();
      } else {
        clearInterval(interval);
        countdownOverlay.classList.add('hidden');
        game.start();
        updateHUD();
      }
    }, 850);
  }

  function updateHUD() {
    hudCallsign.textContent = currentSession.callsign;
    hudThreats.textContent = `${game.threatsRemaining} / ${game.totalThreats}`;
    hudScore.textContent = game.score.toString().padStart(4, '0');
    
    const integ = Math.max(0, Math.round(game.inboxIntegrity));
    hudIntegrityText.textContent = `${integ}%`;
    hudIntegrityFill.style.width = `${integ}%`;
    if (integ < 30) {
      hudIntegrityFill.style.backgroundColor = '#ff3366';
    } else if (integ < 60) {
      hudIntegrityFill.style.backgroundColor = '#ffb700';
    } else {
      hudIntegrityFill.style.backgroundColor = '#00ffcc';
    }
  }

  game.onTriageAction = (threatId, action, subject) => {
    hudLog.textContent = `APPLIED_IN_SESSION: [${action.toUpperCase()}] ${subject}`;
    updateHUD();

    if (currentSession.session_id && !currentSession.session_id.startsWith('ZH-OFFLINE')) {
      fetch(`/api/demo/session/${currentSession.session_id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threat_id: threatId, action: action })
      }).catch(e => console.warn('Sync failed', e));
    }
  };

  game.onMissionEnd = (isVictory, results) => {
    if (isVictory) {
      debriefStatusTag.textContent = 'MISSION ACCOMPLISHED // INBOX PURIFIED';
      debriefStatusTag.className = 'modal-status color-cyan';
      debriefTitle.textContent = 'OPERATION SUCCESSFUL';
      debriefSummary.textContent = 'All unread email threat clusters have been eradicated from the sector.';
      window.soundFX.playUiClick();
    } else {
      debriefStatusTag.textContent = 'CRITICAL FAILURE // INBOX OVERWHELMED';
      debriefStatusTag.className = 'modal-status color-red';
      debriefTitle.textContent = 'OPERATION ABORTED';
      debriefSummary.textContent = 'Inbox integrity breached by unread spam saturation. Re-engage recommended.';
      window.soundFX.playAlarm();
    }

    statPurged.textContent = results.threatsPurged;
    statScore.textContent = results.score;
    statIntegrity.textContent = `${results.integrity}%`;

    modalDebrief.classList.remove('hidden');
  };

  btnDownloadXml.addEventListener('click', () => {
    window.soundFX.playUiClick();
    if (currentSession && currentSession.session_id && !currentSession.session_id.startsWith('ZH-OFFLINE')) {
      window.location.href = `/api/demo/session/${currentSession.session_id}/export/filters.xml`;
    } else {
      const xml = `<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom'><title>ZeroHour Client Rules</title><entry><title>Purged Rules</title></entry></feed>`;
      downloadFile(xml, 'filters.xml', 'application/xml');
    }
  });

  btnDownloadCsv.addEventListener('click', () => {
    window.soundFX.playUiClick();
    if (currentSession && currentSession.session_id && !currentSession.session_id.startsWith('ZH-OFFLINE')) {
      window.location.href = `/api/demo/session/${currentSession.session_id}/export/unsubscribe.csv`;
    } else {
      const csv = "ThreatID,Sender,Subject,UnsubscribeLink\nTHR-01,demo@spambot.org,Sample Newsletter,https://spambot.org/unsub";
      downloadFile(csv, 'unsubscribe.csv', 'text/csv');
    }
  });

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  btnRestartMission.addEventListener('click', () => {
    modalDebrief.classList.add('hidden');
    game.initSession(currentSession.threats);
    runMissionCountdown();
  });

  btnExitBriefing.addEventListener('click', () => {
    modalDebrief.classList.add('hidden');
    switchScreen(screenBriefing);
  });

  btnAbort.addEventListener('click', () => {
    game.stop();
    switchScreen(screenBriefing);
  });
});
