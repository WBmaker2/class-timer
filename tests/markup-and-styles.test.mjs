// tests/markup-and-styles.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlContent = fs.readFileSync(path.resolve('index.html'), 'utf-8');
const cssContent = fs.readFileSync(path.resolve('style.css'), 'utf-8');

describe('Task 3: Classroom TV HTML Structure (index.html)', () => {
  test('index.html links style.css and app.js as ES module', () => {
    assert.match(htmlContent, /<link[^>]+rel=["']stylesheet["'][^>]+href=["']style\.css["']/);
    assert.match(htmlContent, /<script[^>]+type=["']module["'][^>]+src=["']app\.js["']/);
  });

  describe('Header Bar (.header-bar)', () => {
    test('contains .header-bar element', () => {
      assert.match(htmlContent, /class=["'][^"']*\bheader-bar\b[^"']*["']/);
    });

    test('contains #activity-title with default text and title attribute', () => {
      assert.match(htmlContent, /id=["']activity-title["']/);
      assert.match(htmlContent, /title=["']활동명을 클릭하여 변경할 수 있습니다["']/);
      assert.match(htmlContent, /<[^>]+id=["']activity-title["'][^>]*>\s*수업 활동 시간\s*<\/[^>]+>/);
    });

    test('contains #btn-mute with audio icon and aria-label', () => {
      assert.match(htmlContent, /id=["']btn-mute["']/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-mute["'][^>]*aria-label=[^>]*>/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-mute["'][^>]*>[\s\S]*?[🔔🔕][\s\S]*?<\/button>/);
    });

    test('contains #btn-fullscreen with fullscreen icon and aria-label', () => {
      assert.match(htmlContent, /id=["']btn-fullscreen["']/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-fullscreen["'][^>]*aria-label=[^>]*>/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-fullscreen["'][^>]*>[\s\S]*?[⛶⤓][\s\S]*?<\/button>/);
    });
  });

  describe('Main Display Area (.display-section)', () => {
    test('contains .display-section element', () => {
      assert.match(htmlContent, /class=["'][^"']*\bdisplay-section\b[^"']*["']/);
    });

    test('contains #timer-display initialized to 05:00', () => {
      assert.match(htmlContent, /<[^>]+id=["']timer-display["'][^>]*>\s*05:00\s*<\/[^>]+>/);
    });

    test('contains #progress-bar-container and #progress-bar', () => {
      assert.match(htmlContent, /id=["']progress-bar-container["']/);
      assert.match(htmlContent, /id=["']progress-bar["']/);
    });

    test('contains #finish-banner containing "🔔 활동 시간이 종료되었습니다!"', () => {
      assert.match(htmlContent, /id=["']finish-banner["']/);
      assert.ok(htmlContent.includes('🔔 활동 시간이 종료되었습니다!'));
    });
  });

  describe('Controls Bar (.controls-bar)', () => {
    test('contains .controls-bar element', () => {
      assert.match(htmlContent, /class=["'][^"']*\bcontrols-bar\b[^"']*["']/);
    });

    test('contains preset buttons #preset-5, #preset-10, #preset-15', () => {
      assert.match(htmlContent, /<button[^>]+id=["']preset-5["'][^>]*>\s*5분\s*<\/button>/);
      assert.match(htmlContent, /<button[^>]+id=["']preset-10["'][^>]*>\s*10분\s*<\/button>/);
      assert.match(htmlContent, /<button[^>]+id=["']preset-15["'][^>]*>\s*15분\s*<\/button>/);
    });

    test('contains custom input section with #input-minutes, #input-seconds, and #btn-set-custom', () => {
      assert.match(htmlContent, /<input\b[^>]*\bid=["']input-minutes["'][^>]*>/);
      assert.match(htmlContent, /<input\b[^>]*\bid=["']input-seconds["'][^>]*>/);
      assert.match(htmlContent, /<input\b[^>]*\btype=["']number["'][^>]*\bid=["']input-minutes["']|<input\b[^>]*\bid=["']input-minutes["'][^>]*\btype=["']number["']/);
      assert.match(htmlContent, /<input\b[^>]*\btype=["']number["'][^>]*\bid=["']input-seconds["']|<input\b[^>]*\bid=["']input-seconds["'][^>]*\btype=["']number["']/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-set-custom["'][^>]*>\s*설정\s*<\/button>/);
    });

    test('contains action buttons #btn-toggle-start, #btn-reset, #btn-add-minute', () => {
      assert.match(htmlContent, /<button[^>]+id=["']btn-toggle-start["'][^>]*>\s*시작\s*<\/button>/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-reset["'][^>]*>\s*초기화\s*<\/button>/);
      assert.match(htmlContent, /<button[^>]+id=["']btn-add-minute["'][^>]*>\s*\+1분\s*<\/button>/);
    });
  });
});

describe('Task 3: Classroom TV CSS Styling (style.css)', () => {
  test('timer-display defines font-variant-numeric: tabular-nums', () => {
    assert.match(cssContent, /#timer-display[\s\S]*?font-variant-numeric\s*:\s*tabular-nums/);
  });

  test('timer-display defines font-size: min(28vw, 46vh) and font-weight: 800', () => {
    assert.match(cssContent, /#timer-display[\s\S]*?font-size\s*:\s*min\(\s*28vw\s*,\s*46vh\s*\)/);
    assert.match(cssContent, /#timer-display[\s\S]*?font-weight\s*:\s*800/);
  });

  test('normal state uses dark slate background (#0b0f19 or #0f172a)', () => {
    assert.ok(
      cssContent.includes('#0b0f19') || cssContent.includes('#0f172a'),
      'CSS should use dark slate background palette'
    );
  });

  test('finish banner is initially hidden', () => {
    assert.match(cssContent, /#finish-banner[\s\S]*?display\s*:\s*none/);
  });

  test('.state-warning defines neon amber text and 1s breathing pulse animation', () => {
    assert.match(cssContent, /keyframes\s+pulse/);
    assert.match(cssContent, /\.state-warning[\s\S]*?animation[\s\S]*?pulse\s+1s/);
    assert.ok(
      cssContent.includes('#f59e0b') || cssContent.includes('#fbbf24'),
      'Warning state should include neon amber color'
    );
  });

  test('.state-finished defines flash-screen animation and reveals finish banner', () => {
    assert.match(cssContent, /keyframes\s+flash-screen/);
    assert.ok(cssContent.includes('#991b1b'), 'flash-screen should contain deep red #991b1b');
    assert.ok(cssContent.includes('#d97706'), 'flash-screen should contain amber gold #d97706');
    assert.ok(cssContent.includes('#0b0f19'), 'flash-screen should contain dark slate #0b0f19');
    assert.match(cssContent, /\.state-finished[\s\S]*?flash-screen/);
    assert.match(cssContent, /\.state-finished[\s\S]*?#finish-banner[\s\S]*?display\s*:\s*flex/);
  });

  test('.controls-hidden defines opacity 0, pointer-events none, and transition opacity 0.4s ease', () => {
    assert.match(cssContent, /\.controls-hidden[\s\S]*?opacity\s*:\s*0/);
    assert.match(cssContent, /\.controls-hidden[\s\S]*?pointer-events\s*:\s*none/);
    assert.match(cssContent, /\.controls-hidden[\s\S]*?transition\s*:\s*opacity\s+0\.4s\s+ease/);
  });

  test('btn-toggle-start has prominent highlight styling', () => {
    assert.match(cssContent, /#btn-toggle-start[\s\S]*?box-shadow/);
  });
});
