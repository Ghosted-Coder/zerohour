/**
 * ZEROHOUR 3D FIRST-PERSON SHOOTER ENGINE (ALCATRAZ ISLAND OPEN-WORLD)
 * Features:
 *  - 240m x 240m Open-Air Alcatraz Fortress Map (Cellhouse, Watchtowers, Courtyard, Ocean)
 *  - Tactical UAV Radar Minimap (Top-Left HUD)
 *  - Killstreak: [Q] Tactical EMP Shockwave (Stuns bots for 4.5s)
 *  - In-World 3D Floating Triage Combat Feedback
 *  - Wall Bullet Ricochet Sparks & Lighting
 */
class FPSGameEngine {
  constructor(canvasId, sound) {
    this.canvas = document.getElementById(canvasId);
    this.sound = sound;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.player = {
      position: new THREE.Vector3(0, 1.7, 45), // Spawns outside cellhouse in courtyard
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      ammoClip: 30,
      ammoReserve: 120,
      isSprinting: false,
      isADS: false,
      isReloading: false,
      isSliding: false,
      slideTimer: 0,
      slideDir: new THREE.Vector3(),
      canJump: true,
      shotsFired: 0,
      shotsHit: 0,
      empCharge: 0, // 0 to 100
    };

    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;
    this.difficulty = "veteran";
    this.totalThreatsCount = 0;

    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.mouse = { left: false, right: false };

    this.fireRate = 0.08;
    this.lastShotTime = 0;

    this.weaponRig = null;
    this.weaponBolt = null;
    this.redDotMesh = null;
    this.muzzleLight = null;
    this.flashlight = null;
    this.hipPos = new THREE.Vector3(0.2, -0.22, -0.45);
    this.adsPos = new THREE.Vector3(0.0, -0.07, -0.28);
    this.recoilOffset = 0;

    this.threats = [];
    this.enemies = [];
    this.boss = null;
    this.bossSpawned = false;
    this.wallBoxes = [];
    this.shockwaves = [];
    this.searchlights = [];
    this.floatingTexts = [];
    this.impactParticles = [];

    this.uavCanvas = document.getElementById("hud-uav-canvas");
    this.uavCtx = this.uavCanvas ? this.uavCanvas.getContext("2d") : null;
    this.uavSweepAngle = 0;

    this.onKillThreat = null;
    this.onMissionEnd = null;

    this.lastTime = performance.now();
    this.initThree();
    this.setupControls();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a101d); // Dark atmospheric island sky
    this.scene.fog = new THREE.FogExp2(0x0a101d, 0.008);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 350);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.7, 45);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // MOONLIGHT & ALCATRAZ LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(0xaaccff, 1.2);
    moonLight.position.set(60, 120, 60);
    this.scene.add(moonLight);

    this.buildAlcatrazMap();
    this.buildDetailedWeaponModel();

    window.addEventListener("resize", () => {
      if (!this.camera || !this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // MASSIVE COD ALCATRAZ ISLAND MAP BUILDER (240M X 240M)
  buildAlcatrazMap() {
    this.wallBoxes = [];
    this.searchlights = [];

    // 1. Island Terrain & Ocean
    const oceanGeo = new THREE.PlaneGeometry(350, 350);
    const oceanMat = new THREE.MeshStandardMaterial({ color: 0x050c18, roughness: 0.2, metalness: 0.8 });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.5;
    this.scene.add(ocean);

    const islandGeo = new THREE.PlaneGeometry(240, 240);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x181e26, roughness: 0.8, metalness: 0.2 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.rotation.x = -Math.PI / 2;
    this.scene.add(island);

    const addBoxObstacle = (x, z, w, d, h, color = 0x242e3c) => {
      const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.4 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, h / 2, z);
      this.scene.add(mesh);
      this.wallBoxes.push({
        min: { x: x - w / 2, z: z - d / 2 },
        max: { x: x + w / 2, z: z + d / 2 }
      });
      return mesh;
    };

    // 2. Main Penitentiary Cellhouse (Center Citadel)
    // Outer walls with door breaches
    addBoxObstacle(-18, 0, 2, 60, 10); // West wall
    addBoxObstacle(18, 0, 2, 60, 10);  // East wall
    addBoxObstacle(0, -30, 36, 2, 10); // North wall
    addBoxObstacle(-11, 30, 14, 2, 10); // South wall west segment
    addBoxObstacle(11, 30, 14, 2, 10);  // South wall east segment (breach in center at x=[-4, 4])

    // Cellhouse Roof / Helipad
    const roof = addBoxObstacle(0, 0, 38, 62, 0.6, 0x121720);
    roof.position.y = 10;

    // Interior Double-Stacked Server Vault Clusters
    for (let sz = -20; sz <= 20; sz += 8) {
      addBoxObstacle(-10, sz, 4, 1.6, 4.5, 0x161c28);
      addBoxObstacle(10, sz, 4, 1.6, 4.5, 0x161c28);
    }

    // 3. 4 Corner Guard Towers with Sweeping Searchlights
    const towerCoords = [
      [-65, -65], [65, -65], [-65, 65], [65, 65]
    ];
    towerCoords.forEach(([tx, tz]) => {
      // Guard tower cabin
      addBoxObstacle(tx, tz, 6, 6, 14, 0x222a36);
      
      // Sweeping searchlight spotlight
      const spot = new THREE.SpotLight(0xffffff, 3.5, 80, Math.PI / 6, 0.4, 1.2);
      spot.position.set(tx, 14.5, tz);
      const target = new THREE.Object3D();
      target.position.set(tx * 0.3, 0, tz * 0.3);
      this.scene.add(spot);
      this.scene.add(target);
      spot.target = target;
      this.searchlights.push({ spot, target, baseAngle: Math.random() * Math.PI * 2, cx: tx, cz: tz });
    });

    // 4. Courtyard Barricades & Chain-Link Fences
    addBoxObstacle(-35, 20, 1.2, 30, 2.5, 0x334155);
    addBoxObstacle(35, 20, 1.2, 30, 2.5, 0x334155);
    addBoxObstacle(0, 60, 45, 1.2, 2.5, 0x334155); // Courtyard south wall

    // Concrete blast blocks
    for (let b = -40; b <= 40; b += 20) {
      if (Math.abs(b) < 10) continue;
      addBoxObstacle(b, 35, 3.5, 1.4, 1.5, 0x475569);
    }
  }

  buildDetailedWeaponModel() {
    this.weaponRig = new THREE.Group();

    const matDark = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.3, metalness: 0.85 });
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.25, metalness: 0.9 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.7 });

    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.08, 0.36), matDark);
    this.weaponRig.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.3), matDark);
    upper.position.set(0, 0.055, -0.04);
    this.weaponRig.add(upper);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.065, 0.28), matSteel);
    handguard.position.set(0, 0.02, -0.28);
    this.weaponRig.add(handguard);

    const afg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), matGrip);
    afg.position.set(0, -0.035, -0.26);
    afg.rotation.x = -0.3;
    this.weaponRig.add(afg);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 12), matSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.42);
    this.weaponRig.add(barrel);

    const muzzleHider = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.06, 12), matDark);
    muzzleHider.rotation.x = Math.PI / 2;
    muzzleHider.position.set(0, 0.025, -0.63);
    this.weaponRig.add(muzzleHider);

    this.weaponBolt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.08), matSteel);
    this.weaponBolt.position.set(0.028, 0.055, -0.04);
    this.weaponRig.add(this.weaponBolt);

    const sightHood = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.052, 0.09), matGrip);
    sightHood.position.set(0, 0.095, -0.05);
    this.weaponRig.add(sightHood);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.034), new THREE.MeshBasicMaterial({ color: 0x112233, transparent: true, opacity: 0.35 }));
    glass.position.set(0, 0.095, -0.09);
    this.weaponRig.add(glass);

    const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    this.redDotMesh = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 16), redDotMat);
    this.redDotMesh.position.set(0, 0.095, -0.091);
    this.weaponRig.add(this.redDotMesh);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.19, 0.08), matDark);
    mag.position.set(0, -0.11, -0.04);
    mag.rotation.x = 0.22;
    this.weaponRig.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.18), matGrip);
    stock.position.set(0, -0.01, 0.24);
    this.weaponRig.add(stock);

    this.flashlight = new THREE.SpotLight(0xddeeff, 2.8, 50, Math.PI / 4, 0.35, 1.2);
    this.flashlight.position.set(0.05, 0.02, -0.42);
    this.weaponRig.add(this.flashlight);

    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 18);
    this.muzzleLight.position.set(0, 0.025, -0.66);
    this.weaponRig.add(this.muzzleLight);

    this.weaponRig.position.copy(this.hipPos);
    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
  }

  checkObstacleCollision(posX, posZ, radius = 0.55) {
    const checkMinX = posX - radius;
    const checkMaxX = posX + radius;
    const checkMinZ = posZ - radius;
    const checkMaxZ = posZ + radius;

    for (let i = 0; i < this.wallBoxes.length; i++) {
      const b = this.wallBoxes[i];
      if (checkMaxX > b.min.x && checkMinX < b.max.x &&
          checkMaxZ > b.min.z && checkMinZ < b.max.z) {
        return true;
      }
    }
    // Alcatraz island boundaries
    if (posX < -110 || posX > 110 || posZ < -110 || posZ > 110) return true;
    return false;
  }

  setupControls() {
    window.addEventListener("keydown", (e) => {
      if (this.sound) this.sound.init();
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = true;
      if (k === "a") this.keys.a = true;
      if (k === "s") this.keys.s = true;
      if (k === "d") this.keys.d = true;
      if (e.shiftKey) this.keys.shift = true;

      // [Q] TRIGGER TACTICAL EMP SHOCKWAVE
      if (k === "q") {
        this.triggerEmpShockwave();
      }

      if ((k === "c" || e.code === "ControlLeft" || e.code === "ControlRight") && !this.player.isSliding) {
        this.triggerSlide();
      }

      if (e.code === "Space" && this.player.canJump && !this.player.isSliding) {
        this.player.velocity.y = 6.5;
        this.player.canJump = false;
      }
      if (k === "r") this.reload();
    });

    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = false;
      if (k === "a") this.keys.a = false;
      if (k === "s") this.keys.s = false;
      if (k === "d") this.keys.d = false;
      if (!e.shiftKey) this.keys.shift = false;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isLocked) return;
      const sensitivity = 0.002;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      const maxPitch = Math.PI / 2.18;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    window.addEventListener("mousedown", (e) => {
      if (this.sound) this.sound.init();
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.mouse.left = true;
        this.shoot();
      }
      if (e.button === 2) this.player.isADS = true;
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.player.isADS = false;
    });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // TACTICAL EMP SHOCKWAVE ABILITY
  triggerEmpShockwave() {
    if (this.player.empCharge < 100) return;
    this.player.empCharge = 0;
    this.updateEmpMeter();

    if (this.sound) this.sound.playEmpBlast();

    const flash = document.getElementById("emp-flash");
    if (flash) {
      flash.classList.remove("hidden");
      setTimeout(() => flash.classList.add("hidden"), 600);
    }

    // Stun all enemies within 45m radius
    this.enemies.forEach(en => {
      const dist = en.mesh.position.distanceTo(this.player.position);
      if (dist < 45) {
        en.isStunned = true;
        en.stunTimer = 4.5;
        this.createFloatingTriageText(en.mesh.position, "⚡ EMP STUNNED (-50% DEFENSE)");
      }
    });
  }

  updateEmpMeter() {
    const fill = document.getElementById("emp-fill");
    const status = document.getElementById("emp-status");
    if (fill) fill.style.width = this.player.empCharge + "%";
    if (status) {
      if (this.player.empCharge >= 100) {
        status.textContent = "READY!";
        status.className = "emp-status emp-ready";
      } else {
        status.textContent = Math.round(this.player.empCharge) + "%";
        status.className = "emp-status";
      }
    }
  }

  triggerSlide() {
    const isMoving = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
    if (!isMoving || !this.player.canJump) return;

    this.player.isSliding = true;
    this.player.slideTimer = 0.65;
    if (this.sound) this.sound.playSlide();

    const moveDir = new THREE.Vector3();
    if (this.keys.w) moveDir.z -= 1;
    if (this.keys.s) moveDir.z += 1;
    if (this.keys.a) moveDir.x -= 1;
    if (this.keys.d) moveDir.x += 1;
    moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    this.player.slideDir.copy(moveDir);
  }

  // SCATTER ENEMIES ACROSS ALCATRAZ ISLAND
  loadSession(threats, diff = "veteran") {
    this.threats = threats || [];
    this.difficulty = (diff || "veteran").toLowerCase();
    this.enemies.forEach(en => this.scene.remove(en.mesh));
    this.enemies = [];
    if (this.boss) {
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
    this.bossSpawned = false;

    const targetCounts = { recruit: 16, veteran: 24, elite: 32 };
    const requiredNum = targetCounts[this.difficulty] || 24;

    while (this.threats.length < requiredNum) {
      const idx = this.threats.length + 1;
      this.threats.push({
        id: "THR-BOT-" + String(idx).padStart(3, "0"),
        sender: "Cyber Drone #" + idx,
        sender_email: "drone-" + idx + "@alcatraz-threat.org",
        subject: "Alcatraz Breach Vector #" + idx,
        category: ["phishing", "spam", "promotions", "newsletter"][idx % 4],
        threat_level: (idx % 5) + 1
      });
    }

    this.totalThreatsCount = this.threats.length;

    // Scatter throughout Alcatraz yard and cellhouse
    this.threats.forEach((th, i) => {
      const angle = (i / this.threats.length) * Math.PI * 2;
      const radius = 25 + ((i * 9) % 55); // Scattered up to 80m across island
      let ex = Math.cos(angle) * radius;
      let ez = Math.sin(angle) * radius;

      let attempts = 0;
      while (this.checkObstacleCollision(ex, ez, 0.7) && attempts < 10) {
        ex += (Math.random() - 0.5) * 6;
        ez += (Math.random() - 0.5) * 6;
        attempts++;
      }

      const enemyMesh = this.createSoldierMesh(th.category, false);
      enemyMesh.position.set(ex, 0, ez);
      this.scene.add(enemyMesh);

      this.enemies.push({
        id: th.id,
        subject: th.subject,
        sender: th.sender,
        mesh: enemyMesh,
        health: 80,
        maxHealth: 80,
        isBoss: false,
        isStunned: false,
        stunTimer: 0,
        lastAttack: 0,
        threatLevel: th.threat_level || 3
      });
    });

    this.updateHudCounter();
  }

  updateHudCounter() {
    const activeRemaining = this.enemies.length;
    const neutralized = this.totalThreatsCount - activeRemaining;
    const hudObj = document.getElementById("hud-objective-text");
    if (hudObj) {
      hudObj.textContent = "ALCATRAZ THREATS: " + activeRemaining + " ACTIVE [ " + neutralized + " / " + this.totalThreatsCount + " PURGED ]";
    }
  }

  // RENDER TACTICAL COD UAV MINIMAP (TOP-LEFT RADAR)
  renderUavRadar() {
    if (!this.uavCtx) return;
    const ctx = this.uavCtx;
    const size = 130;
    const center = size / 2;
    const radarRange = 65; // meters

    ctx.clearRect(0, 0, size, size);

    // Radar background grid & rings
    ctx.strokeStyle = "rgba(0, 255, 204, 0.25)";
    ctx.lineWidth = 1;
    [20, 40, 60].forEach(r => {
      ctx.beginPath();
      ctx.arc(center, center, (r / radarRange) * (size / 2), 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(center, 4); ctx.lineTo(center, size - 4);
    ctx.moveTo(4, center); ctx.lineTo(size - 4, center);
    ctx.stroke();

    // Rotating Sweep line
    this.uavSweepAngle += 0.045;
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(this.uavSweepAngle);
    const grad = ctx.createLinearGradient(0, 0, center, 0);
    grad.addColorStop(0, "rgba(0, 255, 204, 0.6)");
    grad.addColorStop(1, "rgba(0, 255, 204, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, center - 2, 0, 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw enemy blips on radar
    this.enemies.forEach(en => {
      const dx = en.mesh.position.x - this.player.position.x;
      const dz = en.mesh.position.z - this.player.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < radarRange) {
        const rx = center + (dx / radarRange) * (size / 2);
        const ry = center + (dz / radarRange) * (size / 2);

        if (en.isBoss) {
          // Boss Skull / Diamond
          ctx.fillStyle = "#ff0033";
          ctx.beginPath();
          ctx.arc(rx, ry, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        } else {
          // Regular Red Bot Blip
          ctx.fillStyle = "#ff3344";
          ctx.beginPath();
          ctx.arc(rx, ry, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Draw Player Green Chevron in Center
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-this.yaw);
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  createSoldierMesh(cat, isBoss = false) {
    const group = new THREE.Group();
    const scale = isBoss ? 2.3 : 1.0;
    const visorColor = isBoss ? 0xff0022 : (cat === "phishing" ? 0xff2244 : 0x00e1ff);

    const camoMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0x08090d : 0x1a212b, roughness: 0.4 });
    const vestMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0x1f0408 : 0x10141a, roughness: 0.3, metalness: 0.5 });
    const armorPlateMat = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.95, roughness: 0.15 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x333a44 });
    const meleeWeaponMat = new THREE.MeshStandardMaterial({ color: 0xdde4ec, metalness: 0.95, roughness: 0.1 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.74 * scale, 0.35 * scale), camoMat);
    torso.position.y = 1.1 * scale;
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.6 * scale, 0.38 * scale), vestMat);
    vest.position.y = 1.15 * scale;
    group.add(vest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 16, 16), skinMat);
    head.position.y = 1.64 * scale;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.235 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), vestMat);
    helmet.position.y = 1.67 * scale;
    group.add(helmet);

    const visorCenter = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.08 * scale, 0.12 * scale), new THREE.MeshBasicMaterial({ color: visorColor }));
    visorCenter.position.set(0, 1.65 * scale, 0.18 * scale);
    group.add(visorCenter);

    const bladeArm = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.09 * scale, 0.72 * scale), meleeWeaponMat);
    bladeArm.position.set(0.26 * scale, 1.05 * scale, 0.32 * scale);
    bladeArm.rotation.x = 0.35;
    group.add(bladeArm);

    const legGeo = new THREE.BoxGeometry(0.2 * scale, 0.75 * scale, 0.22 * scale);
    const leftLeg = new THREE.Mesh(legGeo, camoMat);
    leftLeg.position.set(-0.16 * scale, 0.38 * scale, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, camoMat);
    rightLeg.position.set(0.16 * scale, 0.38 * scale, 0);
    group.add(rightLeg);

    group.userData = { leftLeg, rightLeg, bladeArm, animPhase: Math.random() * Math.PI, isBoss };
    return group;
  }

  spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;

    if (this.sound) {
      this.sound.playBossAlert();
      this.sound.startBossBattleMusic();
    }

    const bossMesh = this.createSoldierMesh("phishing", true);
    bossMesh.position.set(0, 0, -10); // Spawns inside center cellhouse
    this.scene.add(bossMesh);

    this.boss = {
      id: "BOSS-TITAN",
      subject: "CYBER-JUGGERNAUT // TITAN-01 [ROOT PROTOCOL]",
      mesh: bossMesh,
      health: 700,
      maxHealth: 700,
      isBoss: true,
      isStunned: false,
      stunTimer: 0,
      lastAttack: 0,
      threatLevel: 5
    };
    this.enemies.push(this.boss);
    this.totalThreatsCount += 1;

    const bBar = document.getElementById("boss-hud-bar");
    if (bBar) bBar.classList.remove("hidden");
    this.updateHudCounter();
  }

  createShockwave(pos) {
    const geo = new THREE.RingGeometry(0.5, 1.2, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1133, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.05, pos.z);
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, scale: 1.0, opacity: 0.9 });
  }

  // IN-WORLD 3D FLOATING TRIAGE TEXT FEEDBACK
  createFloatingTriageText(pos, textStr) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, 320, 64);
    ctx.strokeStyle = "#00ffcc";
    ctx.strokeRect(2, 2, 316, 60);
    ctx.fillStyle = "#00ffcc";
    ctx.font = "bold 20px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(textStr, 160, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(pos.x, pos.y + 2.2, pos.z);
    sprite.scale.set(3.5, 0.7, 1);
    this.scene.add(sprite);

    this.floatingTexts.push({ sprite, timer: 1.4 });
  }

  // BULLET WALL RICOCHET IMPACT SPARKS
  createImpactSparks(point) {
    if (this.sound) this.sound.playRicochet();

    const pGeo = new THREE.BufferGeometry();
    const count = 10;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 0.4;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.08, transparent: true, opacity: 1.0 });
    const points = new THREE.Points(pGeo, pMat);
    points.position.copy(point);
    this.scene.add(points);
    this.impactParticles.push({ mesh: points, timer: 0.25 });
  }

  shoot() {
    if (this.player.isReloading) return;
    if (this.player.ammoClip <= 0) {
      this.reload();
      return;
    }

    this.player.ammoClip -= 1;
    this.player.shotsFired += 1;
    if (this.sound) this.sound.playGunshot(this.player.isADS);

    this.recoilOffset = 0.055;
    this.pitch += 0.011;
    if (this.weaponBolt) this.weaponBolt.position.z = 0.02;

    this.muzzleLight.intensity = 4.0;
    setTimeout(() => {
      this.muzzleLight.intensity = 0;
      if (this.weaponBolt) this.weaponBolt.position.z = -0.04;
    }, 35);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // 1. Check enemy hits
    const enemyMeshes = this.enemies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(enemyMeshes, true);

    if (intersects.length > 0) {
      this.player.shotsHit += 1;
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && !this.enemies.find(e => e.mesh === hitMesh)) {
        hitMesh = hitMesh.parent;
      }
      const targetEnemy = this.enemies.find(e => e.mesh === hitMesh);

      if (targetEnemy) {
        const damageDealt = targetEnemy.isStunned ? 55 : 35; // Bonus damage when EMP stunned!
        targetEnemy.health -= damageDealt;
        if (this.sound) this.sound.playHitmarker();
        this.showHitmarker(false);

        if (targetEnemy.isBoss) {
          const fill = document.getElementById("boss-bar-fill");
          if (fill) fill.style.width = Math.max(0, (targetEnemy.health / targetEnemy.maxHealth) * 100) + "%";
        }

        if (targetEnemy.health <= 0) {
          this.destroyEnemy(targetEnemy);
        }
      }
    } else {
      // 2. Wall ricochet impacts
      const sceneObjects = this.scene.children.filter(c => c !== this.camera && c !== this.weaponRig);
      const wallIntersects = raycaster.intersectObjects(sceneObjects, true);
      if (wallIntersects.length > 0 && wallIntersects[0].distance < 60) {
        this.createImpactSparks(wallIntersects[0].point);
      }
    }
  }

  showHitmarker(isKill) {
    const hm = document.getElementById("hitmarker");
    if (!hm) return;
    hm.className = isKill ? "hitmarker kill" : "hitmarker";
    setTimeout(() => { hm.className = "hitmarker hidden"; }, 80);
  }

  destroyEnemy(enemy) {
    this.showHitmarker(true);
    this.scene.remove(enemy.mesh);
    const idx = this.enemies.indexOf(enemy);
    if (idx > -1) this.enemies.splice(idx, 1);

    // Charge EMP Meter (+20% per kill)
    this.player.empCharge = Math.min(100, this.player.empCharge + 20);
    this.updateEmpMeter();

    // 3D Floating Feedback
    const label = `+150 EXP // ARCHIVED [${enemy.sender.substring(0, 14)}]`;
    this.createFloatingTriageText(enemy.mesh.position, label);

    if (enemy.isBoss) {
      const bBar = document.getElementById("boss-hud-bar");
      if (bBar) bBar.classList.add("hidden");
      if (this.sound) this.sound.stopBossBattleMusic();
    }

    this.updateHudCounter();

    if (this.onKillThreat) {
      const remaining = this.enemies.length;
      const neutralized = this.totalThreatsCount - remaining;
      this.onKillThreat(enemy.id, enemy.subject, neutralized, this.totalThreatsCount);
    }

    if (!this.bossSpawned && this.enemies.length <= Math.floor(this.totalThreatsCount / 2)) {
      this.spawnBoss();
    }

    if (this.enemies.length === 0) {
      this.triggerMissionEnd(true);
    }
  }

  reload() {
    if (this.player.isReloading || this.player.ammoClip === 30 || this.player.ammoReserve <= 0) return;
    this.player.isReloading = true;
    if (this.sound) this.sound.playReload();

    setTimeout(() => {
      const needed = 30 - this.player.ammoClip;
      const toLoad = Math.min(needed, this.player.ammoReserve);
      this.player.ammoClip += toLoad;
      this.player.ammoReserve -= toLoad;
      this.player.isReloading = false;
    }, 1100);
  }

  triggerMissionEnd(isVictory) {
    this.isLocked = false;
    if (this.sound) this.sound.stopBossBattleMusic();
    document.exitPointerLock();
    if (this.onMissionEnd) {
      const accuracy = this.player.shotsFired > 0 ? Math.round((this.player.shotsHit / this.player.shotsFired) * 100) : 0;
      this.onMissionEnd(isVictory, {
        purged: this.totalThreatsCount - this.enemies.length,
        accuracy: accuracy,
        health: Math.max(0, Math.round(this.player.health))
      });
    }
  }

  update(dt) {
    const now = performance.now() / 1000;

    if (!this.isLocked) return;

    if (this.mouse.left && !this.player.isReloading) {
      if (now - this.lastShotTime >= this.fireRate) {
        this.lastShotTime = now;
        this.shoot();
      }
    }

    let targetCameraY = 1.7;

    // Movement & Sliding
    if (this.player.isSliding) {
      targetCameraY = 0.85;
      this.player.slideTimer -= dt;
      const slideSpeed = 16.0 * (this.player.slideTimer / 0.65) + 3.0;

      const nextX = this.player.position.x + this.player.slideDir.x * slideSpeed * dt;
      if (!this.checkObstacleCollision(nextX, this.player.position.z, 0.45)) {
        this.player.position.x = nextX;
      }
      const nextZ = this.player.position.z + this.player.slideDir.z * slideSpeed * dt;
      if (!this.checkObstacleCollision(this.player.position.x, nextZ, 0.45)) {
        this.player.position.z = nextZ;
      }

      if (this.player.slideTimer <= 0) this.player.isSliding = false;
    } else {
      const speed = this.keys.shift ? 12.0 : 6.2;
      const moveDir = new THREE.Vector3();
      if (this.keys.w) moveDir.z -= 1;
      if (this.keys.s) moveDir.z += 1;
      if (this.keys.a) moveDir.x -= 1;
      if (this.keys.d) moveDir.x += 1;
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

      const nextX = this.player.position.x + moveDir.x * speed * dt;
      if (!this.checkObstacleCollision(nextX, this.player.position.z, 0.45)) {
        this.player.position.x = nextX;
      }
      const nextZ = this.player.position.z + moveDir.z * speed * dt;
      if (!this.checkObstacleCollision(this.player.position.x, nextZ, 0.45)) {
        this.player.position.z = nextZ;
      }
    }

    this.player.position.y += (targetCameraY - this.player.position.y) * 12 * dt;
    this.player.velocity.y -= 18 * dt;
    this.player.position.y += this.player.velocity.y * dt;

    if (this.player.position.y <= targetCameraY) {
      this.player.position.y = targetCameraY;
      this.player.velocity.y = 0;
      this.player.canJump = true;
    }

    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const swayX = Math.sin(now * 3) * 0.003;
    const swayY = Math.cos(now * 6) * 0.002;

    const targetPos = this.player.isADS ? this.adsPos : this.hipPos;
    if (this.weaponRig) {
      this.weaponRig.position.lerp(targetPos, 0.22);
      this.weaponRig.position.x += swayX;
      this.weaponRig.position.y += swayY;
      this.weaponRig.position.z += this.recoilOffset;
      this.recoilOffset *= 0.78;

      const targetRoll = this.player.isSliding ? 0.35 : 0;
      this.weaponRig.rotation.z += (targetRoll - this.weaponRig.rotation.z) * 10 * dt;
    }

    // Update Sweeping Watchtower Searchlights
    this.searchlights.forEach(sl => {
      sl.baseAngle += 0.4 * dt;
      sl.target.position.x = sl.cx * 0.3 + Math.sin(sl.baseAngle) * 35;
      sl.target.position.z = sl.cz * 0.3 + Math.cos(sl.baseAngle) * 35;
    });

    // Update Floating Triage Texts
    for (let f = this.floatingTexts.length - 1; f >= 0; f--) {
      const ft = this.floatingTexts[f];
      ft.sprite.position.y += 0.8 * dt;
      ft.timer -= dt;
      ft.sprite.material.opacity = Math.max(0, ft.timer / 1.4);
      if (ft.timer <= 0) {
        this.scene.remove(ft.sprite);
        this.floatingTexts.splice(f, 1);
      }
    }

    // Update Ricochet Particles
    for (let p = this.impactParticles.length - 1; p >= 0; p--) {
      const ip = this.impactParticles[p];
      ip.timer -= dt;
      ip.mesh.material.opacity = Math.max(0, ip.timer / 0.25);
      if (ip.timer <= 0) {
        this.scene.remove(ip.mesh);
        this.impactParticles.splice(p, 1);
      }
    }

    // Update Expanding Shockwaves
    for (let s = this.shockwaves.length - 1; s >= 0; s--) {
      const sw = this.shockwaves[s];
      sw.scale += 14 * dt;
      sw.opacity -= 0.9 * dt;
      sw.mesh.scale.set(sw.scale, sw.scale, 1);
      sw.mesh.material.opacity = Math.max(0, sw.opacity);

      const distToPlayer = this.player.position.distanceTo(sw.mesh.position);
      if (distToPlayer < sw.scale * 1.2 && distToPlayer > sw.scale * 0.8 && sw.opacity > 0.4) {
        this.player.health -= 15 * dt;
        this.showDamageVignette();
      }

      if (sw.opacity <= 0) {
        this.scene.remove(sw.mesh);
        this.shockwaves.splice(s, 1);
      }
    }

    // Enemy AI & Alcatraz Obstacle Navigation
    const timeMs = performance.now();
    const speedMap = { recruit: 3.8, veteran: 4.8, elite: 5.8 };
    const baseChaseSpeed = speedMap[this.difficulty] || 4.8;

    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];

      // Handle EMP Stun State
      if (en.isStunned) {
        en.stunTimer -= dt;
        if (en.stunTimer <= 0) en.isStunned = false;
        continue;
      }

      en.mesh.lookAt(this.player.position.x, 0, this.player.position.z);
      const dist = en.mesh.position.distanceTo(this.player.position);

      en.mesh.userData.animPhase += dt * (en.isBoss ? 4.5 : 8.5);
      const legAngle = Math.sin(en.mesh.userData.animPhase) * 0.45;
      en.mesh.userData.leftLeg.rotation.x = legAngle;
      en.mesh.userData.rightLeg.rotation.x = -legAngle;

      const attackRange = en.isBoss ? 3.5 : 2.2;
      const collisionRadius = en.isBoss ? 1.4 : 0.6;

      if (dist > attackRange) {
        const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
        toPlayer.y = 0;
        const currentSpeed = en.isBoss ? 3.2 : baseChaseSpeed;

        let canMoveX = false;
        let canMoveZ = false;

        const nextEnX = en.mesh.position.x + toPlayer.x * currentSpeed * dt;
        if (!this.checkObstacleCollision(nextEnX, en.mesh.position.z, collisionRadius)) {
          en.mesh.position.x = nextEnX;
          canMoveX = true;
        }

        const nextEnZ = en.mesh.position.z + toPlayer.z * currentSpeed * dt;
        if (!this.checkObstacleCollision(en.mesh.position.x, nextEnZ, collisionRadius)) {
          en.mesh.position.z = nextEnZ;
          canMoveZ = true;
        }

        if (!canMoveX && !canMoveZ) {
          const detX = en.mesh.position.x - toPlayer.z * currentSpeed * dt;
          const detZ = en.mesh.position.z + toPlayer.x * currentSpeed * dt;
          if (!this.checkObstacleCollision(detX, en.mesh.position.z, collisionRadius)) en.mesh.position.x = detX;
          if (!this.checkObstacleCollision(en.mesh.position.x, detZ, collisionRadius)) en.mesh.position.z = detZ;
        }
      } else {
        if (timeMs - en.lastAttack > (en.isBoss ? 1800 : 1100)) {
          en.lastAttack = timeMs;

          if (en.isBoss) {
            if (this.sound) this.sound.playBossSlam();
            this.createShockwave(en.mesh.position);
            this.player.health -= 30;
            this.showDamageVignette();
          } else {
            if (this.sound) this.sound.playMeleeStrike();
            const dmg = this.difficulty === "elite" ? 18 : 12;
            this.player.health -= dmg;
            this.showDamageVignette();
          }

          if (this.player.health <= 0) {
            this.triggerMissionEnd(false);
          }
        }
      }
    }

    if (this.player.health < this.player.maxHealth && this.player.health > 0) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 3.5 * dt);
    }
  }

  showDamageVignette() {
    const vig = document.getElementById("damage-vignette");
    if (!vig) return;
    vig.className = "damage-vignette hit";
    setTimeout(() => { vig.className = "damage-vignette"; }, 150);
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
      this.renderUavRadar();
    }
  }

  start() {
    const loop = (t) => {
      const dt = Math.min((t - this.lastTime) / 1000, 0.1);
      this.lastTime = t;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.FPSGameEngine = FPSGameEngine;
