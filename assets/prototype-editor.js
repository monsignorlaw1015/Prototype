/**
 * proto-gen 通用文案编辑运行时。
 * 显式绑定优先：给需要跨页同步的元素添加 data-proto-edit="稳定键"。
 * 未显式绑定的产品界面文案与右侧功能说明会在初始化时自动绑定，避免新增页面漏标。
 * 编辑 placeholder/title/aria-label 等属性时，同时添加 data-proto-edit-attr="属性名"。
 */
(() => {
  const currentScript = document.currentScript;
  if (currentScript) currentScript.dataset.protoEditorRuntime = '';
  const editableSelector = '[data-proto-edit]';
  const storageKey = `proto-gen:draft:${location.pathname}:${document.title}`;
  const original = new Map();
  let editing = false;
  let dirty = false;

  const autoScopeSelector = '.macos-window, .prd-panel';
  const autoExcludeSelector = [
    '.proto-nav', '.toc-sidebar', '.section-label', '.flow-overview',
    '[data-proto-editor-ui]', 'script', 'style', 'svg', 'path', 'defs'
  ].join(',');

  const stablePath = el => {
    const section = el.closest('[id^="section-"]');
    const parts = [];
    let node = el;
    while (node && node !== section) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter(item => item.tagName === node.tagName)
        : [];
      parts.unshift(`${tag}:${Math.max(1, siblings.indexOf(node) + 1)}`);
      node = node.parentElement;
    }
    return `${section?.id || 'prototype'}/${parts.join('/')}`;
  };

  const bindAttribute = (el, attr) => {
    if (!el.hasAttribute(attr) || !el.getAttribute(attr)?.trim()) return;
    if (el.hasAttribute('data-proto-edit')) return;
    el.dataset.protoEdit = `auto:${stablePath(el)}@${attr}`;
    el.dataset.protoEditAttr = attr;
    el.dataset.protoEditAuto = '';
  };

  const autoBind = () => {
    document.querySelectorAll(autoScopeSelector).forEach(scope => {
      scope.querySelectorAll('input[placeholder],textarea[placeholder],[title],[aria-label]').forEach(el => {
        if (el.closest(autoExcludeSelector)) return;
        ['placeholder', 'title', 'aria-label'].some(attr => {
          if (!el.hasAttribute(attr)) return false;
          bindAttribute(el, attr);
          return true;
        });
      });

      const elements = [...scope.querySelectorAll('*')].filter(el => {
        if (el.matches(autoExcludeSelector) || el.closest(autoExcludeSelector)) return false;
        if (el.hasAttribute('data-proto-edit') || ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(el.tagName)) return false;
        return [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      });

      elements.forEach(el => {
        const textNodes = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (el.childElementCount === 0 && textNodes.length === 1) {
          el.dataset.protoEdit = `auto:${stablePath(el)}`;
          el.dataset.protoEditAuto = '';
          return;
        }
        textNodes.forEach((node, index) => {
          const span = document.createElement('span');
          span.dataset.protoEdit = `auto:${stablePath(el)}#text-${index + 1}`;
          span.dataset.protoEditAuto = '';
          span.textContent = node.textContent;
          node.replaceWith(span);
        });
      });
    });
  };

  const css = `
    .proto-editor-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483640;height:38px;padding:0 15px;border:0;border-radius:999px;color:#fff;background:#635bff;font:600 13px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgb(99 91 255/.28)}
    .proto-editor-toolbar{position:fixed;left:50%;bottom:18px;z-index:2147483641;display:none;align-items:center;gap:8px;padding:8px;border:1px solid #dfe3e8;border-radius:10px;background:rgb(255 255 255/.96);box-shadow:0 12px 36px rgb(10 37 64/.18);transform:translateX(-50%);backdrop-filter:blur(12px);font:13px/1 system-ui,sans-serif}
    body.proto-editor-active .proto-editor-toolbar{display:flex}body.proto-editor-active .proto-editor-launcher{display:none}
    .proto-editor-toolbar button{height:34px;padding:0 13px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#0a2540;font:500 13px/1 system-ui,sans-serif;cursor:pointer}.proto-editor-toolbar .primary{color:#fff;border-color:#635bff;background:#635bff}.proto-editor-toolbar .danger{color:#b42318}.proto-editor-status{padding:0 6px;color:#6b7280;white-space:nowrap}
    body.proto-editor-active ${editableSelector}{outline:1px dashed rgb(99 91 255/.48);outline-offset:3px;cursor:text}body.proto-editor-active ${editableSelector}:hover,body.proto-editor-active ${editableSelector}:focus{outline:2px solid #635bff;background:rgb(238 240 255/.72)}
    @media print{.proto-editor-launcher,.proto-editor-toolbar{display:none!important}}
  `;

  const style = document.createElement('style');
  style.dataset.protoEditorUi = '';
  style.textContent = css;

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'proto-editor-launcher';
  launcher.dataset.protoEditorUi = '';
  launcher.textContent = '编辑文案';

  const toolbar = document.createElement('div');
  toolbar.className = 'proto-editor-toolbar';
  toolbar.dataset.protoEditorUi = '';
  toolbar.innerHTML = '<span class="proto-editor-status">尚未修改</span><button type="button" data-action="done">完成编辑</button><button type="button" class="danger" data-action="reset">恢复初稿</button><button type="button" class="primary" data-action="export">导出评审版</button>';

  const getValue = el => {
    const attr = el.dataset.protoEditAttr;
    return attr ? (el.getAttribute(attr) || '') : el.textContent.trim();
  };

  const setValue = (el, value) => {
    const attr = el.dataset.protoEditAttr;
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  };

  const peers = key => [...document.querySelectorAll(editableSelector)].filter(el => el.dataset.protoEdit === key);
  const status = text => { toolbar.querySelector('.proto-editor-status').textContent = text; };

  const captureOriginal = () => {
    document.querySelectorAll(editableSelector).forEach(el => {
      if (!original.has(el.dataset.protoEdit)) original.set(el.dataset.protoEdit, getValue(el));
    });
  };

  const applyPatch = patch => {
    Object.entries(patch || {}).forEach(([key, value]) => peers(key).forEach(el => setValue(el, value)));
  };

  const loadDraft = () => {
    try {
      const patch = JSON.parse(localStorage.getItem(storageKey));
      applyPatch(patch);
      dirty = !!patch && Object.keys(patch).length > 0;
    } catch (error) { console.warn('proto-gen: 无法恢复文案草稿', error); }
  };

  const saveValue = (key, value) => {
    let patch = {};
    try { patch = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
    patch[key] = value;
    localStorage.setItem(storageKey, JSON.stringify(patch));
    dirty = true;
    status('已自动保存');
  };

  const setEditing = enabled => {
    editing = enabled;
    document.body.classList.toggle('proto-editor-active', enabled);
    document.querySelectorAll(editableSelector).forEach(el => {
      if (!el.dataset.protoEditAttr) {
        el.contentEditable = enabled ? 'plaintext-only' : 'false';
        el.spellcheck = false;
      }
    });
    status(dirty ? '修改已保存' : '尚未修改');
  };

  const reset = () => {
    if (!confirm('恢复 AI 初稿？当前文案修改将被清除。')) return;
    original.forEach((value, key) => peers(key).forEach(el => setValue(el, value)));
    localStorage.removeItem(storageKey);
    dirty = false;
    status('已恢复初稿');
  };

  const exportReview = () => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-proto-editor-ui],[data-proto-editor-runtime]').forEach(el => el.remove());
    clone.querySelectorAll(editableSelector).forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
    clone.querySelector('body')?.classList.remove('proto-editor-active');
    const html = '<!doctype html>\n' + clone.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${document.title.replace(/[\\/:*?"<>|]/g, '-') || 'prototype'}-评审版.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('评审版已导出');
  };

  launcher.addEventListener('click', () => setEditing(true));
  toolbar.addEventListener('click', event => {
    const action = event.target.dataset.action;
    if (action === 'done') setEditing(false);
    if (action === 'reset') reset();
    if (action === 'export') exportReview();
  });

  document.addEventListener('input', event => {
    const el = event.target.closest(editableSelector);
    if (!editing || !el || el.dataset.protoEditAttr) return;
    const value = getValue(el);
    peers(el.dataset.protoEdit).forEach(peer => { if (peer !== el) setValue(peer, value); });
    saveValue(el.dataset.protoEdit, value);
  });

  document.addEventListener('click', event => {
    const el = event.target.closest(`${editableSelector}[data-proto-edit-attr]`);
    if (!editing || !el) return;
    event.preventDefault();
    event.stopPropagation();
    const value = prompt(`修改 ${el.dataset.protoEditAttr} 文案`, getValue(el));
    if (value === null) return;
    peers(el.dataset.protoEdit).forEach(peer => setValue(peer, value.trim()));
    saveValue(el.dataset.protoEdit, value.trim());
  }, true);

  const init = () => {
    autoBind();
    captureOriginal();
    loadDraft();
    document.head.append(style);
    document.body.append(launcher, toolbar);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
