(() => {
  'use strict';

  const LOG_PREFIX = '[CCFOLIA 全員HP減少]';

  // CCFOLIAの画面変更時に調整するセレクタです。
  const SELECTORS = {
    hpLabel: 'body *',
    hpDecrease: 'button[aria-label="HPを減らす"]'
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

  // HPラベルだけを拾い、各表示行の親要素をキャラクター単位の操作対象にします。
  const findHpRows = () => {
    const rows = new Map();
    for (const label of document.querySelectorAll(SELECTORS.hpLabel)) {
      const text = label.textContent?.trim();
      const ariaLabel = label.getAttribute('aria-label')?.trim();
      if (!visible(label) || label.children.length !== 0 || (text !== 'HP' && ariaLabel !== 'HP')) continue;
      const row = label.parentElement;
      if (row && visible(row) && !rows.has(row)) rows.set(row, { label, row });
    }
    return [...rows.values()];
  };

  // HP行の近くに表示された、CCFOLIAのHP減少ボタンを直接探します。
  const findHpDecreaseButton = (target) => {
    const rowRect = target.row.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(SELECTORS.hpDecrease)].filter(visible);
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

  const applyToEveryone = async (amount) => {
    if (!Number.isInteger(amount) || amount <= 0 || amount > 999999) {
      throw new Error('減少値は1以上の整数で指定してください。');
    }

    const initialRows = findHpRows();
    if (initialRows.length === 0) throw new Error('HP表示行が見つかりませんでした。');
    log(`${initialRows.length}件のHP行を上から順に処理します。`);

    for (let index = 0; index < initialRows.length; index += 1) {
      // 前の値変更でDOMが更新されるため、毎回一覧から該当行を取り直します。
      let target = findHpRows()[index];
      if (!target) throw new Error(`${index + 1}件目のHP行が見つかりません。`);

      // HP行をクリックすると、その行の増減ボタンが表示されます。
      target.row.click();
      await wait(180);

      for (let count = 0; count < amount; count += 1) {
        const decreaseButton = findHpDecreaseButton(target);
        if (!decreaseButton) {
          throw new Error(`${index + 1}件目のHP減少ボタン（${SELECTORS.hpDecrease}）が見つかりません。`);
        }
        decreaseButton.click();
        await wait(100);
      }

      const rowText = target.row.textContent?.replace(/\s+/g, ' ').trim() || `HP行${index + 1}`;
      log(`${index + 1}/${initialRows.length}件目 (${rowText}) を${amount}減らしました。`);
      await wait(180);
    }

    log('全キャラクターのHP減少が完了しました。');
    return { ok: true, count: initialRows.length };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'CCFOLIA_APPLY_HP_IN_ROOM') return undefined;
    applyToEveryone(Number(message.amount))
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
