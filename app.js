/**
 * Classroom TV Timer - Application Controller
 * Coordinates UI events, TimerEngine, SoundEngine, auto-hide, and shortcuts.
 * Pure vanilla ES Module. Zero external dependencies.
 */
import { TimerEngine, formatTime, parseCustomTime } from './src/timer-core.js';
import { SoundEngine } from './src/sound-engine.js';

const STORAGE_KEY_TITLE = 'classroom_timer_title';

export class AppController {
  constructor({
    document: customDocument,
    window: customWindow,
    storage: customStorage,
    timer: customTimer,
    sound: customSound,
    inactivityTimeoutMs = 3000
  } = {}) {
    this.doc = customDocument || (typeof document !== 'undefined' ? document : null);
    this.win = customWindow || (typeof window !== 'undefined' ? window : null);
    this.storage = customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.inactivityTimeoutMs = inactivityTimeoutMs;

    this.sound = customSound || new SoundEngine();
    this.inactivityTimer = null;
    this.audioInitialized = false;
    this._wasRunning = false;

    // Cache element references
    this._bindElements();

    // Setup TimerEngine
    this.timer = customTimer || new TimerEngine({
      onTick: (state) => this.handleTick(state),
      onWarning: (remaining) => this.handleWarning(remaining),
      onFinish: () => this.handleFinish(),
      onStateChange: (state) => this.handleStateChange(state)
    });

    // Setup event listeners
    this._bindEvents();

    // Initial render / sync
    this._initUI();
  }

  _bindElements() {
    if (!this.doc) return;
    this.activityTitle = this.doc.getElementById('activity-title');
    this.btnMute = this.doc.getElementById('btn-mute');
    this.btnFullscreen = this.doc.getElementById('btn-fullscreen');
    this.timerDisplay = this.doc.getElementById('timer-display');
    this.progressBarContainer = this.doc.getElementById('progress-bar-container');
    this.progressBar = this.doc.getElementById('progress-bar');
    this.finishBanner = this.doc.getElementById('finish-banner');

    this.preset5 = this.doc.getElementById('preset-5');
    this.preset10 = this.doc.getElementById('preset-10');
    this.preset15 = this.doc.getElementById('preset-15');
    this.presets = [
      { el: this.preset5, seconds: 300 },
      { el: this.preset10, seconds: 600 },
      { el: this.preset15, seconds: 900 }
    ].filter(p => Boolean(p.el));

    this.btnToggleStart = this.doc.getElementById('btn-toggle-start');
    this.btnReset = this.doc.getElementById('btn-reset');
    this.btnAddMinute = this.doc.getElementById('btn-add-minute');

    this.inputMinutes = this.doc.getElementById('input-minutes');
    this.inputSeconds = this.doc.getElementById('input-seconds');
    this.btnSetCustom = this.doc.getElementById('btn-set-custom');
  }

  _initUI() {
    if (!this.doc) return;

    // Restore saved activity title
    if (this.storage && this.activityTitle) {
      try {
        const savedTitle = this.storage.getItem(STORAGE_KEY_TITLE);
        if (savedTitle && savedTitle.trim()) {
          this.activityTitle.textContent = savedTitle.trim();
        }
      } catch {
        // Safe fallback if localStorage is disabled or restricted
      }
    }

    // Default 5 min preset active
    this._setActivePreset(300);

    // Initial mute and fullscreen button updates
    this._updateMuteButton();
    this._updateFullscreenButton();

    // Sync timer display & progress bar with initial timer state
    const state = this.timer ? this.timer.getState() : {
      remainingSeconds: 300,
      totalDuration: 300,
      isRunning: false,
      isWarning: false,
      isFinished: false
    };
    this._syncState(state);
  }

  _setActivePreset(seconds) {
    this.presets.forEach(p => {
      if (p.seconds === seconds) {
        p.el.classList.add('active');
      } else {
        p.el.classList.remove('active');
      }
    });
  }

  _clearActivePresets() {
    this.presets.forEach(p => p.el.classList.remove('active'));
  }

  _clearCustomInputs() {
    if (this.inputMinutes) this.inputMinutes.value = '';
    if (this.inputSeconds) this.inputSeconds.value = '';
  }

  initAudio() {
    if (!this.audioInitialized) {
      this.sound.init();
      this.audioInitialized = true;
    }
  }

  setPreset(seconds) {
    this.initAudio();
    this.timer.setDuration(seconds);
    this._setActivePreset(seconds);
    this._clearCustomInputs();
    this.clearInactivityTimer();
    this._wasRunning = false;
    if (this.doc && this.doc.body) {
      this.doc.body.classList.remove('controls-hidden');
    }
  }

  applyCustomTime() {
    this.initAudio();
    const mins = this.inputMinutes ? this.inputMinutes.value : '';
    const secs = this.inputSeconds ? this.inputSeconds.value : '';
    const total = parseCustomTime(mins, secs);

    if (total > 0) {
      this.timer.setDuration(total);
      const matched = this.presets.find(p => p.seconds === total);
      if (matched) {
        this._setActivePreset(total);
      } else {
        this._clearActivePresets();
      }
      this.clearInactivityTimer();
      this._wasRunning = false;
      if (this.doc && this.doc.body) {
        this.doc.body.classList.remove('controls-hidden');
      }
      if (this.inputMinutes) this.inputMinutes.classList.remove('input-error');
      if (this.inputSeconds) this.inputSeconds.classList.remove('input-error');
    } else {
      if (this.inputMinutes) this.inputMinutes.classList.add('input-error');
      if (this.inputSeconds) this.inputSeconds.classList.add('input-error');
      if (this.win && typeof this.win.alert === 'function') {
        try {
          this.win.alert('1초 이상의 유효한 시간을 입력해주세요.');
        } catch {}
      }
      if (this.inputMinutes && typeof this.inputMinutes.focus === 'function') {
        this.inputMinutes.focus();
      }
    }
  }

  toggleStart() {
    this.initAudio();
    if (this.timer.isRunning) {
      this.timer.pause();
    } else {
      if (this.timer.remainingSeconds <= 0) {
        this.timer.reset();
      }
      this.timer.start();
    }
  }

  resetTimer() {
    this.initAudio();
    this.timer.reset();
    this._wasRunning = false;
    if (this.doc && this.doc.body) {
      this.doc.body.classList.remove('state-warning', 'state-finished', 'controls-hidden');
    }
    this.clearInactivityTimer();
  }

  addMinute() {
    this.initAudio();
    this.timer.addSeconds(60);
    const matched = this.presets.find(p => p.seconds === this.timer.totalDuration && this.timer.remainingSeconds === this.timer.totalDuration);
    if (matched) {
      this._setActivePreset(matched.seconds);
    } else {
      this._clearActivePresets();
    }
  }

  toggleMute() {
    this.initAudio();
    this.sound.toggleMute();
    this._updateMuteButton();
  }

  _updateMuteButton() {
    if (!this.btnMute) return;
    const isMuted = this.sound.isMuted();
    this.btnMute.textContent = isMuted ? '🔕' : '🔔';
    this.btnMute.setAttribute('aria-label', isMuted ? '음소거 해제' : '음소거 토글');
    this.btnMute.setAttribute('title', isMuted ? '음소거 해제' : '음소거 토글');
  }

  async toggleFullscreen() {
    if (!this.doc) return;
    try {
      if (this.doc.fullscreenElement) {
        if (this.doc.exitFullscreen) {
          await this.doc.exitFullscreen();
        }
      } else {
        const root = this.doc.documentElement;
        if (root && root.requestFullscreen) {
          await root.requestFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen rejection (e.g. user gesture missing or iframe restricted)
    }
    this._updateFullscreenButton();
  }

  _updateFullscreenButton() {
    if (!this.btnFullscreen || !this.doc) return;
    const isFullscreen = Boolean(this.doc.fullscreenElement);
    this.btnFullscreen.textContent = isFullscreen ? '⤓' : '⛶';
    this.btnFullscreen.setAttribute('aria-label', isFullscreen ? '전체화면 종료' : '전체화면 토글');
    this.btnFullscreen.setAttribute('title', isFullscreen ? '전체화면 종료' : '전체화면 토글');
  }

  editActivityTitle() {
    if (!this.activityTitle) return;
    const current = this.activityTitle.textContent.trim();
    if (this.win && typeof this.win.prompt === 'function') {
      try {
        const result = this.win.prompt('활동명을 입력하세요:', current);
        if (result !== null && result.trim() !== '') {
          const trimmed = result.trim();
          this.activityTitle.textContent = trimmed;
          if (this.storage) {
            try {
              this.storage.setItem(STORAGE_KEY_TITLE, trimmed);
            } catch {}
          }
        }
      } catch {}
    }
  }

  handleTick(state) {
    this._syncState(state);
  }

  handleStateChange(state) {
    this._syncState(state);
  }

  _syncState(state) {
    if (!this.doc) return;

    // Display formatted time
    if (this.timerDisplay) {
      this.timerDisplay.textContent = formatTime(state.remainingSeconds);
    }

    // Progress bar width
    if (this.progressBar) {
      const pct = state.totalDuration > 0
        ? (state.remainingSeconds / state.totalDuration) * 100
        : 0;
      const clampedPct = Math.max(0, Math.min(100, pct));
      this.progressBar.style.width = `${clampedPct}%`;
      if (this.progressBarContainer) {
        this.progressBarContainer.setAttribute('aria-valuenow', String(Math.round(clampedPct)));
      }
    }

    // Toggle start button text & class
    if (this.btnToggleStart) {
      if (state.isRunning) {
        this.btnToggleStart.textContent = '일시정지';
        this.btnToggleStart.setAttribute('aria-label', '일시정지');
        this.btnToggleStart.classList.add('is-paused');
      } else {
        this.btnToggleStart.textContent = '시작';
        this.btnToggleStart.setAttribute('aria-label', '시작');
        this.btnToggleStart.classList.remove('is-paused');
      }
    }

    // Body state classes
    if (this.doc.body) {
      if (state.isWarning) {
        this.doc.body.classList.add('state-warning');
        this.doc.body.classList.remove('state-finished');
      } else if (state.isFinished) {
        this.doc.body.classList.add('state-finished');
        this.doc.body.classList.remove('state-warning');
      } else {
        this.doc.body.classList.remove('state-warning', 'state-finished');
      }
    }

    // Auto-hide controls sync: only trigger on running state transitions
    if (state.isRunning !== this._wasRunning) {
      this._wasRunning = state.isRunning;
      if (state.isRunning) {
        this.scheduleInactivityTimer();
      } else {
        this.clearInactivityTimer();
        if (this.doc.body) {
          this.doc.body.classList.remove('controls-hidden');
        }
      }
    }
  }

  handleWarning() {
    this.sound.playWarningDing();
  }

  handleFinish() {
    this.sound.playFinishChime();
  }

  scheduleInactivityTimer() {
    this.clearInactivityTimer();
    if (!this.timer || !this.timer.isRunning) return;

    this.inactivityTimer = setTimeout(() => {
      if (this.timer && this.timer.isRunning && this.doc && this.doc.body) {
        this.doc.body.classList.add('controls-hidden');
      }
    }, this.inactivityTimeoutMs);
  }

  clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  handleUserActivity() {
    if (this.doc && this.doc.body) {
      this.doc.body.classList.remove('controls-hidden');
    }
    if (this.timer && this.timer.isRunning) {
      this.scheduleInactivityTimer();
    }
  }

  handleKeydown(e) {
    // Ignore key combinations with modifier keys (Ctrl / Cmd / Alt) to prevent
    // hijacking browser shortcuts like reload (Ctrl+R), find (Ctrl+F), etc.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const active = this.doc ? this.doc.activeElement : null;
    const isInput = active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable ||
      active === this.activityTitle
    );

    // Escape exits fullscreen if fullscreen is active
    if (e.code === 'Escape' || e.key === 'Escape') {
      if (this.doc && this.doc.fullscreenElement) {
        if (this.doc.exitFullscreen) {
          this.doc.exitFullscreen().catch?.(() => {});
        }
      }
      return;
    }

    // Do not intercept keystrokes when editing inside inputs
    if (isInput) return;

    // Space: toggle start/pause
    if (e.code === 'Space' || e.key === ' ') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleStart();
      return;
    }

    // KeyR: reset timer
    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.resetTimer();
      return;
    }

    // KeyF: toggle fullscreen
    if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleFullscreen();
      return;
    }
  }

  _bindEvents() {
    // Presets
    if (this.preset5) {
      this._preset5Handler = () => this.setPreset(300);
      this.preset5.addEventListener('click', this._preset5Handler);
    }
    if (this.preset10) {
      this._preset10Handler = () => this.setPreset(600);
      this.preset10.addEventListener('click', this._preset10Handler);
    }
    if (this.preset15) {
      this._preset15Handler = () => this.setPreset(900);
      this.preset15.addEventListener('click', this._preset15Handler);
    }

    // Custom time
    if (this.btnSetCustom) {
      this._setCustomHandler = () => this.applyCustomTime();
      this.btnSetCustom.addEventListener('click', this._setCustomHandler);
    }
    this._inputEnterHandler = (e) => {
      if (e.key === 'Enter') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.applyCustomTime();
      }
    };
    if (this.inputMinutes) this.inputMinutes.addEventListener('keydown', this._inputEnterHandler);
    if (this.inputSeconds) this.inputSeconds.addEventListener('keydown', this._inputEnterHandler);

    // Controls
    if (this.btnToggleStart) {
      this._toggleStartHandler = () => this.toggleStart();
      this.btnToggleStart.addEventListener('click', this._toggleStartHandler);
    }
    if (this.btnReset) {
      this._resetHandler = () => this.resetTimer();
      this.btnReset.addEventListener('click', this._resetHandler);
    }
    if (this.btnAddMinute) {
      this._addMinuteHandler = () => this.addMinute();
      this.btnAddMinute.addEventListener('click', this._addMinuteHandler);
    }

    // Header buttons
    if (this.btnMute) {
      this._muteHandler = () => this.toggleMute();
      this.btnMute.addEventListener('click', this._muteHandler);
    }
    if (this.btnFullscreen) {
      this._fullscreenHandler = () => this.toggleFullscreen();
      this.btnFullscreen.addEventListener('click', this._fullscreenHandler);
    }
    if (this.doc) {
      this._fullscreenChangeHandler = () => this._updateFullscreenButton();
      this.doc.addEventListener('fullscreenchange', this._fullscreenChangeHandler);
    }

    // Activity Title editing
    if (this.activityTitle) {
      this._titleClickHandler = () => this.editActivityTitle();
      this.activityTitle.addEventListener('click', this._titleClickHandler);
      this._titleKeyHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.editActivityTitle();
        }
      };
      this.activityTitle.addEventListener('keydown', this._titleKeyHandler);
    }

    // User activity tracking for auto-hide
    this._activityHandler = () => this.handleUserActivity();
    const eventTarget = this.win || this.doc;
    if (eventTarget) {
      eventTarget.addEventListener('mousemove', this._activityHandler);
      eventTarget.addEventListener('touchstart', this._activityHandler);
    }
    if (this.doc) {
      this.doc.addEventListener('focusin', this._activityHandler);
    }

    // Keyboard shortcuts & activity
    this._keydownHandler = (e) => {
      this.handleUserActivity();
      this.handleKeydown(e);
    };
    if (eventTarget) {
      eventTarget.addEventListener('keydown', this._keydownHandler);
    }
  }

  destroy() {
    this.clearInactivityTimer();
    if (this.timer) {
      this.timer.pause();
    }
    const eventTarget = this.win || this.doc;
    if (eventTarget) {
      eventTarget.removeEventListener('mousemove', this._activityHandler);
      eventTarget.removeEventListener('touchstart', this._activityHandler);
      eventTarget.removeEventListener('keydown', this._keydownHandler);
    }
    if (this.doc) {
      this.doc.removeEventListener('focusin', this._activityHandler);
      this.doc.removeEventListener('fullscreenchange', this._fullscreenChangeHandler);
    }
  }
}

/**
 * Factory function for creating an AppController instance.
 */
export function initApp(options = {}) {
  return new AppController(options);
}

// Auto-boot in browser DOM environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.getElementById('timer-display')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.classTimerApp = initApp();
      });
    } else {
      window.classTimerApp = initApp();
    }
  }
}
