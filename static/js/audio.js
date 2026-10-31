class ProceduralAudio {
  constructor() {
    this.ctx = null;
    this.bgmOsc = null;
    this.bgmGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  startBunkerAmbience() {
    this.init();
    if (this.bgmOsc) return;

    // Atmospheric deep sub-bass hum
    this.bgmOsc = this.ctx.createOscillator();
    this.bgmGain = this.ctx.createGain();
    this.bgmOsc.type = "sine";
    this.bgmOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

    this.bgmGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    this.bgmOsc.connect(this.bgmGain);
    this.bgmGain.connect(this.ctx.destination);
    this.bgmOsc.start();
  }

  playCockWeapon() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.15);
    g.gain.setValueAtTime(0.25, now);
    g.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playGunshot(isADS) {
    this.init();
    const now = this.ctx.currentTime;
    
    // Heavy Sub Punch
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isADS ? 150 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
    oscGain.gain.setValueAtTime(0.55, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // Mechanical Crack Noise
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.012));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.linearRampToValueAtTime(0.01, now + 0.08);
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);
  }

  playReload() {
    this.init();
    const now = this.ctx.currentTime;
    
    // Mag drop click
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(450, now);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    g1.gain.setValueAtTime(0.2, now);
    g1.gain.linearRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(g1);
    g1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // New mag insert clack at 0.5s
    setTimeout(() => {
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(750, this.ctx.currentTime + 0.12);
      g2.gain.setValueAtTime(0.25, this.ctx.currentTime);
      g2.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc2.connect(g2);
      g2.connect(this.ctx.destination);
      osc2.start(this.ctx.currentTime);
      osc2.stop(this.ctx.currentTime + 0.12);
    }, 500);
  }

  playMeleeStrike() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playHitmarker() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2500, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  playSlide() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  playBossAlert() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.6);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}

window.soundEngine = new ProceduralAudio();
