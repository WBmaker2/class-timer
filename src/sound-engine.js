/**
 * Web Audio API Sound Engine for Classroom TV Timer
 * Synthesizes warning and finish alerts with zero external audio assets.
 */
export class SoundEngine {
  constructor({ isMuted = false } = {}) {
    this.muted = Boolean(isMuted);
    this.audioCtx = null;
    this.masterGain = null;
  }

  /**
   * Lazily retrieve or create AudioContext instance with master gain control.
   * Handles autoplay restrictions and self-heals if context was closed.
   * @returns {AudioContext|null}
   */
  _getAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      try {
        this.audioCtx = new AudioContextClass();
        this.masterGain = null;
      } catch {
        this.audioCtx = null;
        this.masterGain = null;
        return null;
      }
    }

    if (this.audioCtx && !this.masterGain) {
      try {
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.audioCtx.currentTime);
        this.masterGain.connect(this.audioCtx.destination);
      } catch {
        // Fallback if destination connection fails
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        const resumePromise = this.audioCtx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(() => {});
        }
      } catch {
        // Autoplay restrictions or invalid state fallback
      }
    }

    return this.audioCtx;
  }

  /**
   * Update master gain immediately when mute state changes.
   */
  _updateMasterGain() {
    if (!this.audioCtx || !this.masterGain) return;
    try {
      const targetGain = this.muted ? 0 : 1;
      this.masterGain.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
    } catch {
      // Safe fallback if audio context is in an invalid state
    }
  }

  /**
   * Initialize audio context on explicit user gesture (click/keydown).
   */
  init() {
    this._getAudioContext();
  }

  /**
   * Toggle mute state.
   * @returns {boolean} New mute state
   */
  toggleMute() {
    this.muted = !this.muted;
    this._updateMasterGain();
    return this.muted;
  }

  /**
   * Set mute state explicitly.
   * @param {boolean} isMuted
   */
  setMute(isMuted) {
    this.muted = Boolean(isMuted);
    this._updateMasterGain();
  }

  /**
   * Return current mute status.
   * @returns {boolean}
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Play a single synthesized tone with exponential decay envelope.
   * Routes through persistent masterGain and cleans up nodes on oscillator end.
   * @param {number} freq - Frequency in Hz
   * @param {number} startTime - Start time in seconds (relative to ctx.currentTime)
   * @param {number} duration - Duration in seconds
   * @param {OscillatorType} type - Oscillator waveform type
   * @param {number} gainLevel - Peak gain level
   */
  _playTone(freq, startTime, duration, type = 'sine', gainLevel = 0.25) {
    const ctx = this._getAudioContext();
    if (!ctx || this.muted) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(gainLevel, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore errors during disconnect
        }
      };

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch {
      // Graceful fallback if AudioContext is blocked or closed
    }
  }

  /**
   * Play 1-minute warning ding (C5 -> G5)
   */
  playWarningDing() {
    if (this.muted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5 (523.25Hz) followed by G5 (783.99Hz)
    this._playTone(523.25, now, 0.25, 'sine', 0.2);
    this._playTone(783.99, now + 0.22, 0.45, 'sine', 0.25);
  }

  /**
   * Play 4-note finish chime (E5 -> C5 -> D5 -> G4) with subtle bell harmonics
   */
  playFinishChime() {
    if (this.muted) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Classic 4-note Westminster-inspired school chime
    const notes = [
      { freq: 659.25, time: 0.0, dur: 0.5 }, // E5 (미)
      { freq: 523.25, time: 0.45, dur: 0.5 }, // C5 (도)
      { freq: 587.33, time: 0.9, dur: 0.5 }, // D5 (레)
      { freq: 392.00, time: 1.35, dur: 1.0 } // G4 (솔)
    ];

    notes.forEach(note => {
      this._playTone(note.freq, now + note.time, note.dur, 'triangle', 0.3);
      // Subtle harmonics for a warm school bell sound
      this._playTone(note.freq * 2, now + note.time, note.dur * 0.7, 'sine', 0.1);
    });
  }
}
