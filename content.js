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
  // 非表示タブでは setTimeout が約1秒に間引かれ、閉じ処理などが体感的に異常に遅くなります。
  // そこで画面が非表示のときはタイマー制限を受けない MessageChannel ベースの待ちに切り替えます。
  // 表示中は通常の setTimeout の待ち（表示の安定のための実時間）を使います。
  const fastWait = (ms) => (document.hidden
    ? new Promise((resolve) => {
      const channel = new MessageChannel();
      const steps = Math.max(1, Math.round(ms / 4));
      let received = 0;
      channel.port1.onmessage = () => {
        received += 1;
        if (received >= steps) {
          channel.port1.close();
          resolve();
          return;
        }
        channel.port2.postMessage(0);
      };
      channel.port2.postMessage(0);
    })
    : wait(ms));
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
      // 番号を省略可能にする。番号なしの場合は「現在の発言者」を対象とする（例: s-3, h+10, m=50）。
      const match = line.match(/^(?:(\d+(?:(?:\s*,\s*|\s+)\d+)*)\s*)?(hp|mp|san|h|m|s)(\s*)(=|[+-])?(\s*)(\d+)$/i);
      if (!match) return null;
      const amount = Number(match[6]);
      if (!Number.isSafeInteger(amount) || amount > 999999) return null;
      const numberText = match[1] ? match[1].trim() : '';
      const targetSpeaker = !numberText;
      let numbers;
      if (!numberText) {
        numbers = [];
      } else if (/^[1-9]{2,}$/.test(numberText)) {
        numbers = [...numberText];
      } else {
        numbers = numberText.split(/[\s,]+/);
      }
      if (!targetSpeaker && numbers.some((number) => !/^[1-9]$/.test(number))) return null;
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
        targetSpeaker,
        metricKey: ({ hp: 'hp', h: 'hp', mp: 'mp', m: 'mp', san: 'san', s: 'san' })[match[2].toLowerCase()],
        operation,
        amount
      });
    }
    return commands;
  };

  // 「resb」コマンド（BCDiceのRESB（抵抗判定）出力に合わせた簡易記法）。
  // 「r<n>」→ resb、の形で、CCFOLIA側へ「resb」+ n を送ります（例: r5 → resb5、r-5 → resb-5）。
  // 「r<n> <m>」→「resb」+（n - m）を送ります（例: r5 3 → resb2）。
  // 「rg<n>」→「resb」+（n/5 端数切捨て）を送ります（例: rg5 → resb1、rg-5 → resb-1）。
  // 「rg<n> <m>」→「resb」+（n/5 端数切捨て - m/5 端数切捨て）を送ります（例: rg10 4 → resb2）。
  // 最初に「s」を付けると、出力は「sresb…」になり、CCFOLIA側でシークレットダイス扱いになります。
  // （例: sr5 3 → sresb2、srg10 4 → sresb2）
  // 区切りはスペース・カンマ・ハイフン（r5-3 / rg10-4）のどれでも使えます。
  // n と m はいずれも0以外の整数です。行単位で複数書けます（1行1コマンド）。
  // 元のコマンド文は送らず、変換後の「sresb…」/「resb…」だけを送ります。
  const normalizeFullWidthDigits = (text) => text.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const parseResCommandLines = (text) => {
    const lines = text.split(/\r?\n/).map((line) => normalizeFullWidthDigits(line).trim()).filter(Boolean);
    if (!lines.length) return null;
    const values = [];
    for (const line of lines) {
      const match = line.match(/^(s)?(rg?)([+-]?\d+)(?:(?:\s*,\s*|\s+)([+-]?\d+)|\s*-\s*([+-]?\d+))?$/i);
      if (!match) return null;
      const secret = Boolean(match[1]);
      const n = Number(match[3]);
      const mText = match[4] ?? match[5];
      const m = mText !== undefined ? Number(mText) : null;
      if (n === 0 || Math.abs(n) > 999999 || (m !== null && (m === 0 || Math.abs(m) > 999999))) return null;
      const isG = match[2].toLowerCase() === 'rg';
      const divideByFive = (value) => Math.trunc(value / 5);
      const value = m === null
        ? (isG ? divideByFive(n) : n)
        : (isG ? divideByFive(n) - divideByFive(m) : n - m);
      values.push(`${secret ? 's' : ''}resb${value}`);
    }
    return values;
  };
  const makeResCommandText = (text) => {
    const values = parseResCommandLines(text);
    return values ? values.join('\n') : null;
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
      const characters = stored?.characters ?? [];
      const prepared = commands.map((command) => {
        if (command.targetSpeaker) {
          // 番号なし＝現在の発言者。発言名欄の値からキャラクターIDを解決する。
          const speakerInput = document.querySelector('input[name="name"][placeholder="noname"]');
          const speakerName = speakerInput?.value?.replace(/\s+/g, ' ').trim();
          const character = speakerName ? characters.find((c) => c.name === speakerName) : null;
          return {
            ...command,
            characterIds: character ? [character.id] : [],
            speakerName
          };
        }
        return {
          ...command,
          characterIds: command.numbers.map((number) => commandMap[number])
        };
      });
      const missing = prepared.flatMap((command, index) => (command.characterIds.length === 0 || command.characterIds.some((id) => !id))
        ? command.targetSpeaker
          ? [`発言者「${command.speakerName || ''}」`]
          : commands[index].numbers.filter((number) => !commandMap[number]) : []);
      if (!stored?.ok || missing.length) {
        error(!stored?.ok ? '番号割り当てを取得できません。拡張機能を開いてキャラクター情報を取得してください。' : `対象が見つかりません（${[...new Set(missing)].join('、')}）。`);
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

  // 「r<n> <m>」「rg<n> <m>」をCCFOLIA本体の入力欄から送ったときも「resb…」に置き換えて送ります。
  let handlingResCommand = false;
  const executeResCommand = async (textarea, values) => {
    if (handlingResCommand) return;
    handlingResCommand = true;
    try {
      clearReactTextarea(textarea);
      await sendChatText({ text: values.join('\n') });
      log(`resbコマンドを送信しました。`);
    } catch (reason) {
      error('resbコマンドを送信できませんでした。', reason);
    } finally {
      handlingResCommand = false;
    }
  };

  const interceptChatCommand = (event, textarea) => {
    if (handlingChatCommand) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const commands = parseChatCommands(textarea.value);
    if (!commands) {
      // 自動削除などのステータスコマンドでない場合は、「res」コマンドを確認します。
      const resValues = parseResCommandLines(textarea.value);
      if (!resValues) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void executeResCommand(textarea, resValues);
      return;
    }
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
  const openChatDrawer = async () => {
    if (chatDrawerIsOpen()) return { ok: true, alreadyOpen: true };
    const openButton = chatDrawerOpenButton();
    if (!openButton) throw new Error('CCFOLIAのチャットウィンドウを開くボタンが見つかりません。');
    openButton.click();
    if (!await waitFor(() => chatDrawerIsOpen(), 1200)) {
      throw new Error('CCFOLIAのチャットウィンドウを開けませんでした。');
    }
    return { ok: true };
  };
  const closeChatDrawer = async () => {
    if (!chatDrawerIsOpen()) return { ok: true, alreadyClosed: true };
    const closeButton = chatDrawerCloseButton();
    if (!closeButton) throw new Error('CCFOLIAのチャットウィンドウを閉じるボタンが見つかりません。');
    closeButton.click();
    if (!await waitFor(() => !chatDrawerIsOpen(), 1200)) {
      throw new Error('CCFOLIAのチャットウィンドウを閉じられませんでした。');
    }
    return { ok: true };
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

  // MUIのメニュー（キャラクター選択など）を、メニュー外の場所をクリックして閉じます。
  // 開閉ボタンを再度押すと、タイミングによってメニューを開き直ってしまうことがあるため。
  const clickAwayFromMenus = async () => {
    // MUIのオーバーレイ用バックドロップがあれば、そこをクリックするのが確実です。
    const backdrops = [...document.querySelectorAll('.MuiBackdrop-root, [data-testid*="backdrop" i]')].filter(visible);
    if (backdrops.length > 0) {
      backdrops[backdrops.length - 1].click();
      await fastWait(280);
      return;
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .MuiDrawer-root')].filter(visible);
    const dialogRect = dialogs.at(-1)?.getBoundingClientRect();
    const points = [
      [window.innerWidth - 24, window.innerHeight - 24],
      [window.innerWidth - 24, 24],
      [24, window.innerHeight - 24],
      [24, 24],
      [window.innerWidth / 2, window.innerHeight - 24],
      [window.innerWidth - 24, window.innerHeight / 2]
    ];
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      if (dialogRect && x >= dialogRect.left && x <= dialogRect.right && y >= dialogRect.top && y <= dialogRect.bottom) continue;
      const element = document.elementFromPoint(x, y);
      if (!element || element.closest('button, input, textarea, select, a, [role="button"]')) continue;
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
      }));
      await fastWait(280);
      return;
    }
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await fastWait(280);
  };

  const closeCharacterPicker = async (selector, opened = true) => {
    // 開いたキャラクター選択メニューは、選択ボタンを再度押す代わりに
    // CCFOLIA内の無関係な場所をクリックして閉じます。
    if (opened) {
      await clickAwayFromMenus();
      return;
    }
    await wait(60);
  };

  let cachedChatState = null;
  // ルームチャットのログ行を読み取ります。getChatState（3秒ポーリング）と
  // ログ変化時の即時プッシュの両方から使います。
  const readRoomLogMessages = () => {
    const logList = document.querySelector('ul[aria-label="ルームチャット"][role="log"]');
    return logList
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
  };
  // タブごとの未読ドット（お知らせ）を記録し、「自分が見ていないタブ」への新着メッセージを検知します。
  // CCFOLIAのタブは新着があるとタブ名の脇に MuiBadge-dot の小さな点が表示されます。
  let lastDotByTab = new Map(); // タブindex -> 前回の未読ドット有無
  let lastUnreadByTab = new Map(); // タブindex -> 前回の数字バッジ値（ドットが使えない環境向けの補助）
  let pendingUnread = new Set(); // 未通知のままのタブindex（そのタブを開くまで保持）
  let unreadSeen = false; // 最初の1回はドットの基準を記録するだけにします（誤通知防止）

  const unreadTabsSnapshot = () => [...pendingUnread].map((index) => ({
    index,
    name: cachedChatState?.tabs?.find((candidate) => candidate.index === index)?.name ?? `チャットタブ${index + 1}`
  }));

  const attachUnreadTabs = (state) => ({ ...state, unreadTabs: unreadTabsSnapshot() });

  const notifyUnreadListeners = (items) => {
    if (!items.length) return;
    try {
      chrome.runtime.sendMessage({ type: 'CCFOLIA_CHAT_UNREAD_NOTIFY', items }).catch?.(() => {});
    } catch {
      // 制御ウィンドウが閉じていてもデスクトップ通知は background が処理するため、失敗は無視します。
    }
  };

  const clearUnreadNotifications = () => {
    try {
      chrome.runtime.sendMessage({ type: 'CCFOLIA_CHAT_UNREAD_CLEAR' }).catch?.(() => {});
    } catch {
      // 失敗は無視します。
    }
  };

  const updateUnreadTracking = (tabs) => {
    const newlyChanged = [];
    const changedByTab = new Map();
    for (const tab of tabs) {
      const previousDot = lastDotByTab.get(tab.index);
      const previousBadge = lastUnreadByTab.get(tab.index);
      lastDotByTab.set(tab.index, tab.selected ? false : tab.dot);
      lastUnreadByTab.set(tab.index, tab.badge === null ? (previousBadge ?? 0) : tab.badge);
      if (!unreadSeen) continue;
      if (tab.selected) {
        // そのタブを見ているので、通知は不要です。
        if (pendingUnread.delete(tab.index) && !pendingUnread.size) clearUnreadNotifications();
        continue;
      }
      // 未読ドットが新しく付いたら新着です。
      if (tab.dot && previousDot === false) {
        pendingUnread.add(tab.index);
        if (!changedByTab.has(tab.index)) changedByTab.set(tab.index, tab.name);
      }
      // 数字バッジの増分も参考として検知します（ドットが出ない表示環境向け）。
      if (tab.badge !== null && previousBadge !== undefined && tab.badge > previousBadge) {
        pendingUnread.add(tab.index);
        if (!changedByTab.has(tab.index)) changedByTab.set(tab.index, tab.name);
      }
      // ドットが消えた＝CCFOLIA側で既読に変わったので、通知を解除します。
      if (!tab.dot && previousDot === true && pendingUnread.delete(tab.index) && !pendingUnread.size) {
        clearUnreadNotifications();
      }
    }
    unreadSeen = true;
    notifyUnreadListeners([...changedByTab].map(([index, name]) => ({ index, name })));
  };

  const getChatState = async ({ force = true, includeCharacters = false } = {}) => {
    if (!force && !chatDrawerCloseButton() && cachedChatState) return attachUnreadTabs(cachedChatState);
    const state = await withChatDrawer(async () => {
    const tabs = [...document.querySelectorAll('[role="tablist"] button')]
      .filter((button) => button.isConnected)
      .map((button, index) => {
        // タブ名に数字だけのバッジ（未読数・順番表示など）が付いている場合は除いて読み取ります。
        // 例: 「メイン0」のように末尾に付くインデックス表示を「メイン」に戻します。
        const clone = button.cloneNode(true);
        for (const node of [...clone.childNodes]) {
          if (node.nodeType === Node.TEXT_NODE && /^\d+$/.test(node.textContent?.trim() ?? '')) node.remove();
        }
        for (const element of [...clone.querySelectorAll('*')]) {
          if (element.children.length === 0 && /^\d+$/.test(normalizedText(element))) element.remove();
        }
        const name = normalizedText(clone);
        // 除去した残りが純数字なら、その数値をタブの未読バッジとして読み取ります。
        const raw = normalizedText(button);
        const suffix = raw.startsWith(name) ? raw.slice(name.length).trim() : '';
        const badge = /^\d+$/.test(suffix) ? Number(suffix) : null;
        // 新着のお知らせドット（MuiBadge-dot）の有無を読み取ります。見えていないドットは未着ではない扱いにします。
        const badgeElement = button.querySelector('.MuiBadge-badge');
        const dot = Boolean(
          badgeElement
          && !badgeElement.classList.contains('MuiBadge-invisible')
          && visible(badgeElement)
        );
        return {
          index,
          name,
          badge,
          dot,
          selected: button.getAttribute('aria-selected') === 'true' || button.classList.contains('Mui-selected')
        };
      })
      .filter((tab) => tab.name);
    const messages = readRoomLogMessages();
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
    updateUnreadTracking(state.tabs);
    return attachUnreadTabs(state);
  };

  // 「ログが変わったらすぐ制御ウィンドウへ反映する」。ポーリングを待たず、
  // ログDOMの変化を検知して、そのたびに最新のメッセージ一覧を制御ウィンドウへ送ります。
  // 仲介の待ち時間を短くして、新着メッセージをほぼ即座に反映させます。
  let lastPushedLogSignature = '';
  let pushLogTimer = null;
  const pushRoomLogUpdate = () => {
    pushLogTimer = null;
    const messages = readRoomLogMessages();
    const signature = `${messages.length}:${JSON.stringify(messages.at(-1) ?? '')}`;
    if (signature === lastPushedLogSignature) return;
    lastPushedLogSignature = signature;
    try {
      chrome.runtime.sendMessage({ type: 'CCFOLIA_CHAT_LOG_PUSH', messages }).catch?.(() => {});
    } catch {
      // 制御ウィンドウが開いていなければ送出先がなくても問題ありません（ポーリングで反映します）。
    }
  };
  const watchRoomLog = () => {
    const observer = new MutationObserver(() => {
      clearTimeout(pushLogTimer);
      pushLogTimer = setTimeout(pushRoomLogUpdate, 100);
    });
    const attach = () => {
      const logList = document.querySelector('ul[aria-label="ルームチャット"][role="log"]');
      if (logList) {
        try { observer.disconnect(); } catch { /* 無視 */ }
        observer.observe(logList, { childList: true, subtree: true, characterData: true });
      }
    };
    attach();
    // ログ要素がチャットウィンドウの開閉で差し替えられるため、一定間隔で付け直します。
    setInterval(() => {
      const logList = document.querySelector('ul[aria-label="ルームチャット"][role="log"]');
      if (logList) attach();
    }, 2000);
    // 付け直しの瞬間の取りこぼしを防ぐため、初回は一度即pushします。
    pushRoomLogUpdate();
  };
  watchRoomLog();

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
    // 「r<n> <m>」/「rg<n> <m>」は「resb…」の形に置き換えて送ります（例: r5 3 → resb2）。
    const sendText = makeResCommandText(messageText) ?? messageText;
    setReactInputValue(textarea, sendText);
    sendButton.click();
    // Wait for CCFOLIA's React submit handler to clear the draft before the
    // control window reads the updated room log. Kept very short so repeated
    // dice/SAN sends do not create a noticeable "cannot send" window.
    await waitFor(() => textarea.isConnected && textarea.value === '', 300);
    if (!parseChatCommands(sendText)) {
      const expectedText = sendText.replace(/\s+/g, ' ').trim();
      await waitFor(() => {
        const entries = [...document.querySelectorAll('ul[aria-label="ルームチャット"][role="log"] [data-index]')];
        const latest = entries.at(-1);
        return latest && normalizedText(latest).includes(expectedText);
      }, 300);
    } else {
      await wait(60);
    }
    return { ok: true };
  });

  const selectChatTab = async ({ index }) => withChatDrawer(async () => {
    clickChatTab(index);
    // 開いたタブの未着通知を解除します（他に通知が残っていなければデスクトップ通知も消します）。
    if (pendingUnread.delete(Number(index)) && !pendingUnread.size) clearUnreadNotifications();
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
    // MUIのボタンは試素の .click() では反応しないことがあるため、pointer/mouseイベントも送る pressElement で押します。
    if (closeButton) pressElement(closeButton);
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  // パネル右上の「閉じる」ボタン（aria-label="閉じる" または CloseIcon のIconButton）を探します。
  // シーン表やチャットパレットは外側クリック・Escapeでは消えないことがあるため、
  // 閉じるボタンを直接押すのが確実です。設定上、ヘッダー部は表（root）のすぐ上に付くため、
  // root内に見つからないときは「rootの上端近くにある閉じるボタン」を選びます。
  const findPanelCloseButton = (root) => {
    for (let node = root, depth = 0; node && node !== document.body && depth < 14; depth += 1, node = node.parentElement) {
      const button = [...node.querySelectorAll('button')].filter(visible)
        .find((button) => button.getAttribute('aria-label') === '閉じる'
          || button.querySelector('svg[data-testid="CloseIcon"]'));
      if (button) return button;
    }
    // 親をたどっても見つからないときは、rootの上端に近い（ヘッダーと想定する）閉じるボタンを選びます。
    // 位置不明（rootなし）のときは、画面でもっとも手前（DOM末尾）のものを返します。
    const buttons = [...document.querySelectorAll('button[aria-label="閉じる"]')].filter(visible);
    if (!buttons.length) return null;
    if (!root || !root.isConnected) return buttons.at(-1) ?? null;
    const rect = root.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    let best = null;
    let bestDistance = Infinity;
    for (const button of buttons) {
      const buttonRect = button.getBoundingClientRect();
      const distance = Math.hypot(
        buttonRect.left - anchorX + buttonRect.width / 2,
        buttonRect.top - rect.top - buttonRect.height
      );
      // 面板の真上〜上端あたり（±200px）のものだけを候補にします。
      if (buttonRect.top > rect.bottom || buttonRect.bottom < rect.top - 160) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = button;
      }
    }
    return best ?? buttons.at(-1) ?? null;
  };
  const findPaletteDialogScrollableList = (root) => {
    // root がチャットパレットのヘッダー部分（MuiAppBar-root など）の場合、
    // 親を遡って .MuiDialogContent-root.scrollable-list を見つけます。
    let scrollableList = root.matches('.MuiDialogContent-root.scrollable-list')
      ? root
      : root.querySelector('.MuiDialogContent-root.scrollable-list');
    if (!scrollableList) {
      let ancestor = root.parentElement;
      while (ancestor && ancestor !== document.body) {
        const found = ancestor.querySelector('.MuiDialogContent-root.scrollable-list');
        if (found) {
          scrollableList = found;
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return scrollableList;
  };
  // ダイアログのスクロール領域を最下部まで走査します。collectLabels(scrollableList, entries)
  // が読み取った項目を entries へ加え、登録した項目数を返す想定です。
  const scanScrollableList = async (root, collectLabels) => {
    const scrollableList = findPaletteDialogScrollableList(root);
    if (!scrollableList) throw new Error('チャットパレットのスクロール領域が見つかりません。');

    const entries = [];
    let itemLabelCount = 0;
    const collect = () => {
      itemLabelCount = collectLabels(scrollableList, entries);
      return itemLabelCount;
    };

    // スクロール対象として、スクロール領域自身とその上位コンテナも候補に含めます。
    // CCFOLIAのDOM構造によっては .scrollable-list 自体に十分なスクロール量がない場合があります。
    const scrollDelta = (element) => element.scrollHeight - element.clientHeight;
    const scrollCandidates = [scrollableList, ...scrollableList.querySelectorAll('div, ul, ol')];
    let parent = scrollableList.parentElement;
    while (parent && parent !== document.body) {
      scrollCandidates.push(parent);
      parent = parent.parentElement;
    }
    const scrollingElement = scrollCandidates
      .filter(visible)
      .sort((left, right) => scrollDelta(right) - scrollDelta(left))
      .find((element) => scrollDelta(element) > 1) ?? scrollableList;

    collect();
    // 項目数・高さ・位置が固定したまま最下部に張り付くまで、少しずつスクロールします。
    // スクロールが効かない場合（取り間違った要素など）は、そこまで読めた分で打ち切るので
    // 表を長時間開けっぱなしにしません。
    let stablePasses = 0;
    let noMovePasses = 0;
    let previousCount = -1;
    let previousHeight = -1;
    let previousTop = -1;
    for (let pass = 0; pass < 200 && stablePasses < 3; pass += 1) {
      const count = collect();
      const height = scrollingElement.scrollHeight;
      const top = Math.round(scrollingElement.scrollTop);
      const atBottom = top + scrollingElement.clientHeight >= height - 2;
      if (count === previousCount && height === previousHeight && top === previousTop && atBottom) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }
      if (!atBottom && top === previousTop && previousTop >= 0) {
        // 直前のステップでスクロールが全く効いていない（表が開いたまま止まる原因になる）ため即打ち切り。
        noMovePasses += 1;
        if (noMovePasses >= 2) break;
      } else {
        noMovePasses = 0;
      }
      previousCount = count;
      previousHeight = height;
      previousTop = top;
      if (stablePasses >= 3) break;
      if (atBottom) break;
      // 非表示タブでは各待ちが約1秒に間引かれるため、1回で大きく進めて往復数を減らします
      // （待ちが長いぶん表示の描画も追いつくので、大きく進めて安全です）。
      const step = Math.max(120, scrollingElement.clientHeight * (document.hidden ? 1.6 : 0.7));
      const maxTop = height - scrollingElement.clientHeight;
      scrollingElement.scrollTop = Math.min(maxTop, scrollingElement.scrollTop + step);
      scrollingElement.dispatchEvent(new Event('scroll', { bubbles: true }));
      await wait(70);
    }
    // 主候補のほかにスクロール量のある容器（内側のリストなど）があれば、それらも
    // 全部最下部まで送ってから読み直し、シーン・パレットの項目を取りこぼしません。
    const otherScrollables = scrollCandidates.filter(visible)
      .filter((element) => scrollDelta(element) > 1 && element !== scrollingElement);
    for (const candidate of otherScrollables) {
      candidate.scrollTop = candidate.scrollHeight - candidate.clientHeight;
      candidate.dispatchEvent(new Event('scroll', { bubbles: true }));
      await wait(80);
      collect();
    }
    collect();
    return [...entries];
  };
  const readChatPaletteEntries = (root) =>
    scanScrollableList(root, (scrollableList, entries) => {
      let count = 0;
      // 同名の項目は重複としてまとめず「全部そのまま」残したい場合もあるため、
      // シーン側と同じく配列で保持する（パレット側だけは読みやすさの重複除去）。
      for (const label of scrollableList.querySelectorAll('.MuiListItemButton-root[role="button"] .MuiListItemText-primary')) {
        count += 1;
        const text = normalizedText(label);
        if (text && !entries.includes(text)) entries.push(text);
      }
      return count;
    });

  // シーン一覧の読み取り。シーンパネルもチャットパレットと同じ .MuiDialogContent-root.scrollable-list を
  // 使うため、走査ロジックを流用します。カード（.MuiCard-root）内の最初の見出し
  // （.MuiTypography-caption）がシーン名で、その次がBGMファイル名です。
  // 同名のシーン（「新しいシーン」が複数など）も読み取り数を正すため、カード単位で重複保持します。
  const readSceneEntries = async (root) => {
    const seenCards = new WeakSet();
    return await scanScrollableList(root, (scrollableList, entries) => {
      let count = 0;
      for (const card of scrollableList.querySelectorAll('.MuiCard-root')) {
        count += 1;
        if (seenCards.has(card)) continue;
        seenCards.add(card);
        const caption = card.querySelector('.MuiTypography-caption');
        const text = normalizedText(caption);
        if (text) entries.push(text);
      }
      return count;
    });
  };

  const openSceneListPanel = async () => withChatDrawer(async () => {
    const icon = [...document.querySelectorAll('svg[data-testid="OndemandVideoIcon"]')].find(visible);
    const button = icon?.closest('button');
    if (!button) throw new Error('CCFOLIAのシーン（映像アイコン）ボタンが見つかりません。');

    button.click();
    // シーンパネルのヘッダー文言に依存しないよう、scrollable-list を含む最も小さな可視ダイアログを拾います。
    // MuiCard-root も MuiPaper の仲間なので、誤ってカード本体などを拾わないよう除外します。
    const root = await waitFor(() => [...document.querySelectorAll('[role="dialog"], .MuiDialog-root, .MuiModal-root, [role="presentation"], .MuiPaper-root')]
      .filter(visible)
      .filter((element) => !element.matches('.MuiCard-root'))
      .filter((element) => element.querySelector('.MuiDialogContent-root.scrollable-list'))
      .sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length)[0] ?? null, 3000);
    if (!root) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      // 検出できなかった場合でも、表が開いたまま残ることがあるため後始末します。
      // 画面に見えている「閉じる」ボタン（aria-label="閉じる"）を押してから外側クリックします。
      for (const button of [...document.querySelectorAll('button[aria-label="閉じる"]')].filter(visible).slice(0, 3)) {
        pressElement(button);
        await fastWait(80);
      }
      if ([...document.querySelectorAll('.MuiPaper-root:has(.scrollable-list)')].some(visible)) {
        await clickAwayFromMenus();
      }
      throw new Error('CCFOLIAのシーン一覧を読み取れませんでした。');
    }

    try {
      const entries = await readSceneEntries(root);
      return { ok: true, entries };
    } finally {
      // 走査が終わったらすぐ閉じる: まず「閉じる」ボタンを押し、短い間隔で閉じたか確認します。
      // MUI製なので pressElement で pointer/mouse付きで押します。残っていたらEscape→外側クリック
      // の順で、テンポよく消えるまで繰り返します（遅い外側クリックは最後の手段にします）。
      const closeButton = findPanelCloseButton(root);
      if (closeButton) pressElement(closeButton);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await fastWait(attempt === 0 ? 100 : 120);
        if (!root.isConnected || !visible(root)) break;
        if (attempt === 0) {
          // ボタンが効かなかった場合の即時の1発目は、安く速いEscapeから試します。
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } else if (attempt % 2 === 1) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } else {
          await clickAwayFromMenus();
        }
      }
      // 最後まで残った場合の保険: 画面に見えている「閉じる」ボタンを全部押してから外側クリックします。
      if (root.isConnected && visible(root)) {
        for (const button of [...document.querySelectorAll('button[aria-label="閉じる"]')].filter(visible).slice(0, 3)) {
          pressElement(button);
          await fastWait(80);
        }
        if (root.isConnected && visible(root)) await clickAwayFromMenus();
      }
      await fastWait(60);
    }
  }, { forceOpen: true, closeAfter: true });
  const openChatPalette = async () => withChatDrawer(async () => {
    const icon = [...document.querySelectorAll('svg[data-testid="ListAltIcon"]')].find(visible);
    const button = icon?.closest('button');
    if (!button) throw new Error('CCFOLIAのチャットパレットボタンが見つかりません。');

    button.click();
    // 現在のCCFOLIAではダイアログが role="dialog" を持たず MuiPaper-root でラップされているため、
    // 従来のセレクターに加えて MuiPaper-root も検索対象に含めます。
    const root = await waitFor(() => [
      ...document.querySelectorAll('[role="dialog"], .MuiDialog-root, .MuiModal-root, [role="presentation"], .MuiPaper-root')
    ]
      .filter(visible)
      .filter((element) => normalizedText(element).includes('チャットパレット'))
      .sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length)[0], 3000);
    if (!root) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      throw new Error('CCFOLIAのチャットパレットを読み取れませんでした。');
    }

    try {
      // SANロール（1d100<={SAN}）やダメージ判定など、CCB以外の項目も含めて全項目を返します。
      const entries = await readChatPaletteEntries(root);
      // パレットは発言者（現在のキャラクター）ごとに内容が変わるため、
      // どのキャラクターのパレットかを一緒に返します。
      const speakerInput = document.querySelector('input[name="name"][placeholder="noname"]');
      const characterName = (speakerInput?.value ?? '').trim();
      return { ok: true, entries, characterName };
    } finally {
      // 走査が終わったらすぐ閉じる: 「閉じる」ボタンを押し、残ったらEscape→外側クリックの順で
      // 短いテンポで消えるまで試します（遅い外側クリックは最後の手段にします）。
      closeChatPaletteDialog(root);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await fastWait(attempt === 0 ? 100 : 110);
        if (!root.isConnected || !visible(root)) break;
        if (attempt === 0) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        else await clickAwayFromMenus();
      }
      await fastWait(60);
    }
  }, { forceOpen: true, closeAfter: true });

  // 取得などの操作でCCFOLIA側に開いてしまったダイアログ・メニュー（シーン表、チャットパレットなど）を
  // すべて閉じて、画面をすっきりさせます。外側クリック→Escapeを、消えるまで最大4回繰り返します。
  // シーン表やチャットパレットは role="dialog" を持たないMuiPaper製のため、
  // scrollable-list やカードを含むパネルも検出対象にします。
  const cleanUpMenus = async () => {
    const openOverlays = () => [...document.querySelectorAll(
      '[role="dialog"], .MuiDialog-root, .MuiModal-root, .MuiBackdrop-root, .MuiMenu-root, .MuiPopover-root, [aria-modal="true"],'
        + ' .MuiPaper-root:has(.scrollable-list), .MuiPaper-root:has(.MuiCard-root), .MuiPaper-root:has(.MuiTabs-root)'
    )].filter(visible).filter((element) => !element.matches('.MuiCard-root'));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!openOverlays().length) break;
      // まず各パネルの「閉じる」ボタンを直接押します（シーン表・チャットパレットの正面の閉じ方）。
      // MUI製のため pressElement で押します。実行中に上に乗るメニューが開き得るため、
      // 表示中の上位数枚だけ押します。
      for (const overlay of openOverlays().slice(-4)) {
        const closeButton = findPanelCloseButton(overlay);
        if (closeButton) pressElement(closeButton);
      }
      await fastWait(160);
      if (!openOverlays().length) break;
      // ルート要素を特定できなかったパネルにも対応するため、見えている「閉じる」ボタンを押してから
      // 速いEscape→外側クリックの順で試します（aria-label="閉じる" は面板専用で誤押の心配がありません）。
      for (const button of [...document.querySelectorAll('button[aria-label="閉じる"]')].filter(visible).slice(-3)) {
        pressElement(button);
      }
      await fastWait(140);
      if (!openOverlays().length) break;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fastWait(140);
      if (!openOverlays().length) break;
      await clickAwayFromMenus();
      await fastWait(140);
    }
    return { ok: true };
  };

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

  const CHAT_OVERLAY_ID = 'ccfolia-expanded-chat-overlay';
  const CHAT_SELECTOR_ID = 'ccfolia-expanded-chat-selector';
  const CHAT_OVERLAY_MODE_KEY = 'ccfoliaChatOverlayMode';
  const CHAT_OVERLAY_BOUNDS_KEY = 'ccfoliaChatOverlayBounds';
  let chatOverlayPanel = null;
  let lastChatOverlayBounds = null;
  let chatOverlayMode = 'room';
  let preferredChatOverlayMode = 'room';
  let chatOverlaySyncPromise = null;
  let chatOverlayPositionTimer = 0;
  let chatOverlayResizeObserver = null;
  let chatOverlayPositionHandler = null;

  const findChatPanel = () => {
    const logList = document.querySelector('ul[aria-label="ルームチャット"][role="log"]');
    const composer = document.querySelector('textarea[name="text"][placeholder="メッセージを入力"]');
    if (!logList || !composer) return null;

    for (let ancestor = logList; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      if (!ancestor.contains(composer)) continue;
      if (ancestor.matches('.MuiDrawer-paper, [role="dialog"], [aria-modal="true"]')) return ancestor;
    }

    const ancestors = new Set();
    for (let ancestor = logList; ancestor; ancestor = ancestor.parentElement) ancestors.add(ancestor);
    for (let ancestor = composer; ancestor; ancestor = ancestor.parentElement) {
      if (ancestors.has(ancestor)) return ancestor === document.body ? null : ancestor;
    }
    return null;
  };

  const chatPanelIsVisible = (panel) => {
    if (!panel || !visible(panel)) return false;
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      && rect.right > 0 && rect.bottom > 0
      && rect.left < window.innerWidth && rect.top < window.innerHeight;
  };

  const readChatOverlayBounds = (bounds) => {
    const values = ['left', 'top', 'width', 'height'].map((key) => Number(bounds[key]));
    if (!values.every(Number.isFinite)) throw new Error('保存された拡張チャットの位置が不正です。');
    return { left: values[0], top: values[1], width: values[2], height: values[3] };
  };
  const saveChatOverlayBounds = (bounds) => {
    const next = readChatOverlayBounds(bounds);
    if (JSON.stringify(next) === JSON.stringify(lastChatOverlayBounds)) return next;
    lastChatOverlayBounds = next;
    chrome.storage.local.set({ [CHAT_OVERLAY_BOUNDS_KEY]: next })
      .catch((reason) => error('拡張チャットの位置を保存できませんでした。', reason));
    return next;
  };

  const closeChatOverlay = () => {
    window.clearInterval(chatOverlayPositionTimer);
    chatOverlayPositionTimer = 0;
    chatOverlayResizeObserver?.disconnect();
    chatOverlayResizeObserver = null;
    if (chatOverlayPositionHandler) {
      window.removeEventListener('resize', chatOverlayPositionHandler);
      window.removeEventListener('scroll', chatOverlayPositionHandler, true);
      chatOverlayPositionHandler = null;
    }
    document.getElementById(CHAT_OVERLAY_ID)?.remove();
    chatOverlayPanel = null;
  };

  const openChatOverlay = async () => {
    const storedBounds = await chrome.storage.local.get(CHAT_OVERLAY_BOUNDS_KEY);
    const savedBounds = storedBounds[CHAT_OVERLAY_BOUNDS_KEY];
    if (savedBounds && ['left', 'top', 'width', 'height'].every((key) => Number.isFinite(Number(savedBounds[key])))) {
      lastChatOverlayBounds = readChatOverlayBounds(savedBounds);
    }
    const panel = findChatPanel();
    closeChatOverlay();
    chatOverlayPanel = chatPanelIsVisible(panel) ? panel : null;

    const host = document.createElement('div');
    host.id = CHAT_OVERLAY_ID;
    host.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:auto;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { display: block; width: 100%; height: 100%; pointer-events: auto; }
        iframe { display: block; width: 100%; height: 100%; border: 0; background: #191c24; pointer-events: auto; }
      </style>
      <iframe title="拡張チャット" src="${chrome.runtime.getURL('control.html?embedded=1')}"></iframe>`;
    const positionChatOverlay = () => {
      if (!chatDrawerIsOpen()) {
        if (chatOverlayMode === 'expanded') {
          setChatOverlayMode('room', { remember: false })
            .catch((reason) => error('ルームチャットの閉じる状態を同期できませんでした。', reason));
        } else {
          host.hidden = true;
        }
        return;
      }
      if (!chatOverlayPanel?.isConnected || !chatPanelIsVisible(chatOverlayPanel)) {
        const panel = findChatPanel();
        if (chatPanelIsVisible(panel)) chatOverlayPanel = panel;
      }
      let bounds;
      if (chatOverlayPanel?.isConnected && chatPanelIsVisible(chatOverlayPanel)) {
        const rect = chatOverlayPanel.getBoundingClientRect();
        bounds = saveChatOverlayBounds({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        });
      } else {
        bounds = lastChatOverlayBounds ?? saveChatOverlayBounds({
          left: window.innerWidth - Math.min(440, window.innerWidth - 40) - 20,
          top: window.innerHeight - Math.min(720, window.innerHeight * 0.78) - 20,
          width: Math.min(440, window.innerWidth - 40),
          height: Math.min(720, window.innerHeight * 0.78)
        });
      }
      host.hidden = false;
      host.style.left = `${bounds.left}px`;
      host.style.top = `${bounds.top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.width = `${bounds.width}px`;
      host.style.height = `${bounds.height}px`;
    };
    document.body.append(host);
    positionChatOverlay();
    chatOverlayPositionHandler = positionChatOverlay;
    if (chatOverlayPanel) {
      chatOverlayResizeObserver = new ResizeObserver(positionChatOverlay);
      chatOverlayResizeObserver.observe(chatOverlayPanel);
    }
    window.addEventListener('resize', chatOverlayPositionHandler);
    window.addEventListener('scroll', chatOverlayPositionHandler, true);
    chatOverlayPositionTimer = window.setInterval(positionChatOverlay, 300);
  };

  const updateChatOverlayModeLabel = () => {
    const selectorButton = document.getElementById(CHAT_SELECTOR_ID)?.shadowRoot
      ?.querySelector('button[data-mode-toggle]');
    if (selectorButton) selectorButton.textContent = chatOverlayMode === 'expanded' ? '拡張チャット' : 'ルームチャット';
  };
  const setChatOverlayMode = async (mode, { remember = true } = {}) => {
    if (remember) {
      preferredChatOverlayMode = mode;
      await chrome.storage.local.set({ [CHAT_OVERLAY_MODE_KEY]: mode });
    }
    if (mode === 'room') {
      closeChatOverlay();
      chatOverlayMode = 'room';
      updateChatOverlayModeLabel();
      return;
    }
    if (!document.getElementById(CHAT_OVERLAY_ID)) await openChatOverlay();
    chatOverlayMode = 'expanded';
    updateChatOverlayModeLabel();
  };

  const synchronizeChatOverlayMode = () => {
    if (chatOverlaySyncPromise) return;
    chatOverlaySyncPromise = (async () => {
      if (preferredChatOverlayMode === 'expanded' && chatDrawerIsOpen()) {
        if (chatOverlayMode !== 'expanded') await setChatOverlayMode('expanded', { remember: false });
      } else if (chatOverlayMode === 'expanded' && !chatDrawerIsOpen()) {
        await setChatOverlayMode('room', { remember: false });
      }
    })()
      .catch((reason) => error('チャット表示モードを同期できませんでした。', reason))
      .finally(() => {
        chatOverlaySyncPromise = null;
      });
  };

  const installChatOverlaySelector = () => {
    if (document.getElementById(CHAT_SELECTOR_ID)) return;
    const host = document.createElement('div');
    host.id = CHAT_SELECTOR_ID;
    host.style.cssText = 'position:fixed;top:0;left:50%;z-index:2147483647;transform:translateX(-50%);';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { display: block; width: max-content; color-scheme: dark; font: 13px/1.4 "Noto Sans JP", Roboto, system-ui, sans-serif; }
        .hover-trigger { position: absolute; top: 0; left: 50%; width: 100vw; height: 14px; transform: translateX(-50%); }
        .selector { position: relative; z-index: 1; display: flex; justify-content: center; padding: 5px 8px 7px; border: 1px solid #555; border-top: 0; border-radius: 0 0 8px 8px; background: #222; box-shadow: 0 3px 8px rgb(0 0 0 / .35); transform: translateY(calc(-100% + 6px)); transition: transform .14s ease; }
        .selector::after { position: absolute; bottom: 0; left: 50%; width: 32px; height: 3px; border-radius: 3px 3px 0 0; background: #777; content: ""; transform: translate(-50%, 100%); }
        :host(:hover) .selector, :host(:focus-within) .selector { transform: translateY(0); }
        button { min-width: 116px; min-height: 30px; padding: 5px 12px; border: 1px solid #666; border-radius: 5px; background: #292929; color: #fff; font: inherit; cursor: pointer; }
        button:hover { background: #3a3a3a; }
      </style>
      <div class="hover-trigger" aria-hidden="true"></div>
      <div class="selector">
        <button type="button" data-mode-toggle aria-label="チャット表示モードを切り替え">ルームチャット</button>
      </div>`;
    shadow.querySelector('button[data-mode-toggle]').addEventListener('click', () => {
      const mode = chatOverlayMode === 'expanded' ? 'room' : 'expanded';
      setChatOverlayMode(mode).catch((reason) => {
        const messageText = reason instanceof Error ? reason.message : String(reason);
        error(messageText);
      });
    });
    document.body.append(host);
  };

  installChatOverlaySelector();
  chrome.storage.local.get(CHAT_OVERLAY_MODE_KEY)
    .then((stored) => {
      preferredChatOverlayMode = stored[CHAT_OVERLAY_MODE_KEY] === 'expanded' ? 'expanded' : 'room';
      synchronizeChatOverlayMode();
    })
    .catch((reason) => error('保存済みのチャット表示モードを読み込めませんでした。', reason));
  const chatOverlayModeObserver = new MutationObserver(synchronizeChatOverlayMode);
  chatOverlayModeObserver.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['aria-expanded', 'class', 'style']
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CCFOLIA_CHAT_OVERLAY_TOGGLE') {
      if (document.getElementById(CHAT_OVERLAY_ID)) {
        setChatOverlayMode('room').catch((reason) => error('ルームチャットへ切り替えられませんでした。', reason));
        sendResponse({ ok: true });
        return undefined;
      }
      setChatOverlayMode('expanded')
        .then(() => sendResponse({ ok: true }))
        .catch((reason) => {
          const messageText = reason instanceof Error ? reason.message : String(reason);
          error(messageText);
          sendResponse({ ok: false, error: messageText });
        });
      return true;
    }
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
    if (message?.type === 'CCFOLIA_CHAT_OPEN_DRAWER_IN_ROOM') {
      openChatDrawer()
        .then((result) => sendResponse(result))
        .catch((reason) => sendResponse({ ok: false, error: reason instanceof Error ? reason.message : String(reason) }));
      return true;
    }
    if (message?.type === 'CCFOLIA_CHAT_CLOSE_DRAWER_IN_ROOM') {
      closeChatDrawer()
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
      CCFOLIA_CHAT_PALETTE_IN_ROOM: openChatPalette,
      CCFOLIA_SCENE_LIST_IN_ROOM: openSceneListPanel,
      CCFOLIA_CLEANUP_UI_IN_ROOM: cleanUpMenus
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
