/**
 * ZEROHOUR 3D FIRST-PERSON SHOOTER ENGINE
 * Upgrades:
 *  - Full Difficulty Spawning (Recruit: 6, Veteran: 14, Elite: 22 + Boss)
 *  - Fast Melee Assault Speed (up to 10.5 m/s)
 *  - Fixed POV rotation (YXZ order strictly, zero roll)
 *  - Red Dot Sight & Full-Auto Gunfire
 */
class FPSGameEngine {
  constructor(canvasId, sound) {
    this.canvas = document.getElementById(canvasId);
    this.sound = sound;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.isCutscene = false;
    this.cutsceneTime = 0;
    this.cutsceneDuration = 4.2;

    this.player = {
      position: new THREE.Vector3(0, 1.7, 12),
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
    };

    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;
    this.difficulty = "veteran";

    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.mouse = { left: false, right: false };

    this.fireRate = 0.08;
    this.lastShotTime = 0;

    this.weaponRig = null;
    this.redDotMesh = null;
    this.muzzleLight = null;
    this.flashlight = null;
    this.hipPos = new THREE.Vector3(0.2, -0.22, -0.45);
    this.adsPos = new THREE.Vector3(0.0, -0.07, -0.28);
    this.recoilOffset = 0;
    this.cockAnimOffset = 0;

    this.threats = [];
    this.enemies = [];
    this.boss = null;
    this.bossSpawned = false;
    this.wallBoxes = [];

    this.onKillThreat = null;
    this.onMissionEnd = null;
    this.onCutsceneFinish = null;

    this.lastTime = performance.now();
    this.initThree();
    this.setupControls();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0e131d, 0.012);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 4.5, 26);
    this.camera.lookAt(0, 1.8, -10);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0x607899, 1.5);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x94b3db, 0x161b24, 1.3);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 35, 15);
    this.scene.add(dirLight);

    this.buildFacility();
    this.buildWeaponViewmodel();

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildWeaponViewmodel() {
    this.weaponRig = new THREE.Group();

    const matReceiver = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.3, metalness: 0.8 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.38), matReceiver);
    this.weaponRig.add(receiver);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.25), new THREE.MeshStandardMaterial({ color: 0x222a36, metalness: 0.85, roughness: 0.2 }));
    handguard.position.set(0, 0.01, -0.26);
    this.weaponRig.add(handguard);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 12), matReceiver);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.38);
    this.weaponRig.add(barrel);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.05, 0.07), new THREE.MeshStandardMaterial({ color: 0x0a0c10 }));
    sight.position.set(0, 0.07, -0.05);
    this.weaponRig.add(sight);

    const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    this.redDotMesh = new THREE.Mesh(new THREE.CircleGeometry(0.003, 16), redDotMat);
    this.redDotMesh.position.set(0, 0.07, -0.076);
    this.weaponRig.add(this.redDotMesh);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.17, 0.075), new THREE.MeshStandardMaterial({ color: 0x1f2530 }));
    mag.position.set(0, -0.11, -0.04);
    mag.rotation.x = 0.22;
    this.weaponRig.add(mag);

    this.flashlight = new THREE.SpotLight(0xddeeff, 2.6, 38, Math.PI / 4, 0.35, 1.2);
    this.flashlight.position.set(0.05, 0.02, -0.4);
    this.flashlight.target.position.set(0.05, 0.02, -10);
    this.weaponRig.add(this.flashlight);
    this.weaponRig.add(this.flashlight.target);

    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 18);
    this.muzzleLight.position.set(0, 0.02, -0.6);
    this.weaponRig.add(this.muzzleLight);

    this.weaponRig.position.copy(this.hipPos);
    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
  }

  buildFacility() {
    const floorGeo = new THREE.PlaneGeometry(90, 90);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.4, metalness: 0.45 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(90, 90);
    const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshStandardMaterial({ color: 0x0f141d, roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5.2;
    this.scene.add(ceil);

    const addWall = (x, z, w, d, h = 5.2) => {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e2736, roughness: 0.35, metalness: 0.5 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      this.scene.add(wall);
      this.wallBoxes.push(new THREE.Box3().setFromObject(wall));
    };

    addWall(0, -42, 84, 2);
    addWall(0, 42, 84, 2);
    addWall(-42, 0, 2, 84);
    addWall(42, 0, 2, 84);

    addWall(-14, 0, 2, 55);
    addWall(14, 0, 2, 55);

    for (let lz = -30; lz <= 30; lz += 12) {
      this.spawnCeilingLight(0, lz);
      this.spawnCeilingLight(-26, lz);
      this.spawnCeilingLight(26, lz);
    }

    for (let z = -30; z <= 30; z += 7) {
      if (Math.abs(z) < 5) continue;
      this.spawnServerRack(-26, z);
      this.spawnServerRack(26, z);
    }
  }

  spawnCeilingLight(x, z) {
    const fixtureGeo = new THREE.BoxGeometry(0.5, 0.15, 3.5);
    const fixture = new THREE.Mesh(fixtureGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    fixture.position.set(x, 5.1, z);
    this.scene.add(fixture);

    const light = new THREE.PointLight(0xe2e8f0, 1.8, 24, 1.3);
    light.position.set(x, 4.6, z);
    this.scene.add(light);
  }

  spawnServerRack(x, z) {
    const rackGeo = new THREE.BoxGeometry(3.5, 4.4, 1.4);
    const rack = new THREE.Mesh(rackGeo, new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.4, metalness: 0.6 }));
    rack.position.set(x, 2.2, z);
    this.scene.add(rack);
    this.wallBoxes.push(new THREE.Box3().setFromObject(rack));

    const ledMatA = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ledMatB = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    for (let ly = 1.0; ly < 4.0; ly += 0.4) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), Math.random() > 0.4 ? ledMatA : ledMatB);
      led.position.set(x + (Math.random() - 0.5) * 2.2, ly, z + 0.71);
      this.scene.add(led);
    }
  }

  setupControls() {
    window.addEventListener("keydown", (e) => {
      this.sound.init();
      if (this.isCutscene) return;
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = true;
      if (k === "a") this.keys.a = true;
      if (k === "s") this.keys.s = true;
      if (k === "d") this.keys.d = true;
      if (e.shiftKey) this.keys.shift = true;

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
      if (!this.isLocked || this.isCutscene) return;
      const sensitivity = 0.002;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      const maxPitch = Math.PI / 2.18;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    window.addEventListener("mousedown", (e) => {
      this.sound.init();
      if (!this.isLocked || this.isCutscene) return;
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

  playCutscene() {
    this.isCutscene = true;
    this.cutsceneTime = 0;
    this.player.position.set(0, 1.7, 12);
    this.camera.position.set(0, 4.6, 26);
    this.camera.lookAt(0, 1.8, -10);

    setTimeout(() => {
      this.sound.playCockWeapon();
      this.cockAnimOffset = 0.15;
    }, 2400);
  }

  triggerSlide() {
    const isMoving = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
    if (!isMoving || !this.player.canJump) return;

    this.player.isSliding = true;
    this.player.slideTimer = 0.65;
    this.sound.playSlide();

    const moveDir = new THREE.Vector3();
    if (this.keys.w) moveDir.z -= 1;
    if (this.keys.s) moveDir.z += 1;
    if (this.keys.a) moveDir.x -= 1;
    if (this.keys.d) moveDir.x += 1;
    moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    this.player.slideDir.copy(moveDir);
  }

  // ROBUST SPAWNING: RECRUIT (6), VETERAN (14), ELITE (22 + BOSS)
  loadSession(threats, diff = "veteran") {
    this.threats = threats || [];
    this.difficulty = diff.toLowerCase();
    this.enemies.forEach(en => this.scene.remove(en.mesh));
    this.enemies = [];
    if (this.boss) {
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
    this.bossSpawned = false;

    // Guaranteed fallback if threats array is empty
    if (this.threats.length === 0) {
      const counts = { recruit: 6, veteran: 14, elite: 22 };
      const num = counts[this.difficulty] || 14;
      for (let k = 1; k <= num; k++) {
        this.threats.push({
          id: `THR-GEN-${k:03d}`,
          sender: `Cluster Node #${k}`,
          sender_email: `node-${k}@threat.internal`,
          subject: `Automated Intrusion Threat #${k}`,
          category: ["phishing", "spam", "promotions", "newsletter"][k % 4],
          threat_level: (k % 5) + 1
        });
      }
    }

    this.threats.forEach((th, i) => {
      const angle = (i / this.threats.length) * Math.PI * 2;
      const dist = 14 + (i % 4) * 6;
      const ex = Math.cos(angle) * dist;
      const ez = Math.sin(angle) * dist - 6;

      const enemyMesh = this.createSoldierMesh(th.category, false);
      enemyMesh.position.set(ex, 0, ez);
      this.scene.add(enemyMesh);

      this.enemies.push({
        id: th.id,
        subject: th.subject,
        mesh: enemyMesh,
        health: 80,
        maxHealth: 80,
        isBoss: false,
        lastAttack: 0,
        threatLevel: th.threat_level || 3
      });
    });

    console.log(`[ZeroHour 3D] Spawned ${this.enemies.length} enemies in ${this.difficulty.toUpperCase()} mode.`);
  }

  createSoldierMesh(cat, isBoss = false) {
    const group = new THREE.Group();
    const scale = isBoss ? 1.7 : 1.0;
    const visorColor = isBoss ? 0xff0022 : (cat === "phishing" ? 0xff2244 : 0xe2e8f0);

    const camoMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0x0a0c10 : 0x1f2633, roughness: 0.4 });
    const vestMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0x1a0508 : 0x121720, roughness: 0.3, metalness: 0.5 });
    const armorPlateMat = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.9, roughness: 0.15 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x3a424e });
    const meleeWeaponMat = new THREE.MeshStandardMaterial({ color: 0xdde4ec, metalness: 0.95, roughness: 0.1 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.72 * scale, 0.34 * scale), camoMat);
    torso.position.y = 1.1 * scale;
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.58 * scale, 0.38 * scale), vestMat);
    vest.position.y = 1.15 * scale;
    group.add(vest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 16, 16), skinMat);
    head.position.y = 1.64 * scale;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), vestMat);
    helmet.position.y = 1.67 * scale;
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.08 * scale, 0.12 * scale), new THREE.MeshBasicMaterial({ color: visorColor }));
    visor.position.set(0, 1.65 * scale, 0.17 * scale);
    group.add(visor);

    const bladeArm = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.08 * scale, 0.65 * scale), meleeWeaponMat);
    bladeArm.position.set(0.25 * scale, 1.05 * scale, 0.28 * scale);
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
    this.sound.playBossAlert();

    const bossMesh = this.createSoldierMesh("phishing", true);
    bossMesh.position.set(0, 0, -25);
    this.scene.add(bossMesh);

    this.boss = {
      id: "BOSS-TITAN",
      subject: "CYBER-JUGGERNAUT // TITAN-01 [ROOT PROTOCOL]",
      mesh: bossMesh,
      health: 320,
      maxHealth: 320,
      isBoss: true,
      lastAttack: 0,
      threatLevel: 5
    };
    this.enemies.push(this.boss);

    const bBar = document.getElementById("boss-hud-bar");
    if (bBar) bBar.classList.remove("hidden");
  }

  shoot() {
    if (this.player.isReloading) return;
    if (this.player.ammoClip <= 0) {
      this.reload();
      return;
    }

    this.player.ammoClip -= 1;
    this.player.shotsFired += 1;
    this.sound.playGunshot(this.player.isADS);

    this.recoilOffset = 0.055;
    this.pitch += 0.011;

    this.muzzleLight.intensity = 3.8;
    setTimeout(() => { this.muzzleLight.intensity = 0; }, 35);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

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
        targetEnemy.health -= 35;
        this.sound.playHitmarker();
        this.showHitmarker(false);

        if (targetEnemy.isBoss) {
          const fill = document.getElementById("boss-bar-fill");
          if (fill) fill.style.width = `${Math.max(0, (targetEnemy.health / targetEnemy.maxHealth) * 100)}%`;
        }

        if (targetEnemy.health <= 0) {
          this.destroyEnemy(targetEnemy);
        }
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

    if (enemy.isBoss) {
      const bBar = document.getElementById("boss-hud-bar");
      if (bBar) bBar.classList.add("hidden");
    }

    if (this.onKillThreat) {
      this.onKillThreat(enemy.id, enemy.subject, this.threats.length - this.enemies.filter(e => !e.isBoss).length, this.threats.length);
    }

    if (!this.bossSpawned && this.enemies.length <= Math.floor(this.threats.length / 2)) {
      this.spawnBoss();
    }

    if (this.enemies.length === 0) {
      this.triggerMissionEnd(true);
    }
  }

  reload() {
    if (this.player.isReloading || this.player.ammoClip === 30 || this.player.ammoReserve <= 0) return;
    this.player.isReloading = true;
    this.sound.playReload();

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
    document.exitPointerLock();
    if (this.onMissionEnd) {
      const accuracy = this.player.shotsFired > 0 ? Math.round((this.player.shotsHit / this.player.shotsFired) * 100) : 0;
      this.onMissionEnd(isVictory, {
        purged: this.threats.length - this.enemies.filter(e => !e.isBoss).length + (this.bossSpawned && (!this.boss || this.boss.health <= 0) ? 1 : 0),
        accuracy: accuracy,
        health: Math.max(0, Math.round(this.player.health))
      });
    }
  }

  update(dt) {
    const now = performance.now() / 1000;

    if (this.isCutscene) {
      this.cutsceneTime += dt;
      const progress = Math.min(this.cutsceneTime / this.cutsceneDuration, 1.0);
      const t = progress * progress * (3 - 2 * progress);
      this.camera.position.set(0, 4.5 - t * 2.8, 26 - t * 14);
      this.camera.lookAt(0, 1.7, -10 + t * 5);

      this.cockAnimOffset *= 0.85;
      this.weaponRig.position.set(0.2, -0.22 - this.cockAnimOffset, -0.45 + this.cockAnimOffset);

      if (progress >= 1.0) {
        this.isCutscene = false;
        if (this.onCutsceneFinish) this.onCutsceneFinish();
      }
      return;
    }

    if (!this.isLocked) return;

    if (this.mouse.left && !this.player.isReloading) {
      if (now - this.lastShotTime >= this.fireRate) {
        this.lastShotTime = now;
        this.shoot();
      }
    }

    let targetCameraY = 1.7;

    if (this.player.isSliding) {
      targetCameraY = 0.85;
      this.player.slideTimer -= dt;
      const slideSpeed = 16.0 * (this.player.slideTimer / 0.65) + 3.0;
      this.player.position.addScaledVector(this.player.slideDir, slideSpeed * dt);
      if (this.player.slideTimer <= 0) this.player.isSliding = false;
    } else {
      const speed = this.keys.shift ? 12.0 : 6.5;
      const moveDir = new THREE.Vector3();
      if (this.keys.w) moveDir.z -= 1;
      if (this.keys.s) moveDir.z += 1;
      if (this.keys.a) moveDir.x -= 1;
      if (this.keys.d) moveDir.x += 1;
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.player.position.addScaledVector(moveDir, speed * dt);
    }

    this.player.position.y += (targetCameraY - this.player.position.y) * 12 * dt;

    this.player.velocity.y -= 18 * dt;
    this.player.position.y += this.player.velocity.y * dt;

    if (this.player.position.y <= targetCameraY) {
      this.player.position.y = targetCameraY;
      this.player.velocity.y = 0;
      this.player.canJump = true;
    }

    this.player.position.x = Math.max(-39, Math.min(39, this.player.position.x));
    this.player.position.z = Math.max(-39, Math.min(39, this.player.position.z));

    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const targetPos = this.player.isADS ? this.adsPos : this.hipPos;
    this.weaponRig.position.lerp(targetPos, 0.22);
    this.weaponRig.position.z += this.recoilOffset;
    this.recoilOffset *= 0.78;

    const targetRoll = this.player.isSliding ? 0.35 : 0;
    this.weaponRig.rotation.z += (targetRoll - this.weaponRig.rotation.z) * 10 * dt;

    // AGGRESSIVE FAST MELEE ENEMY ASSAULT
    const timeMs = performance.now();
    
    // DIFFICULTY SPEEDS: Recruit 6.0m/s, Veteran 8.5m/s, Elite 10.5m/s
    const baseChaseSpeed = this.difficulty === "elite" ? 10.5 : (this.difficulty === "veteran" ? 8.5 : 6.0);

    this.enemies.forEach(en => {
      en.mesh.lookAt(this.player.position.x, 0, this.player.position.z);
      const dist = en.mesh.position.distanceTo(this.player.position);

      en.mesh.userData.animPhase += dt * (en.isBoss ? 7 : 12);
      const legAngle = Math.sin(en.mesh.userData.animPhase) * 0.55;
      en.mesh.userData.leftLeg.rotation.x = legAngle;
      en.mesh.userData.rightLeg.rotation.x = -legAngle;

      const attackRange = en.isBoss ? 3.0 : 2.2;
      if (dist > attackRange) {
        const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
        toPlayer.y = 0;
        const currentSpeed = en.isBoss ? 4.5 : baseChaseSpeed;
        en.mesh.position.addScaledVector(toPlayer, currentSpeed * dt);
      } else {
        if (timeMs - en.lastAttack > (en.isBoss ? 1300 : 950)) {
          en.lastAttack = timeMs;
          this.sound.playMeleeStrike();

          if (en.mesh.userData.bladeArm) {
            en.mesh.userData.bladeArm.rotation.x = -0.9;
            setTimeout(() => {
              if (en.mesh && en.mesh.userData.bladeArm) en.mesh.userData.bladeArm.rotation.x = 0.35;
            }, 200);
          }

          const dmg = en.isBoss ? 32 : (this.difficulty === "elite" ? 20 : 14);
          this.player.health -= dmg;
          this.showDamageVignette();

          if (this.player.health <= 0) {
            this.triggerMissionEnd(false);
          }
        }
      }
    });

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
    this.renderer.render(this.scene, this.camera);
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
