class ShooterEngine {
  constructor(canvasId, soundEngine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.sound = soundEngine;

    this.running = false;
    this.paused = false;

    this.width = 0;
    this.height = 0;

    this.player = null;
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.combatTexts = [];

    this.keys = { w: false, a: false, s: false, d: false, space: false };
    this.mouse = { x: 0, y: 0, down: false };

    this.threatsRemaining = 0;
    this.totalThreats = 0;
    this.score = 0;
    this.inboxIntegrity = 100;
    this.lastFrameTime = 0;

    this.onTriageAction = null;
    this.onMissionEnd = null;

    this.setupListeners();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = this.canvas.width = rect.width;
    this.height = this.canvas.height = rect.height;
    if (this.player) {
      this.player.x = Math.min(this.player.x, this.width - 20);
      this.player.y = Math.min(this.player.y, this.height - 20);
    }
  }

  setupListeners() {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'arrowup'].includes(k)) this.keys.w = true;
      if (['a', 'arrowleft'].includes(k)) this.keys.a = true;
      if (['s', 'arrowdown'].includes(k)) this.keys.s = true;
      if (['d', 'arrowright'].includes(k)) this.keys.d = true;
      if (k === ' ' || k === 'spacebar') {
        this.keys.space = true;
        this.firePrimary();
      }
      if (k === 'e') {
        this.fireArchive();
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'arrowup'].includes(k)) this.keys.w = false;
      if (['a', 'arrowleft'].includes(k)) this.keys.a = false;
      if (['s', 'arrowdown'].includes(k)) this.keys.s = false;
      if (['d', 'arrowright'].includes(k)) this.keys.d = false;
      if (k === ' ' || k === 'spacebar') this.keys.space = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.firePrimary();
      } else if (e.button === 2) {
        e.preventDefault();
        this.fireArchive();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  initSession(threatDataset) {
    this.resize();
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.combatTexts = [];
    this.score = 0;
    this.inboxIntegrity = 100;

    this.player = {
      x: this.width / 2,
      y: this.height / 2,
      radius: 16,
      angle: 0,
      speed: 4.5,
      lastFire: 0,
      fireRate: 220
    };

    this.totalThreats = threatDataset.length;
    this.threatsRemaining = threatDataset.length;

    threatDataset.forEach((threat, i) => {
      const angle = (i / threatDataset.length) * (Math.PI * 2);
      const spawnDist = Math.max(this.width, this.height) * 0.45 + (i * 20);
      const ex = (this.width / 2) + Math.cos(angle) * spawnDist;
      const ey = (this.height / 2) + Math.sin(angle) * spawnDist;

      this.enemies.push({
        id: threat.id,
        sender: threat.sender,
        subject: threat.subject,
        category: threat.category,
        threatLevel: threat.threat_level,
        x: ex,
        y: ey,
        radius: 18 + (threat.threat_level * 2),
        hp: threat.threat_level * 15,
        maxHp: threat.threat_level * 15,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        color: this.getCategoryColor(threat.category)
      });
    });
  }

  getCategoryColor(cat) {
    switch (cat) {
      case 'phishing': return '#ff3366';
      case 'spam': return '#ffb700';
      case 'newsletter': return '#00ffcc';
      default: return '#3399ff';
    }
  }

  firePrimary() {
    if (!this.running || this.paused) return;
    const now = Date.now();
    if (now - this.player.lastFire < this.player.fireRate) return;
    this.player.lastFire = now;

    const angle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);
    this.bullets.push({
      x: this.player.x + Math.cos(angle) * 20,
      y: this.player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 14,
      vy: Math.sin(angle) * 14,
      radius: 3.5,
      action: 'purge',
      color: '#00ffcc',
      life: 60
    });

    this.sound.playLaser();
  }

  fireArchive() {
    if (!this.running || this.paused) return;
    const now = Date.now();
    if (now - this.player.lastFire < this.player.fireRate) return;
    this.player.lastFire = now;

    const angle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);
    this.bullets.push({
      x: this.player.x + Math.cos(angle) * 20,
      y: this.player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 11,
      vy: Math.sin(angle) * 11,
      radius: 5,
      action: 'archive',
      color: '#3399ff',
      life: 60
    });

    this.sound.playLaser();
  }

  start() {
    this.running = true;
    this.paused = false;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  loop(timestamp) {
    if (!this.running) return;
    this.update();
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update() {
    if (this.paused) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.w) dy -= 1;
    if (this.keys.s) dy += 1;
    if (this.keys.a) dx -= 1;
    if (this.keys.d) dx += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    this.player.x += dx * this.player.speed;
    this.player.y += dy * this.player.speed;

    this.player.x = Math.max(20, Math.min(this.width - 20, this.player.x));
    this.player.y = Math.max(20, Math.min(this.height - 20, this.player.y));

    this.player.angle = Math.atan2(this.mouse.y - this.player.y, this.mouse.x - this.player.x);

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life -= 1;
      if (b.life <= 0 || b.x < 0 || b.x > this.width || b.y < 0 || b.y > this.height) {
        this.bullets.splice(i, 1);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      const toPlayerAngle = Math.atan2(this.player.y - en.y, this.player.x - en.x);
      en.x += Math.cos(toPlayerAngle) * 0.65 + en.vx;
      en.y += Math.sin(toPlayerAngle) * 0.65 + en.vy;

      const distPlayer = Math.hypot(this.player.x - en.x, this.player.y - en.y);
      if (distPlayer < this.player.radius + en.radius) {
        this.inboxIntegrity -= 0.15;
        if (Math.random() < 0.05) this.sound.playAlarm();
      }

      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        const dist = Math.hypot(b.x - en.x, b.y - en.y);

        if (dist < en.radius + b.radius) {
          const dmg = b.action === 'purge' ? 25 : 15;
          en.hp -= dmg;
          this.bullets.splice(j, 1);
          this.createHitParticles(b.x, b.y, b.color);

          if (en.hp <= 0) {
            this.destroyEnemy(i, b.action);
            break;
          }
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.03;
      if (p.alpha <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.combatTexts.length - 1; i >= 0; i--) {
      const txt = this.combatTexts[i];
      txt.y -= 0.6;
      txt.alpha -= 0.02;
      if (txt.alpha <= 0) this.combatTexts.splice(i, 1);
    }

    if (this.enemies.length === 0 && this.totalThreats > 0) {
      this.triggerMissionEnd(true);
    } else if (this.inboxIntegrity <= 0) {
      this.inboxIntegrity = 0;
      this.triggerMissionEnd(false);
    }
  }

  createHitParticles(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 3 + 1;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        radius: Math.random() * 2 + 1,
        alpha: 1
      });
    }
  }

  destroyEnemy(index, action) {
    const en = this.enemies[index];
    this.enemies.splice(index, 1);
    this.threatsRemaining -= 1;
    this.score += en.threatLevel * 100;

    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const s = Math.random() * 4 + 2;
      this.particles.push({
        x: en.x, y: en.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: en.color,
        radius: Math.random() * 3 + 2,
        alpha: 1
      });
    }

    this.combatTexts.push({
      x: en.x,
      y: en.y - 20,
      text: `${action.toUpperCase()}: ${en.subject.substring(0, 24)}...`,
      color: action === 'purge' ? '#ff3366' : '#3399ff',
      alpha: 1
    });

    this.sound.playExplosion();

    if (this.onTriageAction) {
      this.onTriageAction(en.id, action, en.subject);
    }
  }

  triggerMissionEnd(isVictory) {
    this.stop();
    if (this.onMissionEnd) {
      this.onMissionEnd(isVictory, {
        score: this.score,
        threatsPurged: this.totalThreats - this.threatsRemaining,
        totalThreats: this.totalThreats,
        integrity: Math.max(0, Math.round(this.inboxIntegrity))
      });
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 255, 204, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.42, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();

    this.enemies.forEach(en => {
      this.ctx.save();
      this.ctx.strokeStyle = en.color;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(en.x - en.radius, en.y - en.radius, en.radius * 2, en.radius * 2);

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '10px "JetBrains Mono"';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(en.subject.substring(0, 18), en.x, en.y - en.radius - 8);

      const hpWidth = en.radius * 2;
      const hpPct = en.hp / en.maxHp;
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
      this.ctx.fillRect(en.x - en.radius, en.y - en.radius - 6, hpWidth, 3);
      this.ctx.fillStyle = en.color;
      this.ctx.fillRect(en.x - en.radius, en.y - en.radius - 6, hpWidth * hpPct, 3);
      this.ctx.restore();
    });

    this.bullets.forEach(b => {
      this.ctx.save();
      this.ctx.fillStyle = b.color;
      this.ctx.shadowColor = b.color;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });

    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });

    this.combatTexts.forEach(txt => {
      this.ctx.save();
      this.ctx.globalAlpha = txt.alpha;
      this.ctx.fillStyle = txt.color;
      this.ctx.font = '11px "Chakra Petch"';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(txt.text, txt.x, txt.y);
      this.ctx.restore();
    });

    if (this.player) {
      this.ctx.save();
      this.ctx.translate(this.player.x, this.player.y);
      this.ctx.rotate(this.player.angle);

      this.ctx.strokeStyle = '#00ffcc';
      this.ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(18, 0);
      this.ctx.lineTo(-12, -10);
      this.ctx.lineTo(-6, 0);
      this.ctx.lineTo(-12, 10);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      if (this.keys.w || this.keys.a || this.keys.s || this.keys.d) {
        this.ctx.fillStyle = '#ffb700';
        this.ctx.beginPath();
        this.ctx.moveTo(-7, -4);
        this.ctx.lineTo(-18 - Math.random() * 8, 0);
        this.ctx.lineTo(-7, 4);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }
}

window.ShooterEngine = ShooterEngine;
