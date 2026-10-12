// tests/app-controller.test.mjs
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../app.js';
import { TimerEngine } from '../src/timer-core.js';
import { SoundEngine } from '../src/sound-engine.js';

/**
 * Lightweight mock DOM factory for testing AppController without heavy browser dependencies.
 */
function createMockDOM() {
  const listeners = new Map();

  class MockClassList {
    constructor() {
      this.classes = new Set();
    }
    add(...names) {
      names.forEach(n => this.classes.add(n));
    }
    remove(...names) {
      names.forEach(n => this.classes.delete(n));
    }
    toggle(name, force) {
      if (force !== undefined) {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      }
      if (this.classes.has(name)) {
        this.classes.delete(name);
        return false;
      }
      this.classes.add(name);
      return true;
    }
    contains(name) {
      return this.classes.has(name);
    }
  }

  class MockElement {
    constructor(id, tagName = 'div') {
      this.id = id;
      this.tagName = tagName.toUpperCase();
      this.classList = new MockClassList();
      this.style = {};
      this.attributes = new Map();
      this.textContent = '';
      this.value = '';
      this._eventListeners = new Map();
      this.tabIndex = 0;
    }

    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }

    getAttribute(k) {
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }

    removeAttribute(k) {
      this.attributes.delete(k);
    }

    addEventListener(event, handler) {
      if (!this._eventListeners.has(event)) {
        this._eventListeners.set(event, []);
      }
      this._eventListeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
      if (!this._eventListeners.has(event)) return;
      const list = this._eventListeners.get(event).filter(h => h !== handler);
      this._eventListeners.set(event, list);
    }

    dispatchEvent(evt) {
      const eventType = evt.type || evt;
      const eventObj = typeof evt === 'string' ? { type: evt, target: this, preventDefault() {} } : evt;
      if (!eventObj.target) eventObj.target = this;
      if (!eventObj.preventDefault) eventObj.preventDefault = () => {};

      const handlers = this._eventListeners.get(eventType) || [];
      for (const h of handlers) {
        h(eventObj);
      }
      return true;
    }

    click() {
      this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
    }

    focus() {
      mockDoc.activeElement = this;
      this.dispatchEvent({ type: 'focus', target: this });
      mockDoc.dispatchEvent({ type: 'focusin', target: this });
    }

    blur() {
      if (mockDoc.activeElement === this) {
        mockDoc.activeElement = mockDoc.body;
      }
      this.dispatchEvent({ type: 'blur', target: this });
    }
  }

  const elements = {
    'activity-title': new MockElement('activity-title', 'h1'),
    'btn-mute': new MockElement('btn-mute', 'button'),
    'btn-fullscreen': new MockElement('btn-fullscreen', 'button'),
    'timer-display': new MockElement('timer-display', 'div'),
    'progress-bar-container': new MockElement('progress-bar-container', 'div'),
    'progress-bar': new MockElement('progress-bar', 'div'),
    'finish-banner': new MockElement('finish-banner', 'div'),
    'preset-5': new MockElement('preset-5', 'button'),
    'preset-10': new MockElement('preset-10', 'button'),
    'preset-15': new MockElement('preset-15', 'button'),
    'btn-toggle-start': new MockElement('btn-toggle-start', 'button'),
    'btn-reset': new MockElement('btn-reset', 'button'),
    'btn-add-minute': new MockElement('btn-add-minute', 'button'),
    'input-minutes': new MockElement('input-minutes', 'input'),
    'input-seconds': new MockElement('input-seconds', 'input'),
    'btn-set-custom': new MockElement('btn-set-custom', 'button'),
  };

  elements['activity-title'].textContent = '수업 활동 시간';
  elements['btn-mute'].textContent = '🔔';
  elements['btn-fullscreen'].textContent = '⛶';
  elements['timer-display'].textContent = '05:00';
  elements['btn-toggle-start'].textContent = '시작';
  elements['btn-reset'].textContent = '초기화';
  elements['btn-add-minute'].textContent = '+1분';
  elements['preset-5'].textContent = '5분';
  elements['preset-10'].textContent = '10분';
  elements['preset-15'].textContent = '15분';
  elements['btn-set-custom'].textContent = '설정';

  const docListeners = new Map();
  const winListeners = new Map();

  const mockBody = new MockElement('body', 'body');

  const mockDoc = {
    body: mockBody,
    activeElement: mockBody,
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: async () => {
        mockDoc.fullscreenElement = mockDoc.documentElement;
        mockDoc.dispatchEvent({ type: 'fullscreenchange' });
      }
    },
    exitFullscreen: async () => {
      mockDoc.fullscreenElement = null;
      mockDoc.dispatchEvent({ type: 'fullscreenchange' });
    },
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(event, handler) {
      if (!docListeners.has(event)) docListeners.set(event, []);
      docListeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      if (!docListeners.has(event)) return;
      docListeners.set(event, docListeners.get(event).filter(h => h !== handler));
    },
    dispatchEvent(evt) {
      const handlers = docListeners.get(evt.type) || [];
      for (const h of handlers) h(evt);
    }
  };

  const mockStorage = (() => {
    let store = new Map();
    return {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };
  })();

  const mockWindow = {
    alertCalls: [],
    promptReturn: null,
    alert(msg) {
      this.alertCalls.push(msg);
    },
    prompt(msg, def) {
      return this.promptReturn !== undefined ? this.promptReturn : def;
    },
    addEventListener(event, handler) {
      if (!winListeners.has(event)) winListeners.set(event, []);
      winListeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      if (!winListeners.has(event)) return;
      winListeners.set(event, winListeners.get(event).filter(h => h !== handler));
    },
    dispatchEvent(evt) {
      const handlers = winListeners.get(evt.type) || [];
      for (const h of handlers) h(evt);
    }
  };

  return {
    elements,
    document: mockDoc,
    window: mockWindow,
    storage: mockStorage
  };
}

describe('AppController Initialization & Default DOM State', () => {
  test('initializes with 05:00 display, 100% progress, and active 5-minute preset', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    assert.equal(mock.elements['timer-display'].textContent, '05:00');
    assert.equal(mock.elements['progress-bar'].style.width, '100%');
    assert.equal(mock.elements['preset-5'].classList.contains('active'), true);
    assert.equal(mock.elements['preset-10'].classList.contains('active'), false);
    assert.equal(mock.elements['preset-15'].classList.contains('active'), false);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '시작');
    assert.equal(mock.elements['btn-mute'].textContent, '🔔');
    assert.equal(mock.elements['btn-fullscreen'].textContent, '⛶');
  });

  test('restores saved activity title from localStorage on initialization', () => {
    const mock = createMockDOM();
    mock.storage.setItem('classroom_timer_title', '과학 실험 시간');

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    assert.equal(mock.elements['activity-title'].textContent, '과학 실험 시간');
  });
});

describe('Preset Buttons Behavior', () => {
  test('clicking preset-10 sets duration to 10:00 and marks it active', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['preset-10'].click();

    assert.equal(mock.elements['timer-display'].textContent, '10:00');
    assert.equal(mock.elements['preset-5'].classList.contains('active'), false);
    assert.equal(mock.elements['preset-10'].classList.contains('active'), true);
    assert.equal(mock.elements['preset-15'].classList.contains('active'), false);
    assert.equal(app.timer.totalDuration, 600);
    assert.equal(app.timer.remainingSeconds, 600);
  });

  test('clicking preset-15 sets duration to 15:00 and marks it active', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['preset-15'].click();

    assert.equal(mock.elements['timer-display'].textContent, '15:00');
    assert.equal(mock.elements['preset-15'].classList.contains('active'), true);
    assert.equal(app.timer.totalDuration, 900);
  });

  test('clicking preset stops running timer and resets toggle button to 시작', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['btn-toggle-start'].click();
    assert.equal(app.timer.isRunning, true);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '일시정지');

    mock.elements['preset-10'].click();
    assert.equal(app.timer.isRunning, false);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '시작');
  });
});

describe('Custom Time Inputs', () => {
  test('setting valid minutes and seconds sets timer and clears preset active classes', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['input-minutes'].value = '3';
    mock.elements['input-seconds'].value = '30';
    mock.elements['btn-set-custom'].click();

    assert.equal(mock.elements['timer-display'].textContent, '03:30');
    assert.equal(app.timer.totalDuration, 210);
    assert.equal(mock.elements['preset-5'].classList.contains('active'), false);
    assert.equal(mock.elements['preset-10'].classList.contains('active'), false);
    assert.equal(mock.elements['preset-15'].classList.contains('active'), false);
  });

  test('pressing Enter in custom input triggers set-custom', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['input-minutes'].value = '7';
    mock.elements['input-seconds'].value = '0';
    mock.elements['input-minutes'].dispatchEvent({ type: 'keydown', key: 'Enter' });

    assert.equal(mock.elements['timer-display'].textContent, '07:00');
    assert.equal(app.timer.totalDuration, 420);
  });

  test('submitting 0 or empty custom time triggers alert/feedback without altering timer', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    const prevDuration = app.timer.totalDuration;
    mock.elements['input-minutes'].value = '0';
    mock.elements['input-seconds'].value = '0';
    mock.elements['btn-set-custom'].click();

    assert.equal(app.timer.totalDuration, prevDuration);
    assert.ok(mock.window.alertCalls.length > 0 || mock.elements['input-minutes'].classList.contains('input-error'));
  });
});

describe('Action Buttons (Start, Pause, Reset, Add Minute)', () => {
  test('btn-toggle-start initializes sound engine and starts/pauses timer', () => {
    const mock = createMockDOM();
    let initCalled = false;
    const soundMock = new SoundEngine();
    soundMock.init = () => { initCalled = true; };

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage,
      sound: soundMock
    });

    mock.elements['btn-toggle-start'].click();
    assert.equal(initCalled, true);
    assert.equal(app.timer.isRunning, true);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '일시정지');

    mock.elements['btn-toggle-start'].click();
    assert.equal(app.timer.isRunning, false);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '시작');
  });

  test('btn-reset resets timer, clears warning/finished classes, and resets button text', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.document.body.classList.add('state-warning');
    mock.elements['btn-toggle-start'].click();

    mock.elements['btn-reset'].click();
    assert.equal(app.timer.isRunning, false);
    assert.equal(app.timer.remainingSeconds, app.timer.totalDuration);
    assert.equal(mock.document.body.classList.contains('state-warning'), false);
    assert.equal(mock.document.body.classList.contains('state-finished'), false);
    assert.equal(mock.elements['btn-toggle-start'].textContent, '시작');
  });

  test('btn-add-minute adds 60 seconds and updates display', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['btn-add-minute'].click();
    assert.equal(app.timer.remainingSeconds, 360);
    assert.equal(mock.elements['timer-display'].textContent, '06:00');
  });
});

describe('Mute and Fullscreen Controls', () => {
  test('btn-mute toggles sound mute state and updates icon / aria-label', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['btn-mute'].click();
    assert.equal(app.sound.isMuted(), true);
    assert.equal(mock.elements['btn-mute'].textContent, '🔕');
    assert.match(mock.elements['btn-mute'].getAttribute('aria-label') || '', /음소거/);

    mock.elements['btn-mute'].click();
    assert.equal(app.sound.isMuted(), false);
    assert.equal(mock.elements['btn-mute'].textContent, '🔔');
  });

  test('btn-fullscreen requests fullscreen and toggles icon on fullscreenchange', async () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['btn-fullscreen'].click();
    await Promise.resolve();

    assert.equal(mock.elements['btn-fullscreen'].textContent, '⤓');

    await mock.document.exitFullscreen();
    assert.equal(mock.elements['btn-fullscreen'].textContent, '⛶');
  });
});

describe('Activity Title Editing & LocalStorage', () => {
  test('clicking activity title prompts user and saves to localStorage', () => {
    const mock = createMockDOM();
    mock.window.promptReturn = '수학 문제 풀이';

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['activity-title'].click();
    assert.equal(mock.elements['activity-title'].textContent, '수학 문제 풀이');
    assert.equal(mock.storage.getItem('classroom_timer_title'), '수학 문제 풀이');
  });

  test('cancelling or entering empty title preserves previous title', () => {
    const mock = createMockDOM();
    mock.window.promptReturn = '';

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.elements['activity-title'].click();
    assert.equal(mock.elements['activity-title'].textContent, '수업 활동 시간');
  });
});

describe('State Synchronization & Audio Triggers', () => {
  test('warning state (<= 60s) adds state-warning to body and triggers playWarningDing', () => {
    const mock = createMockDOM();
    let warningDingFired = false;
    const soundMock = new SoundEngine();
    soundMock.playWarningDing = () => { warningDingFired = true; };

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage,
      sound: soundMock
    });

    // Simulate state change to warning
    app.handleStateChange({
      remainingSeconds: 60,
      totalDuration: 300,
      isRunning: true,
      isWarning: true,
      isFinished: false
    });

    assert.equal(mock.document.body.classList.contains('state-warning'), true);
    assert.equal(mock.document.body.classList.contains('state-finished'), false);

    app.handleWarning(60);
    assert.equal(warningDingFired, true);
  });

  test('finished state (0s) adds state-finished to body and triggers playFinishChime', () => {
    const mock = createMockDOM();
    let finishChimeFired = false;
    const soundMock = new SoundEngine();
    soundMock.playFinishChime = () => { finishChimeFired = true; };

    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage,
      sound: soundMock
    });

    app.handleStateChange({
      remainingSeconds: 0,
      totalDuration: 300,
      isRunning: false,
      isWarning: false,
      isFinished: true
    });

    assert.equal(mock.document.body.classList.contains('state-finished'), true);
    assert.equal(mock.document.body.classList.contains('state-warning'), false);

    app.handleFinish();
    assert.equal(finishChimeFired, true);
  });
});

describe('Auto-hide Controls (Inactivity)', () => {
  test('adds controls-hidden class after 3s of inactivity while running', async () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage,
      inactivityTimeoutMs: 10
    });

    // Start timer
    mock.elements['btn-toggle-start'].click();
    assert.equal(mock.document.body.classList.contains('controls-hidden'), false);

    // Wait for inactivity timeout
    await new Promise(r => setTimeout(r, 25));
    assert.equal(mock.document.body.classList.contains('controls-hidden'), true);

    // Activity should reveal controls
    mock.window.dispatchEvent({ type: 'mousemove' });
    assert.equal(mock.document.body.classList.contains('controls-hidden'), false);

    app.destroy();
  });

  test('pausing or resetting immediately removes controls-hidden and cancels auto-hide', async () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage,
      inactivityTimeoutMs: 10
    });

    mock.elements['btn-toggle-start'].click();
    await new Promise(r => setTimeout(r, 25));
    assert.equal(mock.document.body.classList.contains('controls-hidden'), true);

    // Pause timer
    mock.elements['btn-toggle-start'].click();
    assert.equal(mock.document.body.classList.contains('controls-hidden'), false);

    // Even after delay, controls-hidden should not re-appear while paused
    await new Promise(r => setTimeout(r, 25));
    assert.equal(mock.document.body.classList.contains('controls-hidden'), false);

    app.destroy();
  });
});

describe('Keyboard Shortcuts', () => {
  test('Space toggles start/pause when activeElement is not an input', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.window.dispatchEvent({ type: 'keydown', code: 'Space', key: ' ' });
    assert.equal(app.timer.isRunning, true);

    mock.window.dispatchEvent({ type: 'keydown', code: 'Space', key: ' ' });
    assert.equal(app.timer.isRunning, false);
    app.destroy();
  });

  test('Space is ignored when activeElement is an input', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.document.activeElement = mock.elements['input-minutes'];
    mock.window.dispatchEvent({ type: 'keydown', code: 'Space', key: ' ' });
    assert.equal(app.timer.isRunning, false);
    app.destroy();
  });

  test('KeyR resets timer when activeElement is not an input', () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    app.timer.remainingSeconds = 120;
    mock.window.dispatchEvent({ type: 'keydown', code: 'KeyR', key: 'r' });
    assert.equal(app.timer.remainingSeconds, 300);
    app.destroy();
  });

  test('KeyF toggles fullscreen when activeElement is not an input', async () => {
    const mock = createMockDOM();
    const app = new AppController({
      document: mock.document,
      window: mock.window,
      storage: mock.storage
    });

    mock.window.dispatchEvent({ type: 'keydown', code: 'KeyF', key: 'f' });
    await Promise.resolve();
    assert.ok(mock.document.fullscreenElement !== null);

    mock.window.dispatchEvent({ type: 'keydown', code: 'Escape', key: 'Escape' });
    await Promise.resolve();
    assert.equal(mock.document.fullscreenElement, null);
    app.destroy();
  });
});
