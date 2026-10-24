(() => {
  'use strict';

  const metricOptions = document.getElementById('metric-options');
  const operationOptions = document.getElementById('operation-options');
  const amountInput = document.getElementById('amount');
  const amountLabel = document.getElementById('amount-label');
  const amountOptions = document.getElementById('amount-options');
  const acquireButton = document.getElementById('acquire');
  const charactersElement = document.getElementById('characters');
  const runButton = document.getElementById('run');
  const status = document.getElementById('status');
  let acquiredCharacters = null;
  let metricKey = 'hp';
  let operation = 'decrease';

  acquireButton.addEventListener('click', async () => {
    acquireButton.disabled = true;
    status.textContent = 'キャラクター情報を取得しています…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CCFOLIA_ACQUIRE_CHARACTERS' });
      if (!result?.ok) throw new Error(result?.error || 'キャラクター情報を取得できませんでした。');
      acquiredCharacters = result.characters;
      charactersElement.replaceChildren();
      for (const character of acquiredCharacters) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'character-choice is-selected';
        button.dataset.characterId = character.id;
        button.setAttribute('aria-pressed', 'true');
        button.textContent = character.name;
        charactersElement.append(button);
      }
      status.textContent = `${acquiredCharacters.length}人のキャラクター情報を取得しました。対象を選択してください。`;
    } catch (reason) {
      acquiredCharacters = null;
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      acquireButton.disabled = false;
    }
  });

  charactersElement.addEventListener('click', (event) => {
    const button = event.target.closest('.character-choice');
    if (!button) return;
    const selected = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  });

  const selectButton = (group, value) => {
    for (const button of group.querySelectorAll('.choice-button')) {
      const selected = button.dataset.value === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  const updateAmountLabel = () => {
    amountLabel.textContent = operation === 'set' ? '設定値' : '変更量';
    amountInput.min = operation === 'set' ? '0' : '1';
  };
  const selectAmount = (value) => {
    for (const button of amountOptions.querySelectorAll('.amount-choice')) {
      const selected = Number(button.dataset.value) === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };
  amountOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.amount-choice');
    if (!button) return;
    amountInput.value = button.dataset.value;
    selectAmount(Number(button.dataset.value));
  });
  amountInput.addEventListener('input', () => {
    const amount = Number(amountInput.value);
    selectAmount(amountInput.value === '' ? NaN : amount);
  });
  metricOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.choice-button');
    if (!button) return;
    metricKey = button.dataset.value;
    selectButton(metricOptions, metricKey);
  });
  operationOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.choice-button');
    if (!button) return;
    operation = button.dataset.value;
    selectButton(operationOptions, operation);
    updateAmountLabel();
  });
  updateAmountLabel();

  runButton.addEventListener('click', async () => {
    const amount = Number(amountInput.value);
    const minimum = operation === 'set' ? 0 : 1;
    if (!Number.isInteger(amount) || amount < minimum || amount > 999999) {
      status.textContent = operation === 'set'
        ? '設定値は0以上の整数で入力してください。'
        : '変更量は1以上の整数で入力してください。';
      return;
    }
    runButton.disabled = true;
    status.textContent = 'CCFOLIAルームを操作しています…';
    try {
      const characterIds = acquiredCharacters
        ? [...charactersElement.querySelectorAll('.character-choice[aria-pressed="true"]')].map((button) => button.dataset.characterId)
        : undefined;
      if (acquiredCharacters && characterIds.length === 0) throw new Error('操作するキャラクターを1人以上選択してください。');
      const result = await chrome.runtime.sendMessage({
        type: 'CCFOLIA_APPLY_STATUS',
        metricKey,
        operation,
        amount,
        characterIds
      });
      if (!result?.ok) throw new Error(result?.error || '操作に失敗しました。');
      const action = operation === 'set' ? `${amount}に設定` : `${amount}ずつ${operation === 'increase' ? '増加' : '減少'}`;
      const limitNotice = result.limitedCount > 0 ? ` 最大値により${result.limitedCount}人分を制限しました。` : '';
      status.textContent = `${result.count}人の${result.metric}を${action}しました。${limitNotice}`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      runButton.disabled = false;
    }
  });
})();
