class TacticalAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.masterGain = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch(e) {}
  }
  ensureContext() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.3, this.ctx.currentTime);
    return this.isMuted;
  }
  playBootTone() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(80, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.3);
  }
  playRadioStatic(dur = 0.15) {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource(); noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1800;
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start();
  }
  playTargetLock() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "square"; osc.frequency.setValueAtTime(1400, now); osc.frequency.setValueAtTime(2200, now + 0.04);
    gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.08);
  }
  playArchive() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.2);
  }
  playTrash() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "triangle"; osc.frequency.setValueAtTime(160, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.25);
  }
  playKeep() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.08);
    gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.25);
  }
  playBossAlert() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(440, now); osc.frequency.linearRampToValueAtTime(880, now + 0.2);
    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.45);
  }
  playUndo() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.18);
    gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.18);
  }
}
window.soundEngine = new TacticalAudioEngine();
