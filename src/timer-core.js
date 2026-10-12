/**
 * Classroom TV Timer - Core Timer Engine
 * Zero external dependencies. Modern ES Module.
 */

/**
 * Format totalSeconds into MM:SS (or HH:MM:SS if >= 3600).
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parse minute and second string inputs into valid non-negative seconds.
 * @param {string} minutesStr
 * @param {string} secondsStr
 * @returns {number}
 */
export function parseCustomTime(minutesStr, secondsStr) {
  const mins = parseInt(minutesStr, 10);
  const secs = parseInt(secondsStr, 10);
  const validMins = Number.isFinite(mins) && mins >= 0 ? mins : 0;
  const validSecs = Number.isFinite(secs) && secs >= 0 ? secs : 0;
  return (validMins * 60) + validSecs;
}

/**
 * Accurate countdown timer engine with drift compensation via Date.now().
 */
export class TimerEngine {
  constructor({
    onTick = () => {},
    onWarning = () => {},
    onFinish = () => {},
    onStateChange = () => {}
  } = {}) {
    this.onTick = onTick;
    this.onWarning = onWarning;
    this.onFinish = onFinish;
    this.onStateChange = onStateChange;

    this.totalDuration = 300;
    this.remainingSeconds = 300;
    this.isRunning = false;
    this.timerId = null;
    this.lastTimestamp = null;
    this.warningFired = false;
  }

  setDuration(seconds) {
    const valid = Math.max(0, Math.floor(Number(seconds) || 0));
    this.pause();
    this.totalDuration = valid;
    this.remainingSeconds = valid;
    this.warningFired = false;
    this._notify();
  }

  addSeconds(seconds) {
    if (this.isFinished()) return;
    const added = Math.max(0, Math.floor(Number(seconds) || 0));
    this.remainingSeconds = Math.max(0, this.remainingSeconds + added);
    this.totalDuration = Math.max(this.totalDuration, this.remainingSeconds);
    if (this.remainingSeconds > 60) {
      this.warningFired = false;
    }
    this._notify();
  }

  start() {
    if (this.isRunning || this.remainingSeconds <= 0) return;
    this.isRunning = true;
    this.lastTimestamp = Date.now();
    this._notify();

    this.timerId = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsed);
      const roundedRemaining = Math.ceil(this.remainingSeconds);

      if (roundedRemaining <= 60 && !this.warningFired && roundedRemaining > 0) {
        this.warningFired = true;
        this.onWarning(roundedRemaining);
      }

      this._notify();

      if (this.remainingSeconds <= 0) {
        this.pause();
        this.remainingSeconds = 0;
        this.onFinish();
        this._notify();
      }
    }, 100);
  }

  pause() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    this._notify();
  }

  reset() {
    this.pause();
    this.remainingSeconds = this.totalDuration;
    this.warningFired = false;
    this._notify();
  }

  isFinished() {
    return this.remainingSeconds <= 0;
  }

  getState() {
    const rounded = Math.ceil(this.remainingSeconds);
    return {
      remainingSeconds: rounded,
      rawRemaining: this.remainingSeconds,
      totalDuration: this.totalDuration,
      isRunning: this.isRunning,
      isWarning: rounded > 0 && rounded <= 60,
      isFinished: this.remainingSeconds <= 0 && this.totalDuration > 0
    };
  }

  _notify() {
    const state = this.getState();
    this.onTick(state);
    this.onStateChange(state);
  }
}
