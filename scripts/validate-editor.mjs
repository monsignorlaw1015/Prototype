#!/usr/bin/env node
import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('用法: validate-editor.mjs <原型.html>');
  process.exit(2);
}
if (typeof WebSocket === 'undefined') {
  console.error('需要 Node.js 22+（内置 WebSocket）');
  process.exit(2);
}

const candidates = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  : process.platform === 'win32'
    ? [join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

const chromePath = candidates.find(path => {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
});
if (!chromePath) {
  console.error('未找到 Google Chrome / Chromium，无法执行真实浏览器验收');
  process.exit(2);
}

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(error => error ? reject(error) : resolvePort(port));
  });
});
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

const port = await freePort();
const profileDir = mkdtempSync(join(tmpdir(), 'proto-editor-qa-'));
const chromeArgs = ['--headless=new', '--disable-gpu', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank'];
if (process.platform === 'linux') chromeArgs.splice(2, 0, '--no-sandbox', '--disable-dev-shm-usage');
const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
let ws;

try {
  let page;
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      page = targets.find(target => target.type === 'page');
      if (page) break;
    } catch {}
    await wait(125);
  }
  if (!page) throw new Error('Chrome 启动超时');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolveSend, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolveSend, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(resolve(htmlPath)).href });
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('.proto-editor-launcher')`)) break;
    await wait(125);
  }
  const audit = await evaluate(`(() => ({
    launcher: !!document.querySelector('.proto-editor-launcher'),
    sections: [...document.querySelectorAll('[id^="section-"]')].filter(section => section.querySelector('.prototype-viewport, .macos-window, .mobile-frame')).map(section => ({
      id: section.id,
      device: section.querySelector('.prototype-viewport, .mobile-frame')?.dataset.device || (section.querySelector('.mobile-frame') ? 'mobile' : 'desktop'),
      productBindings: section.querySelectorAll('.prototype-viewport [data-proto-edit], .macos-window [data-proto-edit], .mobile-frame [data-proto-edit]').length,
      prdBindings: section.querySelectorAll('.prd-panel [data-proto-edit]').length
    })),
    excluded: { toc: document.querySelectorAll('.toc-sidebar [data-proto-edit-auto]').length, flow: document.querySelectorAll('.flow-overview [data-proto-edit-auto]').length },
    mobileFrames: [...document.querySelectorAll('.mobile-frame')].map(frame => ({
      width: Math.round(frame.getBoundingClientRect().width),
      height: Math.round(frame.getBoundingClientRect().height),
      overflowX: (frame.querySelector('.mobile-screen') || frame).scrollWidth > (frame.querySelector('.mobile-screen') || frame).clientWidth + 1
    }))
  }))()`);
  const failures = [];
  if (!audit.launcher) failures.push('缺少【编辑文案】入口');
  audit.sections.filter(section => section.productBindings === 0).forEach(section => failures.push(`${section.id} 产品界面无可编辑文案`));
  audit.sections.filter(section => section.prdBindings === 0).forEach(section => failures.push(`${section.id} 功能说明无可编辑文案`));
  Object.entries(audit.excluded).filter(([, count]) => count > 0).forEach(([area, count]) => failures.push(`${area} 只读区误绑定 ${count} 处`));
  audit.mobileFrames.filter(frame => frame.width !== 390 || frame.height !== 844).forEach(frame => failures.push(`Mobile 视口尺寸错误 ${frame.width}×${frame.height}，应为 390×844`));
  audit.mobileFrames.filter(frame => frame.overflowX).forEach(() => failures.push('Mobile 视口存在横向溢出'));
  if (audit.sections.length === 0) failures.push('未发现包含产品视口的 section');
  if (failures.length) throw new Error(failures.join('；'));

  const editTargets = await evaluate(`(() => {
    document.querySelector('.proto-editor-launcher').click();
    const selectors = {
      normal: '.prototype-viewport [data-proto-edit]:not(.form-dialog [data-proto-edit]):not(.env-drawer [data-proto-edit]):not(.mobile-sheet [data-proto-edit]):not([role="dialog"] [data-proto-edit]), .macos-window [data-proto-edit]:not(.form-dialog [data-proto-edit]):not(.env-drawer [data-proto-edit]):not([role="dialog"] [data-proto-edit]), .mobile-frame [data-proto-edit]:not(.mobile-sheet [data-proto-edit]):not([role="dialog"] [data-proto-edit])',
      prd: '.prd-panel [data-proto-edit]',
      modal: '.form-dialog [data-proto-edit], [role="dialog"]:not(.mobile-sheet) [data-proto-edit]',
      drawer: '.env-drawer [data-proto-edit], .drawer-panel [data-proto-edit]',
      sheet: '.mobile-sheet [data-proto-edit]'
    };
    return Object.fromEntries(Object.entries(selectors).map(([type, selector]) => {
      const el = document.querySelector(selector);
      if (!el) return [type, null];
      const marker = 'proto-editor-regression-' + type;
      el.textContent = marker;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      return [type, { key: el.dataset.protoEdit, marker }];
    }));
  })()`);
  if (!editTargets.normal) throw new Error('未找到普通页面可编辑文案');
  if (!editTargets.prd) throw new Error('未找到功能说明可编辑文案');

  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('.proto-editor-launcher')`)) break;
    await wait(125);
  }
  const persisted = await evaluate(`(() => {
    const targets = ${JSON.stringify(editTargets)};
    return Object.fromEntries(Object.entries(targets).map(([type, target]) => [type, !target || document.querySelector('[data-proto-edit="' + CSS.escape(target.key) + '"]')?.textContent === target.marker]));
  })()`);
  Object.entries(persisted).filter(([, passed]) => !passed).forEach(([type]) => failures.push(`${type} 文案刷新后未恢复`));
  if (failures.length) throw new Error(failures.join('；'));

  const totalBindings = audit.sections.reduce((sum, section) => sum + section.productBindings + section.prdBindings, 0);
  console.log(`✓ 文案编辑验收通过：${audit.sections.length} 个页面，${totalBindings} 个绑定`);
  audit.sections.forEach(section => console.log(`  ${section.id} [${section.device}]: 产品 ${section.productBindings}，功能说明 ${section.prdBindings}`));
  console.log(`  交互回归：${Object.entries(editTargets).filter(([, target]) => target).map(([type]) => type).join(', ')}`);
} catch (error) {
  console.error(`✗ 文案编辑验收失败：${error.message}`);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await Promise.race([new Promise(resolveExit => chrome.once('exit', resolveExit)), wait(1500)]);
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await Promise.race([new Promise(resolveExit => chrome.once('exit', resolveExit)), wait(1000)]);
  }
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`! 临时浏览器目录稍后由系统清理：${error.code || error.message}`);
  }
}
