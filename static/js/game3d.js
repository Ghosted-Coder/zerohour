/**
 * ZEROHOUR 3D FIRST-PERSON SHOOTER ENGINE (THREE.JS)
 * Call of Duty Tactical Style Viewmodel, Recoil, ADS, Underground Facility
 */
class FPSGameEngine {
  constructor(canvasId, sound) {
    this.canvas = document.getElementById(canvasId);
    this.sound = sound;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Player State
    this.player = {
      position: new THREE.Vector3(0, 1.7, 10),
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      ammoClip: 30,
      ammoReserve: 120,
      isSprinting: false,
      isADS: false,
      isReloading: false,
      canJump: true,
      shotsFired: 0,
      shotsHit: 0,
    };

    // Camera Rotation (Euler)
    this.pitch = 0;
    this.yaw = 0;
    this.isLocked = false;

    // Input States
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.mouse = { left: false, right: false };

    // Viewmodel (Gun)
    this.weaponRig = null;
    this.muzzleLight = null;
    this.hipPos = new THREE.Vector3(0.2, -0.22, -0.45);
    this.adsPos = new THREE.Vector3(0.0, -0.162, -0.32);
    this.recoilOffset = 0;

    // World & Entities
    this.threats = [];
    this.enemies = [];
    this.bullets = [];
    this.wallBoxes = [];

    // Callbacks
    this.onKillThreat = null;
    this.onMissionEnd = null;

    this.lastTime = performance.now();
    this.initThree();
    this.setupControls();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.035);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 150);
    this.camera.position.copy(this.player.position);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x1a2636, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00ccff, 0.5);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);

    // Build Tactical Facility & Weapon Rig
    this.buildUndergroundFacility();
    this.buildWeaponViewmodel();

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildWeaponViewmodel() {
    this.weaponRig = new THREE.Group();

    // Receiver (Gunmetal Dark)
    const matReceiver = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.3, metalness: 0.8 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), matReceiver);
    this.weaponRig.add(receiver);

    // Barrel + Handguard
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), matReceiver);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.32);
    this.weaponRig.add(barrel);

    // Holographic Sight Frame
    const sightMat = new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.5 });
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), sightMat);
    sight.position.set(0, 0.065, -0.05);
    this.weaponRig.add(sight);

    // Glowing Reticle Dot
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.003, 0.006, 16), reticleMat);
    reticle.position.set(0, 0.065, -0.075);
    this.weaponRig.add(reticle);

    // Magazine
    const magMat = new THREE.MeshStandardMaterial({ color: 0x22262c });
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.07), magMat);
    mag.position.set(0, -0.1, -0.05);
    mag.rotation.x = 0.2;
    this.weaponRig.add(mag);

    // Dynamic Muzzle Flash Light
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 15);
    this.muzzleLight.position.set(0, 0.02, -0.55);
    this.weaponRig.add(this.muzzleLight);

    this.weaponRig.position.copy(this.hipPos);
    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
  }

  buildUndergroundFacility() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.8, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(80, 80);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.9 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 4.5;
    this.scene.add(ceil);

    // Walls function
    const addWall = (x, z, w, d, h = 4.5) => {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f1622, roughness: 0.6, metalness: 0.5 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      this.scene.add(wall);
      this.wallBoxes.push(new THREE.Box3().setFromObject(wall));
    };

    // Outer Perimeter
    addWall(0, -35, 70, 2);
    addWall(0, 35, 70, 2);
    addWall(-35, 0, 2, 70);
    addWall(35, 0, 2, 70);

    // Corridors & Rooms
    addWall(-12, 0, 2, 45);
    addWall(12, 0, 2, 45);

    // Server Racks with Blinking Glow Lights
    for (let z = -25; z <= 25; z += 6) {
      if (Math.abs(z) < 4) continue;
      this.spawnServerRack(-22, z);
      this.spawnServerRack(22, z);
    }
  }

  spawnServerRack(x, z) {
    const rackGeo = new THREE.BoxGeometry(3, 4, 1.2);
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x121720, roughness: 0.5, metalness: 0.7 });
    const rack = new THREE.Mesh(rackGeo, rackMat);
    rack.position.set(x, 2, z);
    this.scene.add(rack);
    this.wallBoxes.push(new THREE.Box3().setFromObject(rack));

    // Blinking Server Lights
    const ledGeo = new THREE.BoxGeometry(0.1, 0.05, 0.02);
    const ledMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x00ffcc : 0xff3366 });
    for (let ly = 1; ly < 3.5; ly += 0.4) {
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(x + (Math.random() - 0.5), ly, z + 0.61);
      this.scene.add(led);
    }
  }

  setupControls() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = true;
      if (k === "a") this.keys.a = true;
      if (k === "s") this.keys.s = true;
      if (k === "d") this.keys.d = true;
      if (e.shiftKey) this.keys.shift = true;
      if (e.code === "Space" && this.player.canJump) {
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
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));
    });

    window.addEventListener("mousedown", (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) this.shoot();
      if (e.button === 2) this.player.isADS = true;
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.player.isADS = false;
    });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  loadSession(threats) {
    this.threats = threats;
    this.enemies.forEach(en => this.scene.remove(en.mesh));
    this.enemies = [];

    // Spawn 3D Cyber Mercenary Drone Enemies
    threats.forEach((th, i) => {
      const angle = (i / threats.length) * Math.PI * 2;
      const dist = 14 + (i % 3) * 6;
      const ex = Math.cos(angle) * dist;
      const ez = Math.sin(angle) * dist - 5;

      const enemyMesh = this.createEnemyMesh(th.category);
      enemyMesh.position.set(ex, 1.3, ez);
      this.scene.add(enemyMesh);

      this.enemies.push({
        id: th.id,
        subject: th.subject,
        mesh: enemyMesh,
        health: 75,
        maxHealth: 75,
        lastAttack: 0,
        threatLevel: th.threat_level
      });
    });
  }

  createEnemyMesh(cat) {
    const group = new THREE.Group();
    const color = cat === "phishing" ? 0xff3366 : (cat === "spam" ? 0xffb700 : 0x00ccff);

    // Torso / Combat Rig
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.9, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.4 })
    );
    group.add(torso);

    // Visor Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e2430 })
    );
    head.position.y = 0.65;
    group.add(head);

    // Glowing Visor
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, 0.1),
      new THREE.MeshBasicMaterial({ color: color })
    );
    visor.position.set(0, 0.65, 0.2);
    group.add(visor);

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

    // Weapon Recoil
    this.recoilOffset = 0.055;
    this.pitch += 0.015;

    // Muzzle Flash
    this.muzzleLight.intensity = 2.5;
    setTimeout(() => { this.muzzleLight.intensity = 0; }, 40);

    // Raycast Shooting Hit Detection
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const enemyMeshes = this.enemies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(enemyMeshes, true);

    if (intersects.length > 0) {
      this.player.shotsHit += 1;
      const hitObj = intersects[0].object;
      const targetEnemy = this.enemies.find(e => e.mesh === hitObj.parent || e.mesh === hitObj);

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
    if (!this.isLocked) return;

    // Movement Physics
    const speed = this.keys.shift ? 11 : 6;
    const moveDir = new THREE.Vector3();

    if (this.keys.w) moveDir.z -= 1;
    if (this.keys.s) moveDir.z += 1;
    if (this.keys.a) moveDir.x -= 1;
    if (this.keys.d) moveDir.x += 1;
    moveDir.normalize();

    // Rotate moveDir by Yaw
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.player.position.addScaledVector(moveDir, speed * dt);

    // Gravity
    this.player.velocity.y -= 18 * dt;
    this.player.position.y += this.player.velocity.y * dt;

    if (this.player.position.y <= 1.7) {
      this.player.position.y = 1.7;
      this.player.velocity.y = 0;
      this.player.canJump = true;
    }

    // Clamp boundaries
    this.player.position.x = Math.max(-33, Math.min(33, this.player.position.x));
    this.player.position.z = Math.max(-33, Math.min(33, this.player.position.z));

    // Update Camera
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Viewmodel Recoil & ADS Lerp
    const targetPos = this.player.isADS ? this.adsPos : this.hipPos;
    this.weaponRig.position.lerp(targetPos, 0.2);
    this.weaponRig.position.z += this.recoilOffset;
    this.recoilOffset *= 0.8;

    // Enemy AI & Attacks
    const now = performance.now();
    this.enemies.forEach(en => {
      en.mesh.lookAt(this.player.position.x, 1.3, this.player.position.z);
      const dist = en.mesh.position.distanceTo(this.player.position);

      // Move toward player
      if (dist > 5) {
        const toPlayer = new THREE.Vector3().subVectors(this.player.position, en.mesh.position).normalize();
        en.mesh.position.addScaledVector(toPlayer, 2.2 * dt);
      }

      // Attack Player
      if (dist < 18 && now - en.lastAttack > 2200) {
        en.lastAttack = now;
        this.sound.playEnemyFire();
        this.player.health -= 12;
        this.showDamageVignette();

        if (this.player.health <= 0) {
          this.triggerMissionEnd(false);
        }
      }
    });

    // Health Regeneration when taking cover
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
