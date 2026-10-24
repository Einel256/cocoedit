(() => {
  'use strict';

  const amountInput = document.getElementById('amount');
  const runButton = document.getElementById('run');
  const status = document.getElementById('status');

  runButton.addEventListener('click', async () => {
    const amount = Number(amountInput.value);
    if (!Number.isInteger(amount) || amount <= 0) {
      status.textContent = '減少値は1以上の整数で入力してください。';
      return;
    }
    runButton.disabled = true;
    status.textContent = 'CCFOLIAルームを操作しています…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CCFOLIA_APPLY_HP', amount });
      if (!result?.ok) throw new Error(result?.error || '操作に失敗しました。');
      status.textContent = `${result.count}人のHP減少コマンドを送信しました。`;
    } catch (reason) {
      console.error('[CCFOLIA 全員HP減少]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      runButton.disabled = false;
    }
  });
})();
