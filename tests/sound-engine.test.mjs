import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/sound-engine.js';

describe('SoundEngine mute state management', () => {
  test('initial state defaults to unmuted', () => {
    const sound = new SoundEngine();
    assert.equal(sound.isMuted(), false);
  });

  test('initial state respects isMuted constructor option', () => {
    const soundMuted = new SoundEngine({ isMuted: true });
    assert.equal(soundMuted.isMuted(), true);

    const soundUnmuted = new SoundEngine({ isMuted: false });
    assert.equal(soundUnmuted.isMuted(), false);
  });

  test('toggleMute toggles mute state and returns the new boolean value', () => {
    const sound = new SoundEngine({ isMuted: false });
    assert.equal(sound.isMuted(), false);

    const mutedState = sound.toggleMute();
    assert.equal(mutedState, true);
    assert.equal(sound.isMuted(), true);

    const unmutedState = sound.toggleMute();
    assert.equal(unmutedState, false);
    assert.equal(sound.isMuted(), false);
  });

  test('setMute updates mute state and coerces to boolean', () => {
    const sound = new SoundEngine();
    sound.setMute(true);
    assert.equal(sound.isMuted(), true);

    sound.setMute(false);
    assert.equal(sound.isMuted(), false);

    sound.setMute(1);
    assert.equal(sound.isMuted(), true);

    sound.setMute(0);
    assert.equal(sound.isMuted(), false);
  });
});

describe('SoundEngine safe fallback when AudioContext is unavailable', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    delete globalThis.window;
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  });

  test('init does not throw in Node.js environment without window', () => {
    const sound = new SoundEngine();
    assert.doesNotThrow(() => sound.init());
  });

  test('sound triggers do not throw in non-browser environment without AudioContext', () => {
    const sound = new SoundEngine();
    assert.doesNotThrow(() => sound.playWarningDing());
    assert.doesNotThrow(() => sound.playFinishChime());
  });

  test('init and sound triggers do not throw when window exists but AudioContext is missing', () => {
    globalThis.window = {};
    const sound = new SoundEngine();
    assert.doesNotThrow(() => sound.init());
    assert.doesNotThrow(() => sound.playWarningDing());
    assert.doesNotThrow(() => sound.playFinishChime());
  });
});

describe('SoundEngine Web Audio API playback with mock AudioContext', () => {
  let createdOscillators = [];
  let createdGains = [];
  let resumeCallCount = 0;
  let mockContextState = 'suspended';
  const originalWindow = globalThis.window;

  class MockAudioParam {
    constructor(initialValue = 0) {
      this.value = initialValue;
      this.calls = [];
    }

    setValueAtTime(val, time) {
      this.value = val;
      this.calls.push({ method: 'setValueAtTime', value: val, time });
    }

    exponentialRampToValueAtTime(val, time) {
      this.calls.push({ method: 'exponentialRampToValueAtTime', value: val, time });
    }
  }

  class MockOscillatorNode {
    constructor() {
      this.type = 'sine';
      this.frequency = new MockAudioParam(440);
      this.connectedTo = null;
      this.startedAt = null;
      this.stoppedAt = null;
      this.onended = null;
      this.disconnected = false;
      createdOscillators.push(this);
    }

    connect(target) {
      this.connectedTo = target;
    }

    disconnect() {
      this.connectedTo = null;
      this.disconnected = true;
    }

    start(time) {
      this.startedAt = time;
    }

    stop(time) {
      this.stoppedAt = time;
    }
  }

  class MockGainNode {
    constructor() {
      this.gain = new MockAudioParam(1);
      this.connectedTo = null;
      this.disconnected = false;
      createdGains.push(this);
    }

    connect(target) {
      this.connectedTo = target;
    }

    disconnect() {
      this.connectedTo = null;
      this.disconnected = true;
    }
  }

  class MockAudioContext {
    constructor() {
      this.currentTime = 10.0;
      this.destination = { type: 'destination' };
      this.state = mockContextState;
    }

    resume() {
      resumeCallCount++;
      this.state = 'running';
      return Promise.resolve();
    }

    createOscillator() {
      return new MockOscillatorNode();
    }

    createGain() {
      return new MockGainNode();
    }
  }

  beforeEach(() => {
    createdOscillators = [];
    createdGains = [];
    resumeCallCount = 0;
    mockContextState = 'suspended';

    globalThis.window = {
      AudioContext: MockAudioContext
    };
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  });

  test('init creates AudioContext and masterGain lazily and resumes if suspended', () => {
    const sound = new SoundEngine();
    sound.init();

    assert.equal(resumeCallCount, 1);
    assert.ok(sound.masterGain);
    assert.equal(sound.masterGain.connectedTo, sound.audioCtx.destination);
    assert.equal(sound.masterGain.gain.value, 1);
  });

  test('masterGain initializes with 0 when isMuted is true', () => {
    const sound = new SoundEngine({ isMuted: true });
    sound.init();

    assert.ok(sound.masterGain);
    assert.equal(sound.masterGain.gain.value, 0);
  });

  test('masterGain provides instant muting and restores to 1 on unmute', () => {
    const sound = new SoundEngine();
    sound.init();

    assert.equal(sound.masterGain.gain.value, 1);

    // Mute immediately sets masterGain to 0
    sound.toggleMute();
    assert.equal(sound.masterGain.gain.value, 0);

    // Unmute immediately restores masterGain to 1
    sound.toggleMute();
    assert.equal(sound.masterGain.gain.value, 1);

    // setMute explicitly
    sound.setMute(true);
    assert.equal(sound.masterGain.gain.value, 0);

    sound.setMute(false);
    assert.equal(sound.masterGain.gain.value, 1);
  });

  test('self-heals audio context when state is closed', () => {
    const sound = new SoundEngine();
    sound.init();

    const originalCtx = sound.audioCtx;
    const originalMasterGain = sound.masterGain;

    // Simulate browser closing AudioContext (e.g., system sleep or device change)
    sound.audioCtx.state = 'closed';

    // Next interaction should recreate AudioContext and masterGain
    sound.init();

    assert.notEqual(sound.audioCtx, originalCtx);
    assert.notEqual(sound.masterGain, originalMasterGain);
    assert.equal(sound.masterGain.connectedTo, sound.audioCtx.destination);
  });

  test('playWarningDing routes tones to masterGain and cleans up nodes on onended', () => {
    const sound = new SoundEngine();
    sound.playWarningDing();

    // 1 master gain + 2 tone gains = 3 gains
    assert.equal(createdGains.length, 3);
    assert.equal(createdOscillators.length, 2);

    const masterGain = createdGains[0];
    const [firstOsc, secondOsc] = createdOscillators;
    const firstGain = createdGains[1];
    const secondGain = createdGains[2];

    assert.equal(masterGain.connectedTo, sound.audioCtx.destination);
    assert.equal(firstOsc.connectedTo, firstGain);
    assert.equal(firstGain.connectedTo, masterGain);
    assert.equal(secondOsc.connectedTo, secondGain);
    assert.equal(secondGain.connectedTo, masterGain);

    assert.equal(firstOsc.type, 'sine');
    assert.equal(firstOsc.frequency.value, 523.25);
    assert.equal(firstOsc.startedAt, 10.0);
    assert.equal(firstOsc.stoppedAt, 10.0 + 0.25);

    assert.equal(secondOsc.type, 'sine');
    assert.equal(secondOsc.frequency.value, 783.99);
    assert.equal(secondOsc.startedAt, 10.22);
    assert.equal(secondOsc.stoppedAt, 10.22 + 0.45);

    // Test onended cleanup
    assert.equal(typeof firstOsc.onended, 'function');
    assert.equal(firstOsc.disconnected, false);
    assert.equal(firstGain.disconnected, false);

    firstOsc.onended();

    assert.equal(firstOsc.disconnected, true);
    assert.equal(firstGain.disconnected, true);
  });

  test('playFinishChime routes 4 notes and harmonics to masterGain', () => {
    const sound = new SoundEngine();
    sound.playFinishChime();

    // 1 masterGain + 8 tone gains = 9 gains
    assert.equal(createdGains.length, 9);
    assert.equal(createdOscillators.length, 8);

    const masterGain = sound.masterGain;
    const baseFrequencies = [659.25, 523.25, 587.33, 392.00];

    for (let i = 0; i < 4; i++) {
      const fundOsc = createdOscillators[i * 2];
      const harmOsc = createdOscillators[i * 2 + 1];
      const fundGain = createdGains[1 + i * 2];
      const harmGain = createdGains[1 + i * 2 + 1];

      assert.equal(fundOsc.type, 'triangle');
      assert.equal(fundOsc.frequency.value, baseFrequencies[i]);
      assert.equal(fundGain.connectedTo, masterGain);

      assert.equal(harmOsc.type, 'sine');
      assert.equal(harmOsc.frequency.value, baseFrequencies[i] * 2);
      assert.equal(harmGain.connectedTo, masterGain);

      assert.equal(typeof fundOsc.onended, 'function');
      fundOsc.onended();
      assert.equal(fundOsc.disconnected, true);
      assert.equal(fundGain.disconnected, true);
    }
  });

  test('playWarningDing and playFinishChime do not produce sound when muted', () => {
    const sound = new SoundEngine({ isMuted: true });

    sound.playWarningDing();
    assert.equal(createdOscillators.length, 0);

    sound.playFinishChime();
    assert.equal(createdOscillators.length, 0);
  });

  test('gracefully handles AudioContext createOscillator throwing errors', () => {
    globalThis.window.AudioContext = class ErrorAudioContext extends MockAudioContext {
      createOscillator() {
        throw new Error('AudioContext locked or invalid state');
      }
    };

    const sound = new SoundEngine();
    assert.doesNotThrow(() => sound.playWarningDing());
    assert.doesNotThrow(() => sound.playFinishChime());
  });

  test('gracefully handles resume() failure or rejection', () => {
    globalThis.window.AudioContext = class RejectAudioContext extends MockAudioContext {
      resume() {
        throw new Error('Autoplay policy prevented audio resumption');
      }
    };

    const sound = new SoundEngine();
    assert.doesNotThrow(() => sound.init());
    assert.doesNotThrow(() => sound.playWarningDing());
  });

  test('supports webkitAudioContext fallback if standard AudioContext is absent', () => {
    delete globalThis.window.AudioContext;
    globalThis.window.webkitAudioContext = MockAudioContext;

    const sound = new SoundEngine();
    sound.playWarningDing();
    assert.equal(createdOscillators.length, 2);
  });
});
