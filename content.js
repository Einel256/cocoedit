(() => {
  'use strict';

  const LOG_PREFIX = '[CCFOLIA ステータス変更]';
  const METRICS = {
    hp: { label: 'HP', increase: 'button[aria-label="HPを増やす"]', decrease: 'button[aria-label="HPを減らす"]' },
    mp: { label: 'MP', increase: 'button[aria-label="MPを増やす"]', decrease: 'button[aria-label="MPを減らす"]' },
    san: {
      label: 'SAN',
      increase: 'button[aria-label="SANを増やす"]',
      decrease: 'button[aria-label="SANを減らす"]'
    }
  };

  const log = (...args) => console.info(LOG_PREFIX, ...args);
  const error = (...args) => console.error(LOG_PREFIX, ...args);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && element.getClientRects().length > 0;
  };

  const findMetricRows = (metric) => {
    const rows = new Map();
    for (const label of document.querySelectorAll('body *')) {
      const text = label.textContent?.trim();
      const ariaLabel = label.getAttribute('aria-label')?.trim();
      if (!visible(label) || label.children.length !== 0 || (text !== metric.label && ariaLabel !== metric.label)) continue;
      const row = label.parentElement;
      if (row && visible(row) && !rows.has(row)) rows.set(row, { label, row });
    }
    return [...rows.values()];
  };

  const isUsefulName = (value, target) => {
    const name = value?.replace(/\s+/g, ' ').trim();
    return Boolean(name && name.length <= 80
      && name !== target.row.textContent?.replace(/\s+/g, ' ').trim()
      && !/^(HP|MP|SAN)(?:\s|$)/.test(name)
      && !/^\d+(?:\/\d+)?$/.test(name)
      && !/^(増やす|減らす|名前|キャラ名|キャラクター名|PC名|キャラクター|キャラクター編集|キャラクター情報|キャラクターシート|character|character name|character settings|ステータス|ステータス編集|編集|edit)$/i.test(name)
      && !/(HP|MP|SAN)を(増やす|減らす)/.test(name));
  };

  const getCharacterName = (target, index, root = null) => {
    // 編集画面を開いている場合は、その中の見出し・名前表示を優先します。
    if (root) {
      const preferred = root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [class*="name" i], [data-testid*="name" i], [aria-label*="character" i], input[name*="name" i], input[placeholder*="name" i], input[name*="名前"], input[placeholder*="名前"], [data-testid*="character" i], [data-testid*="キャラクター"]');
      for (const element of preferred) {
        const name = element.value || element.getAttribute('aria-label') || element.textContent;
        if (visible(element) && isUsefulName(name, target)) return name.replace(/\s+/g, ' ').trim();
      }
      const editorLines = (root.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
      const nameLabelIndex = editorLines.findIndex((line) => /^(名前|キャラ名|キャラクター名|PC名|character name)$/i.test(line));
      if (nameLabelIndex >= 0 && isUsefulName(editorLines[nameLabelIndex + 1], target)) return editorLines[nameLabelIndex + 1];
    }

    let ancestor = target.row;
    for (let depth = 0; ancestor && depth < 20; depth += 1, ancestor = ancestor.parentElement) {
      const explicitName = ancestor.getAttribute('data-character-name')
        || ancestor.getAttribute('data-name')
        || ancestor.getAttribute('title')
        || ancestor.getAttribute('aria-label');
      if (isUsefulName(explicitName, target)) return explicitName.replace(/\s+/g, ' ').trim();
      // 複数キャラクターを包む共通コンテナの見出しを誤って全員に割り当てないよう、
      // HPラベルがこの領域に1つだけある場合に限って名前候補を調べます。
      const hpLabelCount = [...ancestor.querySelectorAll('*')].filter((element) => {
        const text = element.textContent?.trim();
        return visible(element) && element.children.length === 0
          && (text === METRICS.hp.label || element.getAttribute('aria-label')?.trim() === METRICS.hp.label);
      }).length;
      if (hpLabelCount > 1) continue;

      const namedElements = ancestor.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [class*="name" i], [data-testid*="name" i], [aria-label*="character" i], input[name*="name" i], input[placeholder*="name" i], input[name*="名前"], input[placeholder*="名前"], [data-testid*="キャラクター"]');
      for (const element of namedElements) {
        const name = element.value || element.getAttribute('aria-label') || element.textContent;
        if (visible(element) && isUsefulName(name, target)) return name.replace(/\s+/g, ' ').trim();
      }
      const lines = (ancestor.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
      const candidate = lines.find((line) => isUsefulName(line, target));
      if (candidate) return candidate;
    }
    return `キャラクター${index + 1}`;
  };

  const acquireCharacters = async () => {
    const hpRows = findMetricRows(METRICS.hp);
    if (hpRows.length === 0) throw new Error('キャラクターのHP表示行が見つかりませんでした。');
    const rawCharacters = [];
    for (let index = 0; index < hpRows.length; index += 1) {
      const target = findMetricRows(METRICS.hp)[index];
      if (!target) throw new Error('キャラクター情報の取得中に表示が変わりました。もう一度取得してください。');
      target.row.click();
      await wait(60);
      let name;
      try {
        const editor = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .MuiDrawer-root, .MuiPopover-root')]
          .filter(visible).at(-1);
        name = getCharacterName(target, index, editor);
      } finally {
        await clickOutsideEditor(target.row);
      }
      rawCharacters.push({ id: String(index), name });
    }
    const nameCounts = new Map();
    for (const character of rawCharacters) nameCounts.set(character.name, (nameCounts.get(character.name) ?? 0) + 1);
    const nameIndexes = new Map();
    const characters = rawCharacters.map((character, index) => {
      if (nameCounts.get(character.name) === 1) return character;
      const duplicateIndex = (nameIndexes.get(character.name) ?? 0) + 1;
      nameIndexes.set(character.name, duplicateIndex);
      return { ...character, name: `${character.name}（${duplicateIndex}・一覧${index + 1}番目）` };
    });
    return {
      ok: true,
      characters
    };
  };

  const findButton = (target, selector) => {
    const rowRect = target.row.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(selector)].filter(visible);
    buttons.sort((a, b) => {
      const distance = (button) => {
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2 - (rowRect.left + rowRect.width / 2);
        const y = rect.top + rect.height / 2 - (rowRect.top + rowRect.height / 2);
        return x * x + y * y;
      };
      return distance(a) - distance(b);
    });
    return buttons[0] ?? null;
  };

  const readCurrentStatus = (target, metric) => {
    // CCFOLIAの「現在値/最大値」表記を読み、増加を最大値で制限します。
    const text = target.row.textContent?.replace(metric.label, ' ').replace(/\s+/g, ' ').trim() ?? '';
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    if (!match) throw new Error(`${metric.label}の現在値と最大値を読み取れないため、最大値を超えないよう操作を停止しました。`);
    const currentValue = Number(match[1]);
    const maxValue = Number(match[2]);
    if (!Number.isFinite(currentValue) || !Number.isFinite(maxValue) || maxValue < 0) {
      throw new Error(`${metric.label}の現在値または最大値が不正です。`);
    }
    return { currentValue, maxValue };
  };

  const clickOutsideEditor = async (row) => {
    const backdrops = [...document.querySelectorAll('.MuiBackdrop-root, [data-testid*="backdrop" i]')]
      .filter(visible);
    if (backdrops.length > 0) {
      backdrops[backdrops.length - 1].click();
      await wait(300);
      return;
    }

    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .MuiDrawer-root')]
      .filter(visible);
    const dialogRect = dialogs.at(-1)?.getBoundingClientRect();
    const points = [
      [window.innerWidth - 24, window.innerHeight - 24],
      [window.innerWidth - 24, 24],
      [24, window.innerHeight - 24],
      [24, 24],
      [window.innerWidth / 2, window.innerHeight - 24],
      [window.innerWidth - 24, window.innerHeight / 2]
    ];
    const rowRect = row.getBoundingClientRect();
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      if (dialogRect && x >= dialogRect.left && x <= dialogRect.right && y >= dialogRect.top && y <= dialogRect.bottom) continue;
      if (x >= rowRect.left && x <= rowRect.right && y >= rowRect.top && y <= rowRect.bottom) continue;
      const outsideElement = document.elementFromPoint(x, y);
      if (!outsideElement || outsideElement.closest('button, input, textarea, select, a, [role="button"]')) continue;
      outsideElement.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
      }));
      await wait(300);
      return;
    }
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await wait(300);
  };

  const applyToEveryone = async ({ metricKey, operation, amount, characterIds }) => {
    const metric = METRICS[metricKey];
    if (!metric) throw new Error('変更対象はHP、MP、SANから選択してください。');
    if (!['increase', 'decrease', 'set'].includes(operation)) throw new Error('変更方法が不正です。');
    if (!Number.isInteger(amount) || amount < (operation === 'set' ? 0 : 1) || amount > 999999) {
      throw new Error(operation === 'set'
        ? '設定値は0以上の整数で指定してください。'
        : '変更量は1以上の整数で指定してください。');
    }

    const initialRows = findMetricRows(metric);
    if (initialRows.length === 0) throw new Error(`${metric.label}表示行が見つかりませんでした。`);
    log(`${initialRows.length}件の${metric.label}行を上から順に処理します。`);

    const selectedIds = Array.isArray(characterIds) ? new Set(characterIds.map(String)) : null;
    if (selectedIds && [...selectedIds].some((id) => !/^\d+$/.test(id) || Number(id) >= initialRows.length)) {
      throw new Error('取得したキャラクター一覧と現在のステータス表示が一致しません。キャラ情報を再取得してください。');
    }
    const targets = initialRows.map((target, index) => ({ target, index }))
      .filter(({ index }) => !selectedIds || selectedIds.has(String(index)));
    if (targets.length === 0) throw new Error('操作対象のキャラクターを選択してください。');

    let limitedCount = 0;
    for (const { index } of targets) {
      let target = findMetricRows(metric)[index];
      if (!target) throw new Error(`${index + 1}件目の${metric.label}表示行が見つかりません。`);
      target.row.click();
      await wait(60);
      try {
        let direction = operation;
        let clicks = amount;
        if (operation === 'set') {
          const { currentValue, maxValue } = readCurrentStatus(target, metric);
          const targetValue = Math.min(amount, maxValue);
          if (targetValue < amount) limitedCount += 1;
          const difference = targetValue - currentValue;
          direction = difference >= 0 ? 'increase' : 'decrease';
          clicks = direction === 'increase'
            ? Math.floor(Math.min(difference, Math.max(0, maxValue - currentValue)))
            : Math.ceil(Math.abs(difference));
        } else if (operation === 'increase') {
          const { currentValue, maxValue } = readCurrentStatus(target, metric);
          clicks = Math.floor(Math.min(amount, Math.max(0, maxValue - currentValue)));
          if (clicks < amount) limitedCount += 1;
        }

        const selector = direction === 'increase' ? metric.increase : metric.decrease;
        for (let count = 0; count < clicks; count += 1) {
          const button = findButton(target, selector);
          if (!button) throw new Error(`${index + 1}件目の${metric.label}${direction === 'increase' ? '増加' : '減少'}ボタンが見つかりません。`);
          button.click();
          await wait(60);
        }
        const rowText = target.row.textContent?.replace(/\s+/g, ' ').trim() || `${metric.label}行${index + 1}`;
        log(`${targets.findIndex((item) => item.index === index) + 1}/${targets.length}件目 (${rowText}) を処理しました。`);
      } finally {
        // エラー時も含め、開いた編集画面を閉じて反映を待ちます。
        await clickOutsideEditor(target.row);
      }
    }

    log(`全キャラクターの${metric.label}変更が完了しました。`);
    return { ok: true, count: targets.length, metric: metric.label, limitedCount };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CCFOLIA_ACQUIRE_CHARACTERS_IN_ROOM') {
      acquireCharacters()
        .then((result) => sendResponse(result))
        .catch((reason) => sendResponse({ ok: false, error: reason instanceof Error ? reason.message : String(reason) }));
      return true;
    }
    if (message?.type !== 'CCFOLIA_APPLY_STATUS_IN_ROOM') return undefined;
    applyToEveryone(message)
      .then((result) => sendResponse(result))
      .catch((reason) => {
        const messageText = reason instanceof Error ? reason.message : String(reason);
        error(messageText);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  });

  log('ルーム用Content Scriptを読み込みました。');
})();
