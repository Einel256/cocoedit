(() => {
  'use strict';

  const LOG_PREFIX = '[CCFOLIA ステータス変更]';
  const ROOM_URL_PATTERN = 'https://ccfolia.com/rooms/*';
  const log = (...args) => console.info(LOG_PREFIX, ...args);
  const error = (...args) => console.error(LOG_PREFIX, ...args);
  let commandMapWrite = Promise.resolve();

  // 拡張機能アイコンから、ルームチャット上の拡張チャットを開閉します。
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      const roomTab = tab?.url?.startsWith('https://ccfolia.com/rooms/')
        ? tab
        : await findRoomTab();
      if (!roomTab.id) throw new Error('CCFOLIAのルームタブが見つかりません。先にルームを開いてください。');
      const result = await chrome.tabs.sendMessage(roomTab.id, { type: 'CCFOLIA_CHAT_OVERLAY_TOGGLE' });
      if (!result?.ok) throw new Error(result?.error || '拡張チャットを開けませんでした。');
    } catch (reason) {
      error('拡張チャットを開けませんでした。', reason);
    }
  });

  const findRoomTab = async () => {
    const tabs = await chrome.tabs.query({ url: ROOM_URL_PATTERN });
    const tab = tabs.find((candidate) => candidate.status === 'complete') ?? tabs[0];
    if (!tab?.id) throw new Error('CCFOLIAのルームタブが見つかりません。先にルームを開いてください。');
    return tab;
  };

  // 「見ていないタブ」への新着メッセージをデスクトップ通知で案内します。
  // content.js が検知した未読バッジの増分を中継してOSの通知に出します。
  chrome.runtime.onMessage.addListener((message, sendResponse) => {
    if (message?.type === 'CCFOLIA_CHAT_UNREAD_NOTIFY') {
      const items = Array.isArray(message.items) ? message.items : [];
      if (!items.length) return undefined;
      chrome.notifications.create('ccfolia-unread', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon.png'),
        title: '未閲覧のチャットタブに新着メッセージ',
        message: `${items.map((item) => `「${item.name}」`).join('')}に新着メッセージがあります`,
        silent: false
      }, () => void chrome.runtime.lastError);
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'CCFOLIA_CHAT_UNREAD_CLEAR') {
      chrome.notifications.clear('ccfolia-unread', () => void chrome.runtime.lastError);
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CCFOLIA_SAVE_COMMAND_MAP') {
      commandMapWrite = commandMapWrite.catch(() => {}).then(() => chrome.storage.local.set({ ccfoliaCommandMap: message.commandMap ?? {} }));
      commandMapWrite
        .then(() => sendResponse({ ok: true }))
        .catch((reason) => sendResponse({ ok: false, error: String(reason) }));
      return true;
    }
    if (message?.type === 'CCFOLIA_GET_COMMAND_MAP') {
      commandMapWrite.then(() => chrome.storage.local.get(['ccfoliaCommandMap', 'ccfoliaCharacters']))
        .then((stored) => sendResponse({ ok: true, commandMap: stored.ccfoliaCommandMap ?? {}, characters: stored.ccfoliaCharacters ?? [] }))
        .catch((reason) => sendResponse({ ok: false, error: String(reason) }));
      return true;
    }
    const forwardedTypes = new Set([
      'CCFOLIA_ACQUIRE_CHARACTERS',
      'CCFOLIA_CHAT_GET_STATE',
      'CCFOLIA_CHAT_OPEN_DRAWER',
      'CCFOLIA_CHAT_CLOSE_DRAWER',
      'CCFOLIA_CHAT_SEND',
      'CCFOLIA_CHAT_SELECT_TAB',
      'CCFOLIA_CHAT_SET_SPEAKER',
      'CCFOLIA_CHAT_SELECT_CHARACTER',
      'CCFOLIA_CHAT_OVERLAY_SUSPEND',
      'CCFOLIA_CHAT_DICE',
      'CCFOLIA_CHAT_PALETTE',
      'CCFOLIA_CHAT_PALETTE_SCAN_ALL',
      'CCFOLIA_CHAR_PIECES',
      'CCFOLIA_CHAR_PIECE_TOGGLE',
      'CCFOLIA_SCREEN_PANELS',
      'CCFOLIA_SCREEN_PANEL_TOGGLE',
      'CCFOLIA_SCENE_LIST',
      'CCFOLIA_CLEANUP_UI',
      'CCFOLIA_AUTO_SKIP_MODE',
      'CCFOLIA_AUTO_SKIP_STATUS'
    ]);
    if (!forwardedTypes.has(message?.type)) return undefined;

    (async () => {
      try {
        // 制御ウィンドウ自身ではなく、URLでCCFOLIAルームを明示的に探します。
        const roomTab = await findRoomTab();
        log('操作対象タブ:', roomTab.id, roomTab.url);
        const { type, ...payload } = message;
        const result = await chrome.tabs.sendMessage(roomTab.id, {
          ...payload,
          type: `${type}_IN_ROOM`
        });
        // ルーム側のContent Scriptから応答が無い（undefined）ときは原因を区別できるようにします。
        if (result === undefined) {
          throw new Error(`${type}に対してルーム側から応答がありません。拡張機能を更新した場合は、拡張機能の管理画面で再読み込みし、CCFOLIAのページも再読み込みしてください。`);
        }
        sendResponse(result);
      } catch (reason) {
        const messageText = reason instanceof Error ? reason.message : String(reason);
        error(messageText);
        sendResponse({ ok: false, error: messageText });
      }
    })();
    return true;
  });
})();
