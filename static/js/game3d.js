/**
 * ZEROHOUR 3D FIRST-PERSON SHOOTER ENGINE (ALCATRAZ ISLAND OPEN-WORLD)
 * Upgrades:
 *  - Continuous Penetration Physics (resolveBoxCollision: NO ENEMY OR PLAYER PHASING)
 *  - Raycast Line-of-Sight: Walls block bullets and enemy vision
 *  - Rifleman 2-Second Aim Timer & Dodge Window:
 *      * Max range 35m
 *      * Must see player continuously for 2.0s before firing
 *      * Firing can be dodged with SLIDE (C / Ctrl)
 *  - Procedural Weathered Concrete & Metal Alcatraz Map Textures
 *  - 800 HP Stomp Boss (5s player stun) & 200 Starting Ammo
 */
class FPSGameEngine {
  constructor(canvasId, sound) {
    this.canvas = document.getElementById(canvasId);
    this.sound = sound;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.player = {
      position: new THREE.Vector3(0, 1.7, 42),
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      ammoClip: 30,
      ammoReserve: 200,
      isSprinting: false,
      isADS: false,
      isReloading: false,
      isSliding: false,
      slideTimer: 0,
      slideDir: new THREE.Vector3(),
      canJump: true,
      isStunned: false,
      stunTimer: 0,
      shotsFired: 0,
      shotsHit: 0,
      empCharge: 0,
    };

    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;
    this.difficulty = "veteran";
    this.weatherType = "spring";
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
    this.weatherParticles = null;
    this.treeMeshes = [];

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
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.7, 42);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xaaccff, 1.4);
    this.sunLight.position.set(60, 120, 60);
    this.scene.add(this.sunLight);

    this.buildAlcatrazMap();
    this.buildDetailedWeaponModel();
    this.applyWeather(this.weatherType);

    window.addEventListener("resize", () => {
      if (!this.camera || !this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // 4 DYNAMIC WEATHER RIGS
  applyWeather(type) {
    this.weatherType = type;
    if (this.weatherParticles) {
      this.scene.remove(this.weatherParticles);
      this.weatherParticles = null;
    }
    this.treeMeshes.forEach(t => this.scene.remove(t));
    this.treeMeshes = [];

    if (type === "sunny") {
      this.scene.background = new THREE.Color(0x3a6b9f);
      this.scene.fog = new THREE.FogExp2(0x5a8bbf, 0.003);
      this.ambientLight.color.setHex(0xfffae8);
      this.ambientLight.intensity = 2.4;
      this.sunLight.color.setHex(0xfff5cc);
      this.sunLight.intensity = 2.2;
    }
    else if (type === "rainy") {
      this.scene.background = new THREE.Color(0x0a1018);
      this.scene.fog = new THREE.FogExp2(0x0e1722, 0.015);
      this.ambientLight.color.setHex(0x50657a);
      this.ambientLight.intensity = 1.3;
      this.sunLight.intensity = 0.6;
      this.createRainSystem();
    }
    else if (type === "spring") {
      this.scene.background = new THREE.Color(0x2a507a);
      this.scene.fog = new THREE.FogExp2(0x3a6088, 0.004);
      this.ambientLight.color.setHex(0xfafae8);
      this.ambientLight.intensity = 2.1;
      this.sunLight.color.setHex(0xfff0d0);
      this.sunLight.intensity = 1.8;
      this.spawnCourtyardTrees();
    }
    else if (type === "snow") {
      this.scene.background = new THREE.Color(0x8da4bc);
      this.scene.fog = new THREE.FogExp2(0xb0c2d4, 0.014);
      this.ambientLight.color.setHex(0xe8f0f8);
      this.ambientLight.intensity = 2.0;
      this.sunLight.intensity = 1.0;
      this.createSnowSystem();
    }
  }

  spawnCourtyardTrees() {
    const treeCoords = [
      [-30, 45], [-45, 25], [30, 45], [45, 25],
      [-50, -20], [50, -20], [-40, -45], [40, -45]
    ];
    treeCoords.forEach(([tx, tz]) => {
      const group = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.0, 8), trunkMat);
      trunk.position.y = 2.0;
      group.add(trunk);

      const leafMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.6 });
      [3.8, 5.2, 6.4].forEach((ly, idx) => {
        const radius = 2.4 - idx * 0.6;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(radius, 2.0, 8), leafMat);
        leaves.position.y = ly;
        group.add(leaves);
      });

      group.position.set(tx, 0, tz);
      this.scene.add(group);
      this.treeMeshes.push(group);
      this.wallBoxes.push({
        min: { x: tx - 0.6, z: tz - 0.6 },
        max: { x: tx + 0.6, z: tz + 0.6 }
      });
    });
  }

  createRainSystem() {
    const count = 1600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 220;
      pos[i + 1] = Math.random() * 45;
      pos[i + 2] = (Math.random() - 0.5) * 220;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x88bbdd, size: 0.25, transparent: true, opacity: 0.65 });
    this.weatherParticles = new THREE.Points(geo, mat);
    this.scene.add(this.weatherParticles);
  }

  createSnowSystem() {
    const count = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 220;
      pos[i + 1] = Math.random() * 45;
      pos[i + 2] = (Math.random() - 0.5) * 220;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.45, transparent: true, opacity: 0.85 });
    this.weatherParticles = new THREE.Points(geo, mat);
    this.scene.add(this.weatherParticles);
  }

  // ALCATRAZ OPEN-WORLD MAP WITH PHYSICAL THICK WALLS & ARCHWAYS
  buildAlcatrazMap() {
    this.wallBoxes = [];
    this.searchlights = [];

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x060e1a, roughness: 0.2, metalness: 0.8 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.5;
    this.scene.add(ocean);

    const island = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x1a212a, roughness: 0.8, metalness: 0.2 }));
    island.rotation.x = -Math.PI / 2;
    this.scene.add(island);

    const addBoxObstacle = (x, z, w, d, h, color = 0x2b384a, isRoof = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 }));
      mesh.position.set(x, isRoof ? 10 : h / 2, z);
      this.scene.add(mesh);

      // Add to solid collision list
      if (!isRoof) {
        this.wallBoxes.push({
          min: { x: x - w / 2, z: z - d / 2 },
          max: { x: x + w / 2, z: z + d / 2 }
        });
      }
      return mesh;
    };

    // CELLHOUSE WALLS WITH 8M WIDE ARCHWAYS (North, South, East, West)
    addBoxObstacle(-11, 30, 14, 3, 10); // South wall west
    addBoxObstacle(11, 30, 14, 3, 10);  // South wall east (x=[-4, 4] is open archway)

    addBoxObstacle(-11, -30, 14, 3, 10); // North wall west
    addBoxObstacle(11, -30, 14, 3, 10);  // North wall east (x=[-4, 4] is open archway)

    addBoxObstacle(-18, -17, 3, 26, 10); // West wall north
    addBoxObstacle(-18, 17, 3, 26, 10);  // West wall south (z=[-4, 4] is open archway)

    addBoxObstacle(18, -17, 3, 26, 10);  // East wall north
    addBoxObstacle(18, 17, 3, 26, 10);   // East wall south (z=[-4, 4] is open archway)

    // Cellhouse Roof (Exempt from 2D collision so players enter freely)
    addBoxObstacle(0, 0, 39, 63, 0.8, 0x141a24, true);

    // Interior Server Racks
    for (let sz = -18; sz <= 18; sz += 9) {
      addBoxObstacle(-12, sz, 3, 1.8, 4.5, 0x161c28);
      addBoxObstacle(12, sz, 3, 1.8, 4.5, 0x161c28);
    }

    // 4 Corner Guard Towers
    [[-65, -65], [65, -65], [-65, 65], [65, 65]].forEach(([tx, tz]) => {
      addBoxObstacle(tx, tz, 6, 6, 14, 0x222a36);
      const spot = new THREE.SpotLight(0xffffff, 3.5, 85, Math.PI / 6, 0.4, 1.2);
      spot.position.set(tx, 14.5, tz);
      const target = new THREE.Object3D();
      target.position.set(tx * 0.3, 0, tz * 0.3);
      this.scene.add(spot);
      this.scene.add(target);
      spot.target = target;
      this.searchlights.push({ spot, target, baseAngle: Math.random() * Math.PI * 2, cx: tx, cz: tz });
    });

    // Courtyard Perimeter Barricades
    addBoxObstacle(-35, 20, 2.0, 30, 2.5, 0x334155);
    addBoxObstacle(35, 20, 2.0, 30, 2.5, 0x334155);
    addBoxObstacle(0, 65, 45, 2.0, 2.5, 0x334155);

    for (let b = -40; b <= 40; b += 20) {
      if (Math.abs(b) < 10) continue;
      addBoxObstacle(b, 48, 3.5, 2.0, 1.5, 0x475569);
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

  // 1. ANTI-PHASING CONTINUOUS PENETRATION RESOLVER
  resolveBoxCollision(pos, radius = 0.6) {
    for (let i = 0; i < this.wallBoxes.length; i++) {
      const b = this.wallBoxes[i];
      if (pos.x + radius > b.min.x && pos.x - radius < b.max.x &&
          pos.z + radius > b.min.z && pos.z - radius < b.max.z) {
        
        // Push out along minimum overlap axis immediately
        const pushLeft = (pos.x + radius) - b.min.x;
        const pushRight = b.max.x - (pos.x - radius);
        const pushTop = (pos.z + radius) - b.min.z;
        const pushBottom = b.max.z - (pos.z - radius);
        const minOverlap = Math.min(pushLeft, pushRight, pushTop, pushBottom);

        if (minOverlap === pushLeft) pos.x = b.min.x - radius - 0.02;
        else if (minOverlap === pushRight) pos.x = b.max.x + radius + 0.02;
        else if (minOverlap === pushTop) pos.z = b.min.z - radius - 0.02;
        else if (minOverlap === pushBottom) pos.z = b.max.z + radius + 0.02;
      }
    }
    // Perimeter boundaries
    if (pos.x < -110) pos.x = -110;
    if (pos.x > 110) pos.x = 110;
    if (pos.z < -110) pos.z = -110;
    if (pos.z > 110) pos.z = 110;
  }

  // 2. RAYCAST LINE-OF-SIGHT (WALLS BLOCK SNIPER BULLETS & VISION)
  hasLineOfSight(posA, posB) {
    const dir = new THREE.Vector3().subVectors(posB, posA);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Ray(posA, dir);

    for (let i = 0; i < this.wallBoxes.length; i++) {
      const b = this.wallBoxes[i];
      const box3 = new THREE.Box3(
        new THREE.Vector3(b.min.x, 0, b.min.z),
        new THREE.Vector3(b.max.x, 10, b.max.z)
      );
      const hit = ray.intersectBox(box3, new THREE.Vector3());
      if (hit && posA.distanceTo(hit) < dist - 0.8) {
        return false; // Solid obstacle blocks the path!
      }
    }
    return true;
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

      if (k === "q") this.triggerEmpShockwave();

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

    this.enemies.forEach(en => {
      const dist = en.mesh.position.distanceTo(this.player.position);
      if (dist < 50) {
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

  loadSession(threats, diff = "veteran", weather = "spring") {
    this.threats = threats || [];
    this.difficulty = (diff || "veteran").toLowerCase();
    this.applyWeather(weather || this.weatherType);

    this.enemies.forEach(en => this.scene.remove(en.mesh));
    this.enemies = [];
    if (this.boss) {
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
    this.bossSpawned = false;

    // 200 AMMO IN EVERY DIFFICULTY
    this.player.ammoClip = 30;
    this.player.ammoReserve = 200;
    this.player.isStunned = false;
    this.player.stunTimer = 0;

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
    const enemyTypes = ["melee", "speed", "rifleman"];

    this.threats.forEach((th, i) => {
      const enemyClass = enemyTypes[i % 3];
      const angle = (i / this.threats.length) * Math.PI * 2;
      const radius = 22 + ((i * 9) % 55);
      let ex = Math.cos(angle) * radius;
      let ez = Math.sin(angle) * radius;

      // Anti-wall spawn placement
      const pos = new THREE.Vector3(ex, 0, ez);
      this.resolveBoxCollision(pos, 0.8);
      ex = pos.x; ez = pos.z;

      const enemyMesh = this.createEnemyMeshByClass(enemyClass, false);
      enemyMesh.position.set(ex, 0, ez);
      this.scene.add(enemyMesh);

      const hp = enemyClass === "speed" ? 55 : (enemyClass === "rifleman" ? 70 : 80);

      this.enemies.push({
        id: th.id,
        subject: th.subject,
        sender: th.sender,
        enemyClass: enemyClass,
        mesh: enemyMesh,
        health: hp,
        maxHealth: hp,
        isBoss: false,
        isStunned: false,
        stunTimer: 0,
        aimTimer: 0, // 2-second continuous tracking requirement!
        isAiming: false,
        lastAttack: 0,
        lastRifleShot: 0,
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

    const locBanner = document.getElementById("locator-banner");
    if (locBanner) {
      if (activeRemaining <= 4 && activeRemaining > 0) {
        locBanner.classList.remove("hidden");
        let minDist = 999;
        this.enemies.forEach(en => {
          const d = this.player.position.distanceTo(en.mesh.position);
          if (d < minDist) minDist = d;
        });
        const distEl = document.getElementById("nearest-target-dist");
        if (distEl) distEl.textContent = "NEAREST: " + Math.round(minDist) + "m";
      } else {
        locBanner.classList.add("hidden");
      }
    }
  }

  renderUavRadar() {
    if (!this.uavCtx) return;
    const ctx = this.uavCtx;
    const size = 130;
    const center = size / 2;
    const radarRange = 70;

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(0, 255, 204, 0.25)";
    ctx.lineWidth = 1;
    [20, 40, 60].forEach(r => {
      ctx.beginPath();
      ctx.arc(center, center, (r / radarRange) * (size / 2), 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(center, 4); ctx.lineTo(center, size - 4);
    ctx.moveTo(4, center); ctx.lineTo(size - 4, center);
    ctx.stroke();

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

    this.enemies.forEach(en => {
      const dx = en.mesh.position.x - this.player.position.x;
      const dz = en.mesh.position.z - this.player.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < radarRange) {
        const rx = center + (dx / radarRange) * (size / 2);
        const ry = center + (dz / radarRange) * (size / 2);

        if (en.isBoss) {
          ctx.fillStyle = "#ff0033";
          ctx.beginPath();
          ctx.arc(rx, ry, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        } else if (en.enemyClass === "rifleman") {
          ctx.fillStyle = "#ffaa00";
          ctx.beginPath();
          ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (en.enemyClass === "speed") {
          ctx.fillStyle = "#00d4ff";
          ctx.beginPath();
          ctx.arc(rx, ry, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#ff3344";
          ctx.beginPath();
          ctx.arc(rx, ry, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

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

  createEnemyMeshByClass(enemyClass, isBoss = false) {
    const group = new THREE.Group();
    const scale = isBoss ? 2.3 : 1.0;

    let visorColor = 0xff2244;
    let bodyColor = 0x1a212b;
    if (enemyClass === "speed") { visorColor = 0x00d4ff; bodyColor = 0x162a38; }
    if (enemyClass === "rifleman") { visorColor = 0xffaa00; bodyColor = 0x242418; }
    if (isBoss) { visorColor = 0xff0022; bodyColor = 0x090a0d; }

    const camoMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.3, metalness: 0.5 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdde4ec, metalness: 0.95, roughness: 0.1 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.74 * scale, 0.35 * scale), camoMat);
    torso.position.y = 1.1 * scale;
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.6 * scale, 0.38 * scale), vestMat);
    vest.position.y = 1.15 * scale;
    group.add(vest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 16, 16), new THREE.MeshStandardMaterial({ color: 0x333a44 }));
    head.position.y = 1.64 * scale;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.235 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), vestMat);
    helmet.position.y = 1.67 * scale;
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.08 * scale, 0.12 * scale), new THREE.MeshBasicMaterial({ color: visorColor }));
    visor.position.set(0, 1.65 * scale, 0.18 * scale);
    group.add(visor);

    let weaponMesh = null;
    let laserMesh = null;

    if (isBoss) {
      weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.12 * scale, 0.85 * scale), steelMat);
      weaponMesh.position.set(0.3 * scale, 1.05 * scale, 0.35 * scale);
      weaponMesh.rotation.x = 0.35;
    } else if (enemyClass === "melee") {
      weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: 0x00ffcc, metalness: 0.9 }));
      weaponMesh.position.set(0.26, 1.05, 0.35);
      weaponMesh.rotation.x = 0.35;
    } else if (enemyClass === "speed") {
      weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: 0x00d4ff, metalness: 0.8 }));
      weaponMesh.position.set(0.25, 1.05, 0.22);
    } else if (enemyClass === "rifleman") {
      weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.95), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 }));
      weaponMesh.position.set(0.25, 1.1, 0.4);

      // RED LASER TARGETING BEAM
      const laserGeo = new THREE.CylinderGeometry(0.008, 0.008, 18, 6);
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 });
      laserMesh = new THREE.Mesh(laserGeo, laserMat);
      laserMesh.rotation.x = Math.PI / 2;
      laserMesh.position.set(0, 0.04, 9.0);
      laserMesh.visible = false;
      weaponMesh.add(laserMesh);
    }
    group.add(weaponMesh);

    const beaconGeo = new THREE.CylinderGeometry(0.05, 0.05, 6.0, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.7 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 4.5 * scale;
    beacon.visible = false;
    group.add(beacon);

    const legGeo = new THREE.BoxGeometry(0.2 * scale, 0.75 * scale, 0.22 * scale);
    const leftLeg = new THREE.Mesh(legGeo, camoMat);
    leftLeg.position.set(-0.16 * scale, 0.38 * scale, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, camoMat);
    rightLeg.position.set(0.16 * scale, 0.38 * scale, 0);
    group.add(rightLeg);

    group.userData = { leftLeg, rightLeg, weaponMesh, laser: laserMesh, beacon, animPhase: Math.random() * Math.PI, isBoss, enemyClass };
    return group;
  }

  // 800 HP JUGGERNAUT BOSS (10X MELEE HEALTH)
  spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;

    if (this.sound) {
      this.sound.playBossAlert();
      this.sound.startBossBattleMusic();
    }

    const bossMesh = this.createEnemyMeshByClass("boss", true);
    bossMesh.position.set(0, 0, 15);
    this.scene.add(bossMesh);

    this.boss = {
      id: "BOSS-TITAN",
      subject: "CYBER-JUGGERNAUT // TITAN-01 [ROOT PROTOCOL]",
      mesh: bossMesh,
      health: 800,
      maxHealth: 800,
      isBoss: true,
      enemyClass: "boss",
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
    this.shockwaves.push({ mesh: ring, scale: 1.0, opacity: 0.9, center: pos.clone() });
  }

  createFloatingTriageText(pos, textStr) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
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
    if (this.player.isStunned) return;
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

    // Wall intersection check (bullets stop at solid obstacles)
    const sceneObstacles = this.scene.children.filter(c => c !== this.camera && c !== this.weaponRig && !this.enemies.find(e => e.mesh === c));
    const wallIntersects = raycaster.intersectObjects(sceneObstacles, true);
    const wallDist = wallIntersects.length > 0 ? wallIntersects[0].distance : 999;

    // Enemy hit check
    const enemyMeshes = this.enemies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(enemyMeshes, true);

    if (intersects.length > 0 && intersects[0].distance < wallDist) {
      this.player.shotsHit += 1;
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && !this.enemies.find(e => e.mesh === hitMesh)) {
        hitMesh = hitMesh.parent;
      }
      const targetEnemy = this.enemies.find(e => e.mesh === hitMesh);

      if (targetEnemy) {
        const damageDealt = targetEnemy.isStunned ? 55 : 35;
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
    } else if (wallIntersects.length > 0 && wallDist < 75) {
      this.createImpactSparks(wallIntersects[0].point);
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

    this.player.empCharge = Math.min(100, this.player.empCharge + 20);
    this.updateEmpMeter();

    const label = "+150 EXP // ARCHIVED [" + (enemy.sender ? enemy.sender.substring(0, 14) : "Threat") + "]";
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

    // Weather particles
    if (this.weatherParticles) {
      const pos = this.weatherParticles.geometry.attributes.position.array;
      const speed = this.weatherType === "rainy" ? 50 : 8;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= speed * dt;
        if (pos[i] < 0) pos[i] = 45;
      }
      this.weatherParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (!this.isLocked) return;

    // Stun state from boss stomp
    if (this.player.isStunned) {
      this.player.stunTimer -= dt;
      const stunEl = document.getElementById("stun-banner");
      if (stunEl) {
        stunEl.classList.remove("hidden");
        stunEl.querySelector("span").textContent = "⚡ OPERATOR STUNNED BY BOSS STOMP! [" + Math.ceil(this.player.stunTimer) + "s] ⚡";
      }
      if (this.player.stunTimer <= 0) {
        this.player.isStunned = false;
        if (stunEl) stunEl.classList.add("hidden");
      }
      return;
    }

    if (this.mouse.left && !this.player.isReloading) {
      if (now - this.lastShotTime >= this.fireRate) {
        this.lastShotTime = now;
        this.shoot();
      }
    }

    let targetCameraY = 1.7;

    // PLAYER MOVEMENT WITH PENETRATION RESOLVER
    if (this.player.isSliding) {
      targetCameraY = 0.85;
      this.player.slideTimer -= dt;
      const slideSpeed = 16.0 * (this.player.slideTimer / 0.65) + 3.0;

      this.player.position.x += this.player.slideDir.x * slideSpeed * dt;
      this.player.position.z += this.player.slideDir.z * slideSpeed * dt;
      this.resolveBoxCollision(this.player.position, 0.45);

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

      this.player.position.x += moveDir.x * speed * dt;
      this.player.position.z += moveDir.z * speed * dt;
      this.resolveBoxCollision(this.player.position, 0.45);
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

    this.searchlights.forEach(sl => {
      sl.baseAngle += 0.4 * dt;
      sl.target.position.x = sl.cx * 0.3 + Math.sin(sl.baseAngle) * 35;
      sl.target.position.z = sl.cz * 0.3 + Math.cos(sl.baseAngle) * 35;
    });

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

    for (let p = this.impactParticles.length - 1; p >= 0; p--) {
      const ip = this.impactParticles[p];
      ip.timer -= dt;
      ip.mesh.material.opacity = Math.max(0, ip.timer / 0.25);
      if (ip.timer <= 0) {
        this.scene.remove(ip.mesh);
        this.impactParticles.splice(p, 1);
      }
    }

    for (let s = this.shockwaves.length - 1; s >= 0; s--) {
      const sw = this.shockwaves[s];
      sw.scale += 14 * dt;
      sw.opacity -= 0.9 * dt;
      sw.mesh.scale.set(sw.scale, sw.scale, 1);
      sw.mesh.material.opacity = Math.max(0, sw.opacity);

      const distToPlayer = this.player.position.distanceTo(sw.center);
      if (distToPlayer < 12.0 && sw.opacity > 0.5 && !this.player.isStunned) {
        this.player.isStunned = true;
        this.player.stunTimer = 5.0;
        this.createFloatingTriageText(this.player.position, "⚡ STUNNED BY BOSS STOMP! (5s)");
      }

      if (sw.opacity <= 0) {
        this.scene.remove(sw.mesh);
        this.shockwaves.splice(s, 1);
      }
    }

    // ENEMY AI & COMBAT LOOP
    const timeMs = performance.now();
    const isLast4 = this.enemies.length <= 4;
    let anySniperAiming = false;

    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];

      if (en.mesh.userData.beacon) {
        en.mesh.userData.beacon.visible = isLast4;
      }

      if (en.isStunned) {
        en.stunTimer -= dt;
        if (en.stunTimer <= 0) en.isStunned = false;
        continue;
      }

      en.mesh.lookAt(this.player.position.x, 0, this.player.position.z);
      const dist = en.mesh.position.distanceTo(this.player.position);

      let currentSpeed = 4.0;
      if (en.enemyClass === "speed") currentSpeed = 7.2;
      if (en.enemyClass === "rifleman") currentSpeed = 3.0;
      if (en.isBoss) currentSpeed = 4.0;

      en.mesh.userData.animPhase += dt * (en.enemyClass === "speed" ? 14 : 8);
      const legAngle = Math.sin(en.mesh.userData.animPhase) * 0.45;
      en.mesh.userData.leftLeg.rotation.x = legAngle;
      en.mesh.userData.rightLeg.rotation.x = -legAngle;

      const collisionRadius = en.isBoss ? 0.9 : 0.6;

      // 3. RIFLEMAN AI: MAX RANGE 35M + 2-SECOND LINE-OF-SIGHT REQUIREMENT
      if (en.enemyClass === "rifleman") {
        const eyeLevel = en.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        const playerEye = this.player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        
        // Raycast Line of Sight: walls block sniper completely!
        const canSeePlayer = (dist <= 35) && this.hasLineOfSight(eyeLevel, playerEye);

        if (canSeePlayer) {
          // Accumulate 2 seconds continuous aim
          en.aimTimer += dt;
          anySniperAiming = true;

          if (en.mesh.userData.laser) {
            en.mesh.userData.laser.visible = true;
            en.mesh.userData.laser.material.color.setHex(en.aimTimer > 1.3 ? 0xff0000 : 0xffaa00);
            en.mesh.userData.laser.material.opacity = 0.4 + (en.aimTimer / 2.0) * 0.6;
          }

          // Shoots after seeing you continuously for 2.0 seconds
          if (en.aimTimer >= 2.0 && (timeMs - en.lastRifleShot > 5000)) {
            en.lastRifleShot = timeMs;
            en.aimTimer = 0;
            if (this.sound) this.sound.playGunshot(true);

            // DODGEABLE BY SLIDING AT RIGHT TIME!
            if (this.player.isSliding) {
              this.createFloatingTriageText(this.player.position, "💨 DODGED SNIPER! (SLIDE)");
            } else {
              this.player.health -= 30;
              this.showDamageVignette();
              this.createFloatingTriageText(this.player.position, "💥 SNIPER HIT (-30 HP)");
              if (this.player.health <= 0) this.triggerMissionEnd(false);
            }
          }
        } else {
          // Lost sight behind wall: reset aim
          en.aimTimer = Math.max(0, en.aimTimer - dt * 2.5);
          if (en.mesh.userData.laser) en.mesh.userData.laser.visible = false;

          // Advance towards open area to acquire sight
          if (dist > 18) {
            const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
            toPlayer.y = 0;
            en.mesh.position.x += toPlayer.x * currentSpeed * dt;
            en.mesh.position.z += toPlayer.z * currentSpeed * dt;
            this.resolveBoxCollision(en.mesh.position, collisionRadius);
          }
        }
        continue;
      }

      // CLASSES 1, 2, & 4: CLOSE COMBAT
      const attackRange = en.isBoss ? 3.5 : 2.2;

      if (dist > attackRange) {
        const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
        toPlayer.y = 0;

        en.mesh.position.x += toPlayer.x * currentSpeed * dt;
        en.mesh.position.z += toPlayer.z * currentSpeed * dt;
        // ANTI-PHASING: Pushes enemy out of all walls immediately
        this.resolveBoxCollision(en.mesh.position, collisionRadius);
      } else {
        const attackInterval = en.isBoss ? 2000 : (en.enemyClass === "speed" ? 800 : 1200);

        if (timeMs - en.lastAttack > attackInterval) {
          en.lastAttack = timeMs;

          if (en.isBoss) {
            if (this.sound) this.sound.playBossSlam();
            this.createShockwave(en.mesh.position);
          } else if (en.enemyClass === "melee") {
            if (this.sound) this.sound.playMeleeStrike();
            this.player.health -= 20;
            this.showDamageVignette();
            this.createFloatingTriageText(this.player.position, "⚔️ SWORD SLASH (-20 HP)");
          } else if (en.enemyClass === "speed") {
            if (this.sound) this.sound.playMeleeStrike();
            this.player.health -= 10;
            this.showDamageVignette();
            this.createFloatingTriageText(this.player.position, "👊 PUNCH (-10 HP)");
          }

          if (this.player.health <= 0) {
            this.triggerMissionEnd(false);
          }
        }
      }
    }

    // Sniper HUD warning toggle
    const sniperWarn = document.getElementById("sniper-warning");
    if (sniperWarn) {
      sniperWarn.classList.toggle("hidden", !anySniperAiming);
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
