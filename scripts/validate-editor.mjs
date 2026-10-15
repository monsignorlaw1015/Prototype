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

  const collectPlan = () => {
    document.querySelector('.proto-editor-launcher').click();
    const plan = [];
    const markers = new Map();
    const add = (section, type, el) => {
      if (!el) return;
      const key = el.dataset.protoEdit;
      if (!markers.has(key)) markers.set(key, 'proto-editor-regression-' + markers.size);
      const marker = markers.get(key);
      el.textContent = marker;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      plan.push({ section: section.id, type, key, marker });
    };
    const firstText = (section, selector) =>
      [...section.querySelectorAll(selector)].find(el => !el.dataset.protoEditAttr);
    for (const section of [...document.querySelectorAll('[id^="section-"]')].filter(el => el.querySelector('.prototype-viewport, .macos-window, .mobile-frame'))) {
      const root = section.querySelector('.prototype-viewport, .macos-window, .mobile-frame');
      const overlays = {};
      for (const el of root.querySelectorAll('*')) {
        const classes = [...el.classList].join(' ');
        const type = /(^|[-_ ])drawer($|[-_ ])/i.test(classes) ? 'drawer'
          : /(^|[-_ ])sheet($|[-_ ])/i.test(classes) ? 'sheet'
            : /(^|[-_ ])(modal|dialog)($|[-_ ])/i.test(classes) || el.getAttribute('role') === 'dialog' ? 'modal' : null;
        if (type && !overlays[type] && el.querySelector('[data-proto-edit]:not([data-proto-edit-attr])')) overlays[type] = el;
      }
      const normal = [...root.querySelectorAll('[data-proto-edit]:not([data-proto-edit-attr])')].find(el =>
        !Object.values(overlays).some(overlay => overlay.contains(el))
      );
      add(section, 'normal', normal);
      add(section, 'prd', firstText(section, '.prd-panel [data-proto-edit]'));
      for (const [type, overlay] of Object.entries(overlays)) {
        add(section, type, firstText(overlay, '[data-proto-edit]'));
      }
    }
    return plan;
  };
  const editPlan = await evaluate('(' + collectPlan.toString() + ')()');
  for (const section of audit.sections) {
    for (const type of ['normal', 'prd']) {
      if (!editPlan.some(item => item.section === section.id && item.type === type)) {
        failures.push(section.id + ' 缺少可测试的' + (type === 'normal' ? '普通页面' : '功能说明') + '文案');
      }
    }
  }
  if (failures.length) throw new Error(failures.join('；'));

  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!!document.querySelector('.proto-editor-launcher')")) break;
    await wait(125);
  }
  const checkPersisted = plan => plan.map(item => ({
    section: item.section,
    type: item.type,
    passed: document.querySelector('#' + CSS.escape(item.section) + ' [data-proto-edit="' + CSS.escape(item.key) + '"]')?.textContent === item.marker
  }));
  const persisted = await evaluate('(' + checkPersisted.toString() + ')(' + JSON.stringify(editPlan) + ')');
  persisted.filter(item => !item.passed).forEach(item => failures.push(item.section + ' ' + item.type + ' 文案刷新后未恢复'));
  if (failures.length) throw new Error(failures.join('；'));

  const checkExport = async plan => {
    const createObjectURL = URL.createObjectURL;
    let captured;
    URL.createObjectURL = blob => { captured = blob; return createObjectURL.call(URL, blob); };
    try {
      document.querySelector('.proto-editor-launcher').click();
      document.querySelector('.proto-editor-toolbar [data-action="export"]').click();
      if (!captured) return { error: '未生成导出文件' };
      const doc = new DOMParser().parseFromString(await captured.text(), 'text/html');
      return {
        missing: plan.filter(item => doc.querySelector('#' + CSS.escape(item.section) + ' [data-proto-edit="' + CSS.escape(item.key) + '"]')?.textContent !== item.marker).map(item => item.section + '/' + item.type),
        tools: doc.querySelectorAll('[data-proto-editor-ui], [data-proto-editor-runtime], .proto-editor-launcher, .proto-editor-toolbar').length,
        editAttributes: doc.querySelectorAll('[contenteditable], [spellcheck]').length,
        active: doc.body.classList.contains('proto-editor-active')
      };
    } finally {
      URL.createObjectURL = createObjectURL;
    }
  };
  const exported = await evaluate('(' + checkExport.toString() + ')(' + JSON.stringify(editPlan) + ')');
  if (exported.error) failures.push(exported.error);
  if (exported.missing?.length) failures.push('导出文案丢失：' + exported.missing.join(', '));
  if (exported.tools) failures.push('导出文件残留编辑工具或运行时');
  if (exported.editAttributes || exported.active) failures.push('导出文件残留编辑态属性');
  if (failures.length) throw new Error(failures.join('；'));

  const totalBindings = audit.sections.reduce((sum, section) => sum + section.productBindings + section.prdBindings, 0);
  console.log(`✓ 文案编辑验收通过：${audit.sections.length} 个页面，${totalBindings} 个绑定`);
  audit.sections.forEach(section => console.log(`  ${section.id} [${section.device}]: 产品 ${section.productBindings}，功能说明 ${section.prdBindings}`));
  const overlaysTested = editPlan.filter(item => !['normal', 'prd'].includes(item.type));
  console.log(`  交互回归：逐页普通页与功能说明、${overlaysTested.length} 个叠加态，共 ${editPlan.length} 处；导出评审版通过`);
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
