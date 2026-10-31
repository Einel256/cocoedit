(() => {
  'use strict';

  const LOG_PREFIX = '[CCFOLIA ステータス変更]';
  const BUTTON_CLICK_INTERVAL_MS = 5;
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
  const waitFor = async (predicate, timeout = 400) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = predicate();
      if (result) return result;
      await wait(12);
    }
    return predicate();
  };

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
      // 盤面の全DOMを毎キャラクター再走査せず、開始時の一覧を使います。
      const target = hpRows[index];
      if (!target.row.isConnected || !visible(target.row)) {
        throw new Error('キャラクター情報の取得中に表示が変わりました。もう一度取得してください。');
      }
      target.row.click();
      await wait(40);
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
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const { index, target } = targets[targetIndex];
      // 対象行の一覧は操作開始時に取得済みです。各キャラクターごとの
      // 全DOM走査を避け、画面変化があった場合は安全に停止します。
      if (!target.row.isConnected || !visible(target.row)) {
        throw new Error(`${index + 1}件目の${metric.label}表示行が見つかりません。`);
      }
      target.row.click();
      await wait(40);
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
            : Math.min(Math.ceil(Math.abs(difference)), Math.floor(Math.max(0, currentValue)));
        } else if (operation === 'increase') {
          const { currentValue, maxValue } = readCurrentStatus(target, metric);
          clicks = Math.floor(Math.min(amount, Math.max(0, maxValue - currentValue)));
          if (clicks < amount) limitedCount += 1;
        } else if (operation === 'decrease') {
          const { currentValue } = readCurrentStatus(target, metric);
          clicks = Math.floor(Math.min(amount, Math.max(0, currentValue)));
          if (clicks < amount) limitedCount += 1;
        }

        const selector = direction === 'increase' ? metric.increase : metric.decrease;
        for (let count = 0; count < clicks; count += 1) {
          const button = findButton(target, selector);
          if (!button) throw new Error(`${index + 1}件目の${metric.label}${direction === 'increase' ? '増加' : '減少'}ボタンが見つかりません。`);
          button.click();
          await wait(BUTTON_CLICK_INTERVAL_MS);
        }
        const rowText = target.row.textContent?.replace(/\s+/g, ' ').trim() || `${metric.label}行${index + 1}`;
        log(`${targetIndex + 1}/${targets.length}件目 (${rowText}) を処理しました。`);
      } finally {
        // エラー時も含め、開いた編集画面を閉じて反映を待ちます。
        await clickOutsideEditor(target.row);
      }
    }

    log(`全キャラクターの${metric.label}変更が完了しました。`);
    return { ok: true, count: targets.length, metric: metric.label, limitedCount };
  };

  const parseChatCommands = (text) => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const commands = [];
    for (const line of lines) {
      const match = line.match(/^(\d+(?:(?:\s*,\s*|\s+)\d+)*)\s*(hp|mp|san|h|m|s)(\s*)(=|[+-])?(\s*)(\d+)$/i);
      if (!match) return null;
      const amount = Number(match[6]);
      if (!Number.isSafeInteger(amount) || amount > 999999) return null;
      const numberText = match[1].trim();
      let numbers;
      if (/^[1-9]{2,}$/.test(numberText)) {
        numbers = [...numberText];
      } else {
        numbers = numberText.split(/[\s,]+/);
      }
      if (numbers.some((number) => !/^[1-9]$/.test(number))) return null;
      const operator = match[4];
      if (operator !== '=' && amount === 0) return null;
      const operation = operator === '='
        ? 'set'
        : operator === '-'
          ? 'decrease'
          : operator === '+'
            ? 'increase'
            : match[3] ? 'decrease' : 'increase';
      commands.push({
        numbers: [...new Set(numbers)],
        metricKey: ({ hp: 'hp', h: 'hp', mp: 'mp', m: 'mp', san: 'san', s: 'san' })[match[2].toLowerCase()],
        operation,
        amount
      });
    }
    return commands;
  };

  const findChatTextarea = (target) => {
    if (!(target instanceof HTMLTextAreaElement)
      || target.name !== 'text'
      || target.placeholder !== 'メッセージを入力'
      || target.readOnly
      || !target.isConnected) return null;
    return target;
  };

  const clearReactTextarea = (textarea) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, '');
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent', data: null }));
  };

  let handlingChatCommand = false;
  const executeChatCommand = async (textarea, commands) => {
    if (handlingChatCommand) return;
    handlingChatCommand = true;
    try {
      const stored = await chrome.runtime.sendMessage({ type: 'CCFOLIA_GET_COMMAND_MAP' });
      const commandMap = stored?.commandMap ?? {};
      const prepared = commands.map((command) => ({
        ...command,
        characterIds: command.numbers.map((number) => commandMap[number])
      }));
      const missing = prepared.flatMap((command, index) => command.characterIds.some((id) => !id)
        ? commands[index].numbers.filter((number) => !commandMap[number]) : []);
      if (!stored?.ok || missing.length) {
        error(!stored?.ok ? '番号割り当てを取得できません。拡張機能を開いてキャラクター情報を取得してください。' : `番号${[...new Set(missing)].join('、')}のキャラクターを割り当ててください。`);
        handlingChatCommand = false;
        return;
      }

      clearReactTextarea(textarea);
      for (const command of prepared) {
        const result = await applyToEveryone(command);
        if (!result?.ok) throw new Error('コマンドの実行に失敗しました。');
      }
      log(`${prepared.length}件のチャットコマンドを実行しました。`);
    } catch (reason) {
      error('チャットコマンドを実行できませんでした。', reason);
    } finally {
      handlingChatCommand = false;
    }
  };

  const interceptChatCommand = (event, textarea) => {
    if (handlingChatCommand) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const commands = parseChatCommands(textarea.value);
    if (!commands) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void executeChatCommand(textarea, commands);
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    const textarea = findChatTextarea(event.target);
    if (textarea) interceptChatCommand(event, textarea);
  }, true);

  document.addEventListener('submit', (event) => {
    const textarea = findChatTextarea(document.activeElement);
    if (textarea) interceptChatCommand(event, textarea);
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button');
    if (!button || !/送信|send/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.title ?? ''} ${button.textContent ?? ''}`)) return;
    const textarea = findChatTextarea(document.querySelector('textarea[name="text"][placeholder="メッセージを入力"]'));
    if (textarea) interceptChatCommand(event, textarea);
  }, true);

  const normalizedText = (element) => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const findVisibleChatTextarea = () => [...document.querySelectorAll('textarea[name="text"][placeholder="メッセージを入力"]')]
    .find((textarea) => findChatTextarea(textarea));
  const chatDrawerCloseButton = () => [...document.querySelectorAll('button[aria-label="チャットウィンドウをとじる"]')].find(visible);
  const chatDrawerOpenButton = () => [...document.querySelectorAll('button[aria-label="チャットウィンドウを開く"]')].find(visible);
  const chatComposerMounted = () => {
    const textarea = [...document.querySelectorAll('textarea[name="text"][placeholder="メッセージを入力"]')]
      .find((element) => !element.readOnly && element.isConnected);
    return Boolean(textarea?.closest('form')?.querySelector('button[type="submit"]'));
  };
  const chatDrawerIsOpen = () => {
    const toggle = chatDrawerOpenButton();
    if (toggle?.hasAttribute('aria-expanded')) return toggle.getAttribute('aria-expanded') === 'true';
    return Boolean(chatDrawerCloseButton());
  };
  const withChatDrawer = async (callback, { forceOpen = false, closeAfter = false } = {}) => {
    // The docked CCFOLIA chat form stays mounted when collapsed. Use it directly
    // to avoid opening and closing the drawer for every message.
    const shouldOpen = forceOpen ? !chatDrawerIsOpen() : !chatComposerMounted();
    const wasClosed = !chatDrawerIsOpen();
    if (shouldOpen && wasClosed) {
      const openButton = chatDrawerOpenButton();
      if (!openButton) throw new Error('CCFOLIAのチャットウィンドウを開けません。');
      openButton.click();
      await wait(180);
    }
    try {
      return await callback();
    } finally {
      if ((shouldOpen && wasClosed) || closeAfter) {
        const closeButton = chatDrawerCloseButton();
        if (closeButton) {
          closeButton.click();
          await wait(120);
        }
      }
    }
  };

  const getCharacterPickerOptions = async () => {
    const selector = document.querySelector('button[aria-label="キャラクター選択"]');
    if (!selector || !selector.isConnected) return { selector, options: [], opened: false };
    const listSelector = 'ul.MuiList-root:has(.MuiListItemButton-root[role="button"])';
    let characterLists = [...document.querySelectorAll(listSelector)].filter(visible);
    const alreadyOpen = characterLists.length > 0;
    const interactiveSelector = '[role="option"], [role="menuitem"], button, [role="button"], li, [tabindex="0"]';
    const visibleBefore = new Set([...document.querySelectorAll('*')].filter(visible));
    const opened = !alreadyOpen;
    if (opened) {
      const avatar = selector.querySelector('img.MuiAvatar-img');
      if (avatar) avatar.click();
      else selector.click();
      characterLists = await waitFor(() => {
        const lists = [...document.querySelectorAll(listSelector)].filter(visible);
        return lists.length ? lists : null;
      }, 400) ?? [];
    }
    const characterList = characterLists.at(-1);
    if (characterList) {
      const options = [...characterList.querySelectorAll('.MuiListItemButton-root[role="button"]')]
        .map((element, index) => {
          const image = element.querySelector('.MuiListItemAvatar img.MuiAvatar-img');
          const name = element.querySelector('.MuiListItemText-primary')?.textContent?.trim()
            || element.getAttribute('aria-label')
            || normalizedText(element);
          const state = element.querySelector('.MuiListItemText-secondary')?.textContent?.trim() || '';
          return { name, key: image?.currentSrc || image?.src || '', state, element, index };
        })
        .filter((option) => option.name);
      return { selector, options, opened };
    }

    let roots = [...document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"], .MuiPopover-root, .MuiMenu-root')]
      .filter(visible);
    const root = roots.at(-1);
    const explicitOptions = [...document.querySelectorAll('[role="option"], [role="menuitem"]')].filter(visible);
    const pointerTargets = (scope) => [...scope.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return style.cursor === 'pointer' && (element.querySelector('img') || normalizedText(element).length > 0);
    });
    const pool = root
      ? [...new Set([...root.querySelectorAll(interactiveSelector), ...pointerTargets(root)])]
      : explicitOptions.length
        ? explicitOptions
        : [...new Set([
          ...[...document.querySelectorAll(interactiveSelector)].filter((element) => !visibleBefore.has(element)),
          ...pointerTargets(document).filter((element) => !visibleBefore.has(element))
        ])];
    const options = pool
      .filter((element) => element !== selector && visible(element))
      .map((element, index) => {
        const image = element.querySelector('img');
        const ownImage = element.matches('img') ? element : null;
        const name = element.getAttribute('aria-label') || element.getAttribute('title')
          || image?.alt || ownImage?.alt || normalizedText(element);
        return { name, key: image?.currentSrc || image?.src || ownImage?.currentSrc || ownImage?.src || '', element, index };
      })
      .filter((option) => option.name || option.key)
      .filter((option) => option.name.length < 100)
      .filter((option, index, all) => all.findIndex((candidate) =>
        candidate.name === option.name && candidate.key === option.key) === index);
    return { selector, options, opened };
  };

  const closeCharacterPicker = async (selector, opened = true) => {
    if (opened && selector?.isConnected) selector.click();
    await wait(60);
  };

  let cachedChatState = null;
  const getChatState = async ({ force = true, includeCharacters = false } = {}) => {
    if (!force && !chatDrawerCloseButton() && cachedChatState) return cachedChatState;
    const state = await withChatDrawer(async () => {
    const tabs = [...document.querySelectorAll('[role="tablist"] button')]
      .filter((button) => button.isConnected)
      .map((button, index) => ({
        index,
        name: normalizedText(button),
        selected: button.getAttribute('aria-selected') === 'true' || button.classList.contains('Mui-selected')
      }))
      .filter((tab) => tab.name);
    const logList = document.querySelector('ul[aria-label="ルームチャット"][role="log"]');
    const messages = logList
      ? [...logList.querySelectorAll('[data-index]')]
        .filter((element) => element.isConnected)
        .map((element) => {
          const item = element.querySelector('.MuiListItem-root') || element;
          const header = item.querySelector('.MuiListItemText-primary');
          const date = header?.querySelector('.MuiTypography-caption');
          const speaker = header
            ? [...header.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim()
            : '';
          const secondary = item.querySelector('.MuiListItemText-secondary');
          let text = secondary?.innerText?.trim() || '';
          if (!text) {
            // Dice result rows can use a different MUI layout without the usual
            // secondary text node. Exclude the author/date header so it does not
            // get copied into the message body as if it were dice output.
            const body = item.cloneNode(true);
            body.querySelectorAll('.MuiListItemText-primary, [class*="MuiListItemAvatar"]').forEach((element) => element.remove());
            text = normalizedText(body);
          }
          const avatarImage = item.querySelector('[class*="MuiListItemAvatar"] img.MuiAvatar-img, [class*="MuiListItemAvatar"] img, img[alt="avatar"]');
          const avatar = avatarImage?.getAttribute('src')
            || avatarImage?.getAttribute('data-src')
            || avatarImage?.currentSrc
            || avatarImage?.src
            || '';
          return { speaker, date: date?.textContent?.replace(/^\s*-\s*/, '').trim() || '', text, avatar };
        })
        .filter((message) => message.text || message.speaker)
      : [];
    const speaker = document.querySelector('input[name="name"][placeholder="noname"]');
    const speakerImage = document.querySelector('button[aria-label="キャラクター選択"] img.MuiAvatar-img');
    const diceButtons = [...document.querySelectorAll('button[aria-label^="D"]')]
      .filter((button) => button.isConnected)
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => /^D(?:2|3|4|6|8|10|12|20|100)$/.test(label));
    const picker = includeCharacters ? await getCharacterPickerOptions() : null;
    if (picker) await closeCharacterPicker(picker.selector, picker.opened);
    return {
      ok: true,
      tabs,
      messages,
      speakerName: speaker?.value ?? '',
      speakerAvatar: speakerImage?.currentSrc || speakerImage?.src || '',
      draftText: findVisibleChatTextarea()?.value ?? '',
      characters: picker
        ? picker.options.map(({ name, key, state, index }) => ({ name, key, state, index }))
        : cachedChatState?.characters ?? [],
      diceButtons: [...new Set(diceButtons)]
    };
    });
    cachedChatState = state;
    return state;
  };

  const setReactInputValue = (input, value) => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const clickChatTab = (index) => {
    const tabs = [...document.querySelectorAll('[role="tablist"] button')].filter((tab) => tab.isConnected);
    const tab = tabs[Number(index)];
    if (!tab) throw new Error('指定したチャットタブが見つかりません。');
    tab.click();
  };

  const sendChatText = async ({ text, tabIndex }) => withChatDrawer(async () => {
    if (Number.isInteger(Number(tabIndex))) clickChatTab(tabIndex);
    const textarea = findVisibleChatTextarea();
    if (!textarea) throw new Error('CCFOLIAのメッセージ入力欄が見つかりません。');
    const form = textarea.closest('form');
    const sendButton = form?.querySelector('button[type="submit"]');
    if (!sendButton || !sendButton.isConnected) throw new Error('CCFOLIAの送信ボタンが見つかりません。');
    const messageText = String(text ?? '');
    setReactInputValue(textarea, messageText);
    sendButton.click();
    // Wait for CCFOLIA's React submit handler to clear the draft before the
    // control window immediately reads the updated room log.
    await waitFor(() => textarea.isConnected && textarea.value === '', 1500);
    if (!parseChatCommands(messageText)) {
      const expectedText = messageText.replace(/\s+/g, ' ').trim();
      await waitFor(() => {
        const entries = [...document.querySelectorAll('ul[aria-label="ルームチャット"][role="log"] [data-index]')];
        const latest = entries.at(-1);
        return latest && normalizedText(latest).includes(expectedText);
      }, 1800);
    } else {
      await wait(100);
    }
    return { ok: true };
  });

  const selectChatTab = async ({ index }) => withChatDrawer(async () => {
    clickChatTab(index);
    await wait(20);
    return { ok: true };
  });

  const setChatSpeaker = async ({ name }) => withChatDrawer(async () => {
    const input = document.querySelector('input[name="name"][placeholder="noname"]');
    if (!input || !input.isConnected) throw new Error('発言名の入力欄が見つかりません。');
    setReactInputValue(input, String(name ?? ''));
    return { ok: true };
  });

  const sameImage = (left, right) => {
    if (!left || !right) return false;
    try {
      return new URL(left, location.href).pathname === new URL(right, location.href).pathname;
    } catch {
      return left === right;
    }
  };

  const selectChatCharacter = async ({ name, key }) => withChatDrawer(async () => {
    const picker = await getCharacterPickerOptions();
    const wanted = String(name ?? '').replace(/\s+/g, ' ').trim();
    const option = picker.options.find((candidate) => (key && sameImage(candidate.key, key)) || candidate.name === wanted);
    if (!option) {
      await closeCharacterPicker(picker.selector, picker.opened);
      throw new Error(`「${wanted}」をキャラクター選択メニューから見つけられませんでした。`);
    }
    option.element.click();
    await waitFor(() => {
      const input = document.querySelector('input[name="name"][placeholder="noname"]');
      return input && input.value === option.name ? input : null;
    }, 250);
    const speakerInput = document.querySelector('input[name="name"][placeholder="noname"]');
    if (speakerInput && option.name) setReactInputValue(speakerInput, option.name);
    return { ok: true };
  });

  const clickDiceShortcut = ({ label, count }) => {
    const sides = String(label ?? '').match(/^D(2|3|4|6|8|10|12|20|100)$/)?.[1];
    const diceCount = Number(count);
    if (!sides || !Number.isInteger(diceCount) || diceCount < 1 || diceCount > 4) {
      throw new Error('ダイスはD2、D3、D4、D6、D8、D10、D12、D20、D100から1〜4個を指定してください。');
    }
    return sendChatText({ text: `${diceCount}${label}` });
  };

  const closeChatPaletteDialog = (root) => {
    const closeButton = [...(root?.querySelectorAll('button') ?? [])].find((button) => visible(button)
      && (button.getAttribute('aria-label') === '閉じる' || button.querySelector('svg[data-testid="CloseIcon"]')));
    if (closeButton) closeButton.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  const readChatPaletteEntries = async (root) => {
    const scrollableList = root.matches('.MuiDialogContent-root.scrollable-list')
      ? root
      : root.querySelector('.MuiDialogContent-root.scrollable-list');
    if (!scrollableList) throw new Error('チャットパレットのスクロール領域が見つかりません。');

    const itemLabelSelector = '.MuiListItemButton-root[role="button"] .MuiListItemText-primary';
    const entries = new Set();
    let itemLabelCount = 0;
    const collect = () => {
      itemLabelCount = 0;
      for (const label of scrollableList.querySelectorAll(itemLabelSelector)) {
        itemLabelCount += 1;
        const text = normalizedText(label);
        if (text) entries.add(text);
      }
      return itemLabelCount;
    };

    // 実際にスクロールする要素は .scrollable-list 自体とは限らないため、
    // 内容がもっともはみ出している（scrollHeight - clientHeight が最大の）子孫を使います。
    const scrollDelta = (element) => element.scrollHeight - element.clientHeight;
    const scrollingElement = [scrollableList, ...scrollableList.querySelectorAll('div, ul, ol')]
      .filter(visible)
      .sort((left, right) => scrollDelta(right) - scrollDelta(left))
      .find((element) => scrollDelta(element) > 1) ?? scrollableList;

    collect();
    // 項目数・高さ・位置が固定したまま最下部に張り付くまで、少しずつスクロールします。
    let stablePasses = 0;
    let previousCount = -1;
    let previousHeight = -1;
    let previousTop = -1;
    for (let pass = 0; pass < 300 && stablePasses < 3; pass += 1) {
      const count = collect();
      const height = scrollingElement.scrollHeight;
      const top = Math.round(scrollingElement.scrollTop);
      const atBottom = top + scrollingElement.clientHeight >= height - 2;
      if (count === previousCount && height === previousHeight && top === previousTop && atBottom) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }
      previousCount = count;
      previousHeight = height;
      previousTop = top;
      if (stablePasses >= 3) break;
      const step = Math.max(120, scrollingElement.clientHeight * 0.7);
      const maxTop = height - scrollingElement.clientHeight;
      scrollingElement.scrollTop = Math.min(maxTop, scrollingElement.scrollTop + step);
      scrollingElement.dispatchEvent(new Event('scroll', { bubbles: true }));
      await wait(70);
    }
    collect();
    return [...entries];
  };
  const openChatPalette = async () => withChatDrawer(async () => {
    const icon = [...document.querySelectorAll('svg[data-testid="ListAltIcon"]')].find(visible);
    const button = icon?.closest('button');
    if (!button) throw new Error('CCFOLIAのチャットパレットボタンが見つかりません。');

    button.click();
    const root = await waitFor(() => [...document.querySelectorAll('[role="dialog"], .MuiDialog-root, .MuiModal-root, [role="presentation"]')]
      .filter(visible)
      .filter((element) => normalizedText(element).includes('チャットパレット'))
      .sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length)[0], 1200);
    if (!root) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      throw new Error('CCFOLIAのチャットパレットを読み取れませんでした。');
    }

    try {
      // SANロール（1d100<={SAN}）やダメージ判定など、CCB以外の項目も含めて全項目を返します。
      const entries = await readChatPaletteEntries(root);
      return { ok: true, entries };
    } finally {
      closeChatPaletteDialog(root);
      await wait(80);
    }
  }, { forceOpen: true, closeAfter: true });

  // 自動削除モードの状態機械。
  // mode ON のとき、出現したメッセージ画面の全メッセージをスキップした後、
  // 指定秒待ってから閉じるボタンで閉じ、監視に戻ります。
  // phase: idle=監視中 / skipping=全スキップ中 / waiting=指定秒の待機 / closing=閉じ処理中
  const autoSkip = {
    mode: false,
    phase: 'idle',
    timer: null,
    root: null,
    allowCloseOnly: false,
    pollCount: 0,
    intervalMs: 1000,
    lastStatus: ''
  };
  const findMessageCloseButton = (root) => [...root.querySelectorAll('button')]
    .filter(visible)
    .find((button) => button.getAttribute('aria-label') === '閉じる'
      || button.querySelector('svg[data-testid="CloseIcon"]'));
  const findSkipDialog = () => {
    // ラベルの完全一致ではなく部分一致で探します（「スキップする」等の表記ゆれ対策）。
    const skipButtons = [...document.querySelectorAll('button[aria-label*="スキップ"]')].filter(visible);
    for (const skip of skipButtons) {
      let root = skip.parentElement;
      for (let depth = 0; root && depth < 12; depth += 1, root = root.parentElement) {
        const close = findMessageCloseButton(root);
        if (close) return { root, skip, close };
      }
    }
    return null;
  };
  // スキップボタンを持たない「閉じる」だけのメッセージ画面も処理対象にします。
  // 誤って別のダイアログ（編集画面など）を閉じないよう、閉じるボタンだけの画面は
  // `allowCloseOnly` が有効なときに限って対象にします。
  const findCloseOnlyDialog = () => {
    // role=dialog や MUI のオーバーレイの内、閉じるボタンを持つものを優先します。
    const overlays = [...document.querySelectorAll('[role="dialog"], .MuiDialog-root, .MuiModal-root, [aria-modal="true"], [class*="overlay" i], [class*="dialog" i], [class*="modal" i]')].filter(visible);
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      const close = findMessageCloseButton(overlays[index]);
      if (close) return { root: overlays[index], skip: null, close };
    }
    // メッセージ画面が上記のオーバーレイ構造を持たない場合でも、
    // 表示中の閉じるボタンがあれば直接拾います。もっとも手前面の（後出生の）ものを優先します。
    const closeButtons = [...document.querySelectorAll('button[aria-label*="閉じる"]')]
      .concat([...document.querySelectorAll('button')].filter((button) => button.querySelector('svg[data-testid="CloseIcon"]')));
    const candidates = closeButtons.filter(visible);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const button = candidates[index];
      const root = button.closest('[role="dialog"], .MuiDialog-root, .MuiModal-root, [class*="overlay" i], [class*="modal" i], [class*="dialog" i]')
        ?? button.parentElement;
      if (root) return { root, skip: null, close: button };
    }
    return null;
  };
  const findMessageDialog = () => findSkipDialog()
    ?? (autoSkip.allowCloseOnly === true ? findCloseOnlyDialog() : null);
  // .click() だけでなく pointer/mouse イベントも送るため、MUI製の閉じるボタンでも確実に反応させます。
  const pressElement = (element) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const base = {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
      button: 0,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    try {
      element.dispatchEvent(new PointerEvent('pointerdown', pointer));
      element.dispatchEvent(new MouseEvent('mousedown', base));
      element.dispatchEvent(new PointerEvent('pointerup', pointer));
      element.dispatchEvent(new MouseEvent('mouseup', base));
    } catch { /* PointerEvent がない環境では click のみで試します */ }
    element.click();
  };
  // 閉じる判定に使う、メッセージ画面の内容の指紋。
  const dialogSignature = (root) => (root?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  // メッセージ画面を閉じ、閉じていなければ最大4回までクリックまたはEscapeで再試行します。
  const closeCurrentMessage = async (preferredRoot = null) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!autoSkip.mode) return false;
      const close = (preferredRoot?.isConnected ? findMessageCloseButton(preferredRoot) : null)
        ?? findMessageDialog()?.close;
      if (close) {
        log(`閉じるボタンを押します（${attempt + 1}/4）。`, close);
        pressElement(close);
      } else {
        log(`閉じるボタンが見つからないためEscapeを送ります（${attempt + 1}/4）。`);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      }
      await wait(180);
      const remaining = preferredRoot?.isConnected
        ? findMessageCloseButton(preferredRoot)
        : null;
      if (!remaining && !findSkipDialog()) return true;
    }
    return false;
  };

  const setAutoSkipStatus = (status) => {
    autoSkip.lastStatus = status;
    log(status);
  };

  const clearAutoSkipTimer = () => {
    if (autoSkip.timer !== null) {
      clearTimeout(autoSkip.timer);
      autoSkip.timer = null;
    }
  };

  const scheduleAutoSkip = (delay = 250) => {
    clearAutoSkipTimer();
    autoSkip.timer = setTimeout(() => void autoSkipTick(), delay);
  };

  // 全メッセージを連続でスキップします。内容が変わる限りすぐに次を押し、
  // 変わらなければ（＝読むべきメッセージが無い）、そこで読み切りとします。
  const runSkipPhase = async () => {
    const deadline = Date.now() + 15000;
    while (autoSkip.mode && autoSkip.phase === 'skipping' && Date.now() < deadline) {
      const target = findSkipDialog();
      const skip = target?.skip;
      if (!skip || skip.disabled || skip.getAttribute('aria-disabled') === 'true') break;
      const before = dialogSignature(target.root);
      autoSkip.root = target.root;
      log('スキップボタンを押します。', skip);
      pressElement(skip);
      const verdict = await waitFor(() => {
        const current = findSkipDialog();
        if (current?.skip && !current.skip.disabled && current.skip.getAttribute('aria-disabled') !== 'true') {
          return dialogSignature(current.root) !== before ? { next: current } : null;
        }
        return current ? null : { done: true };
      }, 1500);
      if (!autoSkip.mode || autoSkip.phase !== 'skipping') return false;
      if (verdict?.next) continue;
      break;
    }
    return true;
  };

  const autoSkipTick = () => {
    autoSkip.timer = null;
    if (!autoSkip.mode) return;

    // 全スキップ中: 連続でスキップを押し、読み切ったら待機へ
    if (autoSkip.phase === 'skipping') {
      void (async () => {
        await runSkipPhase();
        if (!autoSkip.mode) return;
        const lastDialog = findSkipDialog();
        autoSkip.readSignature = dialogSignature(lastDialog?.root?.isConnected ? lastDialog.root : autoSkip.root);
        autoSkip.phase = 'waiting';
        setAutoSkipStatus(`メッセージを読み切りました。${Math.round(autoSkip.intervalMs / 1000)}秒後に閉じます。`);
        scheduleAutoSkip(autoSkip.intervalMs);
      })();
      return;
    }

    // 指定秒の待機: 待機中に有効なスキップ（＝新しいメッセージ）が来たら先に
    // 全スキップへ戻り、そのままなら閉じるボタンで閉じて監視に戻ります。
    if (autoSkip.phase === 'waiting') {
      void (async () => {
        const current = findSkipDialog();
        // 待機を開始したときと同じ内容の画面は読み切ったメッセージです。
        // 内容が変わった（新しいメッセージが届いた）ときだけ全スキップへ戻ります。
        const enabledSkip = Boolean(current?.skip && !current.skip.disabled
          && current.skip.getAttribute('aria-disabled') !== 'true'
          && dialogSignature(current.root) !== autoSkip.readSignature);
        if (enabledSkip) {
          autoSkip.root = current.root;
          autoSkip.phase = 'skipping';
          setAutoSkipStatus('新しいメッセージを検出しました。全スキップします。');
          scheduleAutoSkip(0);
          return;
        }
        if (current?.root?.isConnected) autoSkip.root = current.root;
        if (!autoSkip.root?.isConnected) {
          const closeOnly = findMessageDialog();
          autoSkip.root = closeOnly?.root ?? null;
          if (!closeOnly) {
            autoSkip.phase = 'idle';
            setAutoSkipStatus('メッセージはありません。新しいメッセージを監視中です。');
            scheduleAutoSkip();
            return;
          }
        }
        autoSkip.phase = 'closing';
        const closed = await closeCurrentMessage(autoSkip.root);
        if (!autoSkip.mode) return;
        autoSkip.phase = 'idle';
        autoSkip.root = null;
        setAutoSkipStatus(closed
          ? 'メッセージを閉じました。新しいメッセージを監視中です。'
          : 'メッセージを閉じられなかったため監視に戻ります。');
        scheduleAutoSkip();
      })();
      return;
    }

    // 監視中: メッセージ画面（スキップボタンあり）を待ちます。
    const target = findSkipDialog();
    if (target) {
      autoSkip.root = target.root;
      autoSkip.allowCloseOnly = true;
      autoSkip.phase = 'skipping';
      setAutoSkipStatus('メッセージを検出しました。全スキップします。');
      scheduleAutoSkip(0);
      return;
    }
    autoSkip.pollCount += 1;
    if (autoSkip.pollCount % 8 === 1) {
      log('メッセージ画面を監視中。document上の候補数:',
        'スキップ=', [...document.querySelectorAll('button[aria-label*="スキップ"]')].filter(visible).length,
        '閉じる=', [...document.querySelectorAll('button[aria-label*="閉じる"]')].filter(visible).length,
        'CloseIcon=', [...document.querySelectorAll('svg[data-testid="CloseIcon"]')].length,
        'dialog=', document.querySelectorAll('[role="dialog"]').length);
    }
    scheduleAutoSkip();
  };

  const setAutoSkipMode = ({ enabled, intervalSeconds = 1 } = {}) => {
    const enable = Boolean(enabled);
    const seconds = Number(intervalSeconds);
    if (enable && (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 3600)) {
      throw new Error('待ち時間は0.1〜3600秒で指定してください。');
    }
    autoSkip.intervalMs = Math.round(seconds * 1000);
    if (!enable) {
      clearAutoSkipTimer();
      autoSkip.mode = false;
      autoSkip.phase = 'idle';
      autoSkip.root = null;
      autoSkip.allowCloseOnly = false;
      autoSkip.lastStatus = 'メッセージ自動削除OFF（通常動作）';
      log(autoSkip.lastStatus);
      return { ok: true, running: false, status: autoSkip.lastStatus };
    }
    if (autoSkip.mode) {
      // すでにONのときは待ち時間だけ更新します。
      autoSkip.phase = 'idle';
      autoSkip.root = null;
      autoSkip.allowCloseOnly = false;
      autoSkip.lastStatus = `メッセージ自動削除ON（${seconds}秒間隔）`;
      scheduleAutoSkip();
      return { ok: true, running: true, intervalSeconds: seconds, status: autoSkip.lastStatus };
    }
    autoSkip.mode = true;
    autoSkip.phase = 'idle';
    autoSkip.root = null;
    autoSkip.allowCloseOnly = false;
    autoSkip.pollCount = 0;
    autoSkip.lastStatus = `メッセージ自動削除ON（${seconds}秒間隔）`;
    log(autoSkip.lastStatus);
    scheduleAutoSkip();
    return { ok: true, running: true, intervalSeconds: seconds, status: autoSkip.lastStatus };
  };
  const getAutoSkipStatus = () => ({
    ok: true,
    running: autoSkip.mode,
    phase: autoSkip.phase,
    intervalSeconds: autoSkip.intervalMs / 1000,
    status: autoSkip.lastStatus || (autoSkip.mode ? 'メッセージ自動削除ON（監視中）' : 'メッセージ自動削除OFF（通常動作）')
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CCFOLIA_ACQUIRE_CHARACTERS_IN_ROOM') {
      acquireCharacters()
        .then((result) => sendResponse(result))
        .catch((reason) => sendResponse({ ok: false, error: reason instanceof Error ? reason.message : String(reason) }));
      return true;
    }
    if (message?.type === 'CCFOLIA_CHAT_GET_STATE_IN_ROOM') {
      getChatState({ force: message.force !== false, includeCharacters: message.includeCharacters === true })
        .then((result) => sendResponse(result))
        .catch((reason) => sendResponse({ ok: false, error: reason instanceof Error ? reason.message : String(reason) }));
      return true;
    }
    if (message?.type === 'CCFOLIA_AUTO_SKIP_STATUS_IN_ROOM') {
      sendResponse(getAutoSkipStatus());
      return undefined;
    }
    if (message?.type === 'CCFOLIA_AUTO_SKIP_MODE_IN_ROOM') {
      try {
        sendResponse(setAutoSkipMode(message));
      } catch (reason) {
        sendResponse({ ok: false, error: reason instanceof Error ? reason.message : String(reason) });
      }
      return undefined;
    }
    const actions = {
      CCFOLIA_CHAT_SEND_IN_ROOM: sendChatText,
      CCFOLIA_CHAT_SELECT_TAB_IN_ROOM: selectChatTab,
      CCFOLIA_CHAT_SET_SPEAKER_IN_ROOM: setChatSpeaker,
      CCFOLIA_CHAT_SELECT_CHARACTER_IN_ROOM: selectChatCharacter,
      CCFOLIA_CHAT_DICE_IN_ROOM: clickDiceShortcut,
      CCFOLIA_CHAT_PALETTE_IN_ROOM: openChatPalette
    };
    const action = actions[message?.type];
    if (!action) return undefined;
    Promise.resolve(action(message))
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
