import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, parseCustomTime, TimerEngine } from '../src/timer-core.js';

describe('timer-core utilities', () => {
  test('formatTime formats seconds into MM:SS correctly', () => {
    assert.equal(formatTime(300), '05:00');
    assert.equal(formatTime(65), '01:05');
    assert.equal(formatTime(9), '00:09');
    assert.equal(formatTime(0), '00:00');
  });

  test('formatTime formats >= 3600 seconds into HH:MM:SS', () => {
    assert.equal(formatTime(3600), '01:00:00');
    assert.equal(formatTime(3665), '01:01:05');
    assert.equal(formatTime(7325), '02:02:05');
  });

  test('formatTime handles negative, NaN, and float numbers safely', () => {
    assert.equal(formatTime(-10), '00:00');
    assert.equal(formatTime(65.9), '01:05');
    assert.equal(formatTime(NaN), '00:00');
  });

  test('parseCustomTime parses minutes and seconds properly', () => {
    assert.equal(parseCustomTime('5', '0'), 300);
    assert.equal(parseCustomTime('10', '30'), 630);
    assert.equal(parseCustomTime('0', '45'), 45);
    assert.equal(parseCustomTime('-1', '0'), 0);
    assert.equal(parseCustomTime('abc', 'def'), 0);
    assert.equal(parseCustomTime('', ''), 0);
    assert.equal(parseCustomTime('5', '-10'), 300);
  });
});

describe('TimerEngine lifecycle and states', () => {
  test('initial state defaults and setDuration', () => {
    const timer = new TimerEngine();
    const initialState = timer.getState();
    assert.equal(initialState.remainingSeconds, 300);
    assert.equal(initialState.totalDuration, 300);
    assert.equal(initialState.isRunning, false);
    assert.equal(initialState.isWarning, false);
    assert.equal(initialState.isFinished, false);
    assert.equal(timer.isFinished(), false);

    timer.setDuration(600);
    const updatedState = timer.getState();
    assert.equal(updatedState.remainingSeconds, 600);
    assert.equal(updatedState.totalDuration, 600);
  });

  test('isFinished is consistent between isFinished() and getState().isFinished', () => {
    const timer = new TimerEngine();
    // Default 300s
    assert.equal(timer.isFinished(), false);
    assert.equal(timer.getState().isFinished, false);

    // setDuration(0): totalDuration is 0, so not in finished state
    timer.setDuration(0);
    assert.equal(timer.isFinished(), false);
    assert.equal(timer.getState().isFinished, false);

    // Duration > 0 and remaining reaches 0
    timer.setDuration(10);
    timer.remainingSeconds = 0;
    assert.equal(timer.isFinished(), true);
    assert.equal(timer.getState().isFinished, true);
  });

  test('setDuration and reset emit exactly one atomic notification with fresh state', () => {
    let notifyCount = 0;
    const states = [];
    const timer = new TimerEngine({
      onStateChange: (state) => {
        notifyCount++;
        states.push({ ...state });
      }
    });

    // initial call: setDuration
    notifyCount = 0;
    states.length = 0;
    timer.setDuration(120);

    assert.equal(notifyCount, 1);
    assert.equal(states[0].remainingSeconds, 120);
    assert.equal(states[0].totalDuration, 120);
    assert.equal(states[0].isRunning, false);

    // run and then reset
    timer.start();
    notifyCount = 0;
    states.length = 0;
    timer.reset();

    assert.equal(notifyCount, 1);
    assert.equal(states[0].remainingSeconds, 120);
    assert.equal(states[0].totalDuration, 120);
    assert.equal(states[0].isRunning, false);
  });

  test('addSeconds increases remaining time and extends totalDuration if exceeded', () => {
    const timer = new TimerEngine();
    timer.setDuration(100);
    timer.addSeconds(60);
    let state = timer.getState();
    assert.equal(state.remainingSeconds, 160);
    assert.equal(state.totalDuration, 160);

    // If remaining is less than total, adding seconds does not decrease totalDuration
    timer.setDuration(300);
    timer.remainingSeconds = 50; // artificially decrease
    timer.addSeconds(60);
    state = timer.getState();
    assert.equal(state.remainingSeconds, 110);
    assert.equal(state.totalDuration, 300);
  });

  test('addSeconds allows extending time when timer was finished', () => {
    const timer = new TimerEngine();
    timer.setDuration(10);
    timer.remainingSeconds = 0;
    assert.equal(timer.isFinished(), true);

    timer.addSeconds(60);
    const state = timer.getState();
    assert.equal(state.remainingSeconds, 60);
    assert.equal(state.isFinished, false);
    assert.equal(timer.isFinished(), false);
  });

  test('warning flag behaves correctly around 60 seconds threshold', () => {
    let warningFired = false;
    const timer = new TimerEngine({
      onWarning: () => { warningFired = true; }
    });
    timer.setDuration(60);
    assert.equal(timer.getState().isWarning, true);

    timer.setDuration(61);
    assert.equal(timer.getState().isWarning, false);
  });

  test('start, pause, and reset change running state and reset remaining time', () => {
    const timer = new TimerEngine();
    timer.setDuration(120);

    timer.start();
    assert.equal(timer.getState().isRunning, true);

    timer.pause();
    assert.equal(timer.getState().isRunning, false);
    assert.equal(timer.getState().remainingSeconds, 120);

    timer.setDuration(100);
    timer.start();
    timer.reset();
    assert.equal(timer.getState().isRunning, false);
    assert.equal(timer.getState().remainingSeconds, 100);
  });

  test('onTick and onStateChange callbacks are called during lifecycle', () => {
    let tickCount = 0;
    let stateChangeCount = 0;
    const timer = new TimerEngine({
      onTick: () => { tickCount++; },
      onStateChange: () => { stateChangeCount++; }
    });

    timer.setDuration(10);
    assert.ok(tickCount > 0);
    assert.ok(stateChangeCount > 0);
  });

  test('timer counts down, triggers warning once and exactly one notification on finish with consistent state', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });

    let warningCallCount = 0;
    let finishedCalled = false;
    const ticks = [];

    const timer = new TimerEngine({
      onWarning: () => { warningCallCount++; },
      onFinish: () => { finishedCalled = true; },
      onTick: (state) => { ticks.push({ ...state }); }
    });

    // Start with 62 seconds
    timer.setDuration(62);
    assert.equal(timer.getState().isWarning, false);

    ticks.length = 0;
    timer.start();
    assert.equal(ticks.length, 1); // start notification

    // Advance 3 seconds (30 intervals of 100ms)
    t.mock.timers.tick(3000);

    // Should be at 59 seconds, warning triggered once
    assert.equal(timer.getState().remainingSeconds, 59);
    assert.equal(timer.getState().isWarning, true);
    assert.equal(warningCallCount, 1);

    // Advance another 20 seconds
    t.mock.timers.tick(20000);
    assert.equal(warningCallCount, 1);
    assert.equal(timer.getState().remainingSeconds, 39);

    // Record count before the final countdown to 0
    ticks.length = 0;

    // Advance 39.5 seconds to cross 0
    t.mock.timers.tick(39500);

    const finalState = timer.getState();
    assert.equal(finalState.remainingSeconds, 0);
    assert.equal(finalState.isRunning, false);
    assert.equal(finalState.isFinished, true);
    assert.equal(finishedCalled, true);

    // Verify the very last emitted notification has isRunning === false and remainingSeconds === 0
    const lastTick = ticks[ticks.length - 1];
    assert.equal(lastTick.remainingSeconds, 0);
    assert.equal(lastTick.isRunning, false);
    assert.equal(lastTick.isFinished, true);

    // Verify there was no intermediate tick where remainingSeconds === 0 while isRunning === true
    const illegalTick = ticks.find(tk => tk.remainingSeconds === 0 && tk.isRunning === true);
    assert.equal(illegalTick, undefined);
  });

  test('calling start when already running or with 0 seconds is ignored', () => {
    const timer = new TimerEngine();
    timer.setDuration(0);
    timer.start();
    assert.equal(timer.getState().isRunning, false);

    timer.setDuration(100);
    timer.start();
    assert.equal(timer.getState().isRunning, true);
    // second call to start should be no-op
    timer.start();
    assert.equal(timer.getState().isRunning, true);
    timer.pause();
  });

  test('setDuration and addSeconds sanitize invalid and negative inputs', () => {
    const timer = new TimerEngine();
    timer.setDuration(-50);
    assert.equal(timer.getState().remainingSeconds, 0);
    assert.equal(timer.getState().totalDuration, 0);

    timer.setDuration('invalid');
    assert.equal(timer.getState().remainingSeconds, 0);

    timer.setDuration(100);
    timer.addSeconds(-20);
    assert.equal(timer.getState().remainingSeconds, 100);

    timer.addSeconds('abc');
    assert.equal(timer.getState().remainingSeconds, 100);
  });

  test('adding seconds when in warning resets warningFired so it can fire again', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });

    let warningCount = 0;
    const timer = new TimerEngine({
      onWarning: () => { warningCount++; }
    });

    timer.setDuration(65);
    timer.start();

    // Advance 10s -> 55s (enters warning)
    t.mock.timers.tick(10000);
    assert.equal(timer.getState().remainingSeconds, 55);
    assert.equal(warningCount, 1);

    // Add 20 seconds -> 75s
    timer.addSeconds(20);
    assert.equal(timer.getState().remainingSeconds, 75);
    assert.equal(timer.getState().isWarning, false);

    // Advance 20s -> 55s (enters warning again)
    t.mock.timers.tick(20000);
    assert.equal(timer.getState().remainingSeconds, 55);
    assert.equal(warningCount, 2);

    timer.pause();
  });
});
