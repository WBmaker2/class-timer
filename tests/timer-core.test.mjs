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

    timer.setDuration(600);
    const updatedState = timer.getState();
    assert.equal(updatedState.remainingSeconds, 600);
    assert.equal(updatedState.totalDuration, 600);
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

  test('timer counts down, triggers warning once and onFinish when reaching 0', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });

    let warningCallCount = 0;
    let finishedCalled = false;

    const timer = new TimerEngine({
      onWarning: () => { warningCallCount++; },
      onFinish: () => { finishedCalled = true; }
    });

    // Start with 62 seconds
    timer.setDuration(62);
    assert.equal(timer.getState().isWarning, false);

    timer.start();

    // Advance 3 seconds (30 intervals of 100ms)
    t.mock.timers.tick(3000);

    // Should be at 59 seconds, warning triggered once
    assert.equal(timer.getState().remainingSeconds, 59);
    assert.equal(timer.getState().isWarning, true);
    assert.equal(warningCallCount, 1);

    // Advance another 20 seconds
    t.mock.timers.tick(20000);
    // Warning should NOT trigger again
    assert.equal(warningCallCount, 1);
    assert.equal(timer.getState().remainingSeconds, 39);

    // Advance remaining 39 seconds to hit 0
    t.mock.timers.tick(39000);

    const finalState = timer.getState();
    assert.equal(finalState.remainingSeconds, 0);
    assert.equal(finalState.isRunning, false);
    assert.equal(finalState.isFinished, true);
    assert.equal(finishedCalled, true);
  });

  test('addSeconds does nothing when timer is finished', () => {
    const timer = new TimerEngine();
    timer.setDuration(0);
    assert.equal(timer.isFinished(), true);

    timer.addSeconds(60);
    assert.equal(timer.getState().remainingSeconds, 0);
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

