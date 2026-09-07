#!/usr/bin/env node
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const major = Number(process.versions.node.split('.')[0]);
const candidates = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  : process.platform === 'win32'
    ? [join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

const browser = candidates.find(path => {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
});

const checks = [
  { ok: major >= 22, label: `Node.js ${process.versions.node}`, fix: '安装 Node.js 22 或更高版本' },
  { ok: Boolean(browser), label: browser ? `浏览器 ${browser}` : 'Google Chrome / Chromium', fix: '安装 Google Chrome 或 Chromium' }
];

for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.label}${check.ok ? '' : `：${check.fix}`}`);
}
process.exitCode = checks.every(check => check.ok) ? 0 : 1;
