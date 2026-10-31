/**
 * ZEROHOUR 3D FIRST-PERSON SHOOTER ENGINE (CALL OF DUTY MW BERSERK BUILD)
 * Full-Auto 30-round spray, Cinematic Infiltration Cutscene, High Visibility AAA Lighting
 */
class FPSGameEngine {
  constructor(canvasId, sound) {
    this.canvas = document.getElementById(canvasId);
    this.sound = sound;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Cutscene System
    this.isCutscene = false;
    this.cutsceneTime = 0;
    this.cutsceneDuration = 4.2;

    // Player State
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

    // Camera Look
    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;

    // Movement & Keys
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.mouse = { left: false, right: false };

    // PURE FULL-AUTO ONLY (750 RPM = 0.08s per shot)
    this.fireRate = 0.08;
    this.lastShotTime = 0;

    // Viewmodel
    this.weaponRig = null;
    this.muzzleLight = null;
    this.flashlight = null;
    this.hipPos = new THREE.Vector3(0.2, -0.22, -0.45);
    this.adsPos = new THREE.Vector3(0.0, -0.162, -0.32);
    this.recoilOffset = 0;
    this.cockAnimOffset = 0;

    // World & Entities
    this.threats = [];
    this.enemies = [];
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
    this.scene.fog = new THREE.FogExp2(0x131d2b, 0.01);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
    this.camera.position.set(0, 4.5, 26); // Starting high for cutscene sweep
    this.camera.lookAt(0, 1.8, -10);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    // HIGH CONTRAST AAA LIGHTING
    const ambientLight = new THREE.AmbientLight(0x567399, 1.4);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x8cb4e6, 0x18202a, 1.3);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xe8f4ff, 1.2);
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

    // M4A1 Matte Receiver
    const matReceiver = new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.25, metalness: 0.85 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.38), matReceiver);
    this.weaponRig.add(receiver);

    // Picatinny Rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.25), new THREE.MeshStandardMaterial({ color: 0x101317, metalness: 0.9 }));
    rail.position.set(0, 0.01, -0.26);
    this.weaponRig.add(rail);

    // Barrel & Muzzle Brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 12), matReceiver);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.38);
    this.weaponRig.add(barrel);

    // Holographic Sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.048, 0.07), new THREE.MeshStandardMaterial({ color: 0x0f1115 }));
    sight.position.set(0, 0.07, -0.05);
    this.weaponRig.add(sight);

    // Reticle
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.0035, 0.007, 16), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    reticle.position.set(0, 0.07, -0.086);
    this.weaponRig.add(reticle);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.17, 0.075), new THREE.MeshStandardMaterial({ color: 0x242a34 }));
    mag.position.set(0, -0.11, -0.04);
    mag.rotation.x = 0.22;
    this.weaponRig.add(mag);

    // Tactical Under-barrel Flashlight
    this.flashlight = new THREE.SpotLight(0xddeeff, 2.8, 38, Math.PI / 4, 0.35, 1.2);
    this.flashlight.position.set(0.05, 0.02, -0.4);
    this.flashlight.target.position.set(0.05, 0.02, -10);
    this.weaponRig.add(this.flashlight);
    this.weaponRig.add(this.flashlight.target);

    // Dynamic Muzzle Flash Light
    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 18);
    this.muzzleLight.position.set(0, 0.02, -0.6);
    this.weaponRig.add(this.muzzleLight);

    this.weaponRig.position.copy(this.hipPos);
    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
  }

  buildFacility() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(90, 90);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.45, metalness: 0.35 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(90, 90);
    const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshStandardMaterial({ color: 0x111620, roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5.2;
    this.scene.add(ceil);

    const addWall = (x, z, w, d, h = 5.2) => {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x222d3d, roughness: 0.35, metalness: 0.45 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      this.scene.add(wall);
      this.wallBoxes.push(new THREE.Box3().setFromObject(wall));
    };

    // Perimeter Walls
    addWall(0, -42, 84, 2);
    addWall(0, 42, 84, 2);
    addWall(-42, 0, 2, 84);
    addWall(42, 0, 2, 84);

    // Vault Corridors
    addWall(-14, 0, 2, 55);
    addWall(14, 0, 2, 55);

    // Overhead Fluorescent Lights
    for (let lz = -30; lz <= 30; lz += 12) {
      this.spawnCeilingLight(0, lz);
      this.spawnCeilingLight(-26, lz);
      this.spawnCeilingLight(26, lz);
    }

    // High Density Server Racks
    for (let z = -30; z <= 30; z += 7) {
      if (Math.abs(z) < 5) continue;
      this.spawnServerRack(-26, z);
      this.spawnServerRack(26, z);
    }
  }

  spawnCeilingLight(x, z) {
    const fixtureGeo = new THREE.BoxGeometry(0.5, 0.15, 3.5);
    const fixture = new THREE.Mesh(fixtureGeo, new THREE.MeshBasicMaterial({ color: 0xddeeff }));
    fixture.position.set(x, 5.1, z);
    this.scene.add(fixture);

    const light = new THREE.PointLight(0xddeeff, 1.8, 24, 1.3);
    light.position.set(x, 4.6, z);
    this.scene.add(light);
  }

  spawnServerRack(x, z) {
    const rackGeo = new THREE.BoxGeometry(3.5, 4.4, 1.4);
    const rack = new THREE.Mesh(rackGeo, new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.4, metalness: 0.6 }));
    rack.position.set(x, 2.2, z);
    this.scene.add(rack);
    this.wallBoxes.push(new THREE.Box3().setFromObject(rack));

    const ledMatA = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const ledMatB = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    for (let ly = 1.0; ly < 4.0; ly += 0.4) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), Math.random() > 0.4 ? ledMatA : ledMatB);
      led.position.set(x + (Math.random() - 0.5) * 2.2, ly, z + 0.71);
      this.scene.add(led);
    }
  }

  setupControls() {
    window.addEventListener("keydown", (e) => {
      if (this.isCutscene) return;
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = true;
      if (k === "a") this.keys.a = true;
      if (k === "s") this.keys.s = true;
      if (k === "d") this.keys.d = true;
      if (e.shiftKey) this.keys.shift = true;

      // Tactical Slide
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
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));
    });

    // PURE FULL-AUTO MOUSE HANDLERS
    window.addEventListener("mousedown", (e) => {
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

  // TRIGGER COD MW CINEMATIC INFILTRATION CUTSCENE
  playCutscene() {
    this.isCutscene = true;
    this.cutsceneTime = 0;
    this.player.position.set(0, 1.7, 12);
    this.camera.position.set(0, 4.6, 26);
    this.camera.lookAt(0, 1.8, -10);

    // Audio Weapon Cocking at 2.4s
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

  loadSession(threats) {
    this.threats = threats;
    this.enemies.forEach(en => this.scene.remove(en.mesh));
    this.enemies = [];

    threats.forEach((th, i) => {
      const angle = (i / threats.length) * Math.PI * 2;
      const dist = 16 + (i % 3) * 6;
      const ex = Math.cos(angle) * dist;
      const ez = Math.sin(angle) * dist - 8;

      const enemyMesh = this.createSoldierMesh(th.category);
      enemyMesh.position.set(ex, 0, ez);
      this.scene.add(enemyMesh);

      this.enemies.push({
        id: th.id,
        subject: th.subject,
        mesh: enemyMesh,
        health: 80,
        maxHealth: 80,
        lastAttack: 0,
        threatLevel: th.threat_level
      });
    });
  }

  createSoldierMesh(cat) {
    const group = new THREE.Group();
    const visorColor = cat === "phishing" ? 0xff3366 : (cat === "spam" ? 0xffb700 : 0x00ccff);

    const camoMat = new THREE.MeshStandardMaterial({ color: 0x242d3a, roughness: 0.5 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x121720, roughness: 0.35, metalness: 0.4 });
    const armorPlateMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.85, roughness: 0.2 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x3d4450 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x0e1218, metalness: 0.9, roughness: 0.2 });

    // Torso & Plate Carrier
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.34), camoMat);
    torso.position.y = 1.1;
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.38), vestMat);
    vest.position.y = 1.15;
    group.add(vest);

    // Front Mag Pouches
    for (let p = -0.16; p <= 0.16; p += 0.16) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 0.09), armorPlateMat);
      pouch.position.set(p, 1.05, 0.22);
      group.add(pouch);
    }

    // Head & Helmet
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat);
    head.position.y = 1.64;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), vestMat);
    helmet.position.y = 1.67;
    group.add(helmet);

    // Glowing Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: visorColor }));
    visor.position.set(0, 1.65, 0.17);
    group.add(visor);

    // Rifle
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.65), gunMat);
    rifle.position.set(0.22, 1.12, 0.36);
    group.add(rifle);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.22);
    const leftLeg = new THREE.Mesh(legGeo, camoMat);
    leftLeg.position.set(-0.16, 0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, camoMat);
    rightLeg.position.set(0.16, 0.38, 0);
    group.add(rightLeg);

    group.userData = { leftLeg, rightLeg, animPhase: Math.random() * Math.PI };
    return group;
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

    // Recoil Climb
    this.recoilOffset = 0.055;
    this.pitch += 0.011;

    // Flash
    this.muzzleLight.intensity = 3.6;
    setTimeout(() => { this.muzzleLight.intensity = 0; }, 35);

    // Hit Detection
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

    if (this.onKillThreat) {
      this.onKillThreat(enemy.id, enemy.subject, this.threats.length - this.enemies.length, this.threats.length);
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
        purged: this.threats.length - this.enemies.length,
        accuracy: accuracy,
        health: Math.max(0, Math.round(this.player.health))
      });
    }
  }

  update(dt) {
    const now = performance.now() / 1000;

    // 1. CINEMATIC CUTSCENE CAMERA FLIGHT & INSPECTION
    if (this.isCutscene) {
      this.cutsceneTime += dt;
      const progress = Math.min(this.cutsceneTime / this.cutsceneDuration, 1.0);

      // Smooth step flight towards player eye position
      const t = progress * progress * (3 - 2 * progress);
      this.camera.position.set(0, 4.5 - t * 2.8, 26 - t * 14);
      this.camera.lookAt(0, 1.7, -10 + t * 5);

      // Weapon cocking animation offset
      this.cockAnimOffset *= 0.85;
      this.weaponRig.position.set(0.2, -0.22 - this.cockAnimOffset, -0.45 + this.cockAnimOffset);

      if (progress >= 1.0) {
        this.isCutscene = false;
        if (this.onCutsceneFinish) this.onCutsceneFinish();
      }
      return;
    }

    if (!this.isLocked) return;

    // 2. PURE FULL-AUTOMATIC SPRAY
    if (this.mouse.left && !this.player.isReloading) {
      if (now - this.lastShotTime >= this.fireRate) {
        this.lastShotTime = now;
        this.shoot();
      }
    }

    // 3. SLIDE OR NORMAL MOVEMENT
    let targetCameraY = 1.7;

    if (this.player.isSliding) {
      targetCameraY = 0.85;
      this.player.slideTimer -= dt;
      const slideSpeed = 15.0 * (this.player.slideTimer / 0.65) + 3.0;
      this.player.position.addScaledVector(this.player.slideDir, slideSpeed * dt);
      if (this.player.slideTimer <= 0) this.player.isSliding = false;
    } else {
      const speed = this.keys.shift ? 11.5 : 6.2;
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

    // Gravity
    this.player.velocity.y -= 18 * dt;
    this.player.position.y += this.player.velocity.y * dt;

    if (this.player.position.y <= targetCameraY) {
      this.player.position.y = targetCameraY;
      this.player.velocity.y = 0;
      this.player.canJump = true;
    }

    // Boundaries
    this.player.position.x = Math.max(-39, Math.min(39, this.player.position.x));
    this.player.position.z = Math.max(-39, Math.min(39, this.player.position.z));

    // Camera Look
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Viewmodel Recoil + Slide Cant
    const targetPos = this.player.isADS ? this.adsPos : this.hipPos;
    this.weaponRig.position.lerp(targetPos, 0.22);
    this.weaponRig.position.z += this.recoilOffset;
    this.recoilOffset *= 0.78;

    const targetRoll = this.player.isSliding ? 0.35 : 0;
    this.weaponRig.rotation.z += (targetRoll - this.weaponRig.rotation.z) * 10 * dt;

    // 4. SOLDIER AI
    const timeMs = performance.now();
    this.enemies.forEach(en => {
      en.mesh.lookAt(this.player.position.x, 0, this.player.position.z);
      const dist = en.mesh.position.distanceTo(this.player.position);

      en.mesh.userData.animPhase += dt * 8;
      const legAngle = Math.sin(en.mesh.userData.animPhase) * 0.45;
      en.mesh.userData.leftLeg.rotation.x = legAngle;
      en.mesh.userData.rightLeg.rotation.x = -legAngle;

      if (dist > 5.5) {
        const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
        toPlayer.y = 0;
        en.mesh.position.addScaledVector(toPlayer, 2.5 * dt);
      }

      if (dist < 22 && timeMs - en.lastAttack > 2000) {
        en.lastAttack = timeMs;
        this.sound.playEnemyFire();
        this.player.health -= 12;
        this.showDamageVignette();

        if (this.player.health <= 0) this.triggerMissionEnd(false);
      }
    });

    // Health Regeneration
    if (this.player.health < this.player.maxHealth && this.player.health > 0) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 4 * dt);
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
