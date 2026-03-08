// ==============================
// 定数
// ==============================
const MAX_HISTORY = 5;

// ==============================
// 状態
// ==============================

// 記録データを管理する配列
let records = [];

// タブを管理するための変数
let activeTabIndex = 0;
let editModes = []; // 各レコードの編集モード状態

// ==============================
// ユーティリティ
// ==============================

/** HTMLエスケープ（XSS対策） */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** 遭遇確率を再計算 */
function calcProbability(record) {
    return record.totalRounds > 0 ? record.encounters / record.totalRounds : 0;
}

/** モーダルを開くヘルパー。背景クリックで閉じる。{ container, close } を返す */
function openModal(innerHtml) {
    const container = document.createElement('div');
    container.className = 'drop-input-container';
    container.innerHTML = innerHtml;
    document.body.appendChild(container);
    const close = () => {
        if (container.parentNode) document.body.removeChild(container);
    };
    container.addEventListener('click', (e) => { if (e.target === container) close(); });
    return { container, close };
}

// ローカルストレージにデータを保存する
function saveRecords() {
    const recordsToSave = records.map(record => {
        const { history, future, ...rest } = record; // history/futureを除外して保存
        return rest;
    });
    localStorage.setItem('records', JSON.stringify(recordsToSave));
}

// ローカルストレージからデータを読み込む
function loadRecords() {
    try {
        const saved = localStorage.getItem('records');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return;
        records = parsed.map(record => ({
            ...record,
            defeats:      record.defeats      ?? 0,
            totalDrops:   record.totalDrops   ?? 0,
            encounterLog: record.encounterLog ?? [],
            history: [],
            future:  [],
        }));
        editModes = records.map(() => false);
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        records = [];
        editModes = [];
    }
}

// 操作前に履歴を保存（futureをクリア）
function pushHistory(record) {
    const { history, future, ...state } = record;
    record.history.push({ ...state, encounterLog: [...(state.encounterLog || [])] });
    if (record.history.length > MAX_HISTORY) record.history.shift();
    record.future = [];
}

// 記録を追加する
function addRecord() {
    const newRecord = {
        name: `data${records.length + 1}`,
        totalRounds: 0,
        encounters: 0,
        minRounds: 0,
        maxRounds: 0,
        probability: 0,
        lastUpdated: new Date().toLocaleString(),
        lastEncounterRounds: 0,
        history: [],
        future: [],
        defeats: 0,
        totalDrops: 0,
        encounterLog: [],
    };
    records.push(newRecord);
    editModes.push(false);
    saveRecords();
    renderTabs();
    switchTab(records.length - 1); // 新しいタブに切り替え
}

// タブを描画する
function buildStatCard(label, value, index, field, isEditing, extraClass = '') {
    const cls = ['stat-value', 'editable-field', extraClass].filter(Boolean).join(' ');
    return `
        <div class="stat-card">
            <span class="stat-label">${label}</span>
            <span class="${cls}" contenteditable="${isEditing}" data-index="${index}" data-field="${field}">${value}</span>
        </div>`;
}

function buildTabContent(record, index) {
    const isEditing  = editModes[index] || false;
    const safeName   = escapeHtml(record.name);
    const safeDate   = escapeHtml(record.lastUpdated);
    return `
        <div class="record-header">
            <div class="record-header-info">
                <h2 contenteditable="true" class="editable-name" data-index="${index}">${safeName}</h2>
                <span class="last-updated">最終更新: ${safeDate}</span>
            </div>
            <div class="header-actions">
                <div class="header-actions-top">
                    <button class="btn-delete-icon delete" data-index="${index}" title="記録を削除">×</button>
                </div>
                <div class="header-actions-bottom">
                    <button class="btn-undo undo" data-index="${index}">↶ Undo</button>
                    <button class="btn-redo redo" data-index="${index}">↷ Redo</button>
                </div>
            </div>
        </div>
        <div class="edit-toggle-bar">
            <button class="btn-history history" data-index="${index}">📋 遭遇履歴</button>
            <button class="btn-edit-toggle edit-toggle${isEditing ? ' active' : ''}" data-index="${index}">✏️ 編集</button>
        </div>
        <div class="stats-grid${isEditing ? ' editing' : ''}">
            ${buildStatCard('総周回数',    record.totalRounds,          index, 'totalRounds',         isEditing)}
            ${buildStatCard('遭遇回数',    record.encounters,           index, 'encounters',          isEditing)}
            <div class="stat-card">
                <span class="stat-label">遭遇確率</span>
                <span class="stat-value">${(record.probability * 100).toFixed(2)}%</span>
            </div>
            ${buildStatCard('現在ハマり',  record.lastEncounterRounds,              index, 'lastEncounterRounds',  isEditing, 'highlight')}
            ${buildStatCard('最小ハマり',  record.encounters > 0 ? record.minRounds : '-', index, 'minRounds',           isEditing)}
            ${buildStatCard('最大ハマり',  record.maxRounds,                        index, 'maxRounds',           isEditing)}
            ${buildStatCard('総ドロップ数', record.totalDrops,        index, 'totalDrops',          isEditing)}
            ${buildStatCard('敗北数',      record.defeats,              index, 'defeats',             isEditing)}
        </div>
        <div class="controls">
            <div class="encounter-buttons">
                <button class="btn-encounter-none encounter-none" data-index="${index}">遭遇なし</button>
                <button class="btn-encounter encounter" data-index="${index}">遭遇</button>
            </div>
        </div>`;
}

function renderTabs() {
    const tabsList    = document.getElementById('tabs-list');
    const tabsContent = document.getElementById('tabs-content');

    tabsList.innerHTML    = '';
    tabsContent.innerHTML = '';

    records.forEach((record, index) => {
        // タブを作成
        const tab = document.createElement('li');
        const tabButton = document.createElement('button');
        tabButton.textContent = record.name;
        tabButton.className = index === activeTabIndex ? 'active' : '';
        tabButton.addEventListener('click', () => switchTab(index));
        tab.appendChild(tabButton);
        tabsList.appendChild(tab);

        // タブの内容を作成
        const content = document.createElement('div');
        content.className = 'tab-content';
        content.style.display = index === activeTabIndex ? 'block' : 'none';
        content.innerHTML = buildTabContent(record, index);
        tabsContent.appendChild(content);
    });

    // タブリストの末尾に+ボタンを追加
    const addTab = document.createElement('li');
    const addButton = document.createElement('button');
    addButton.id = 'add-record';
    addButton.textContent = '+';
    addButton.addEventListener('click', addRecord);
    addTab.appendChild(addButton);
    tabsList.appendChild(addTab);

    tabsContent.querySelectorAll('.editable-name').forEach(el => {
        el.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            const tabButtons = tabsList.querySelectorAll('li:not(:last-child) button');
            if (tabButtons[idx]) tabButtons[idx].textContent = e.target.textContent || '';
        });
        el.addEventListener('blur', updateName);
    });

    tabsContent.querySelectorAll('.edit-toggle').forEach(button => {
        button.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            editModes[idx] = !editModes[idx];
            renderTabs();
        });
    });

    tabsContent.querySelectorAll('.editable-field').forEach(el => {
        el.addEventListener('focus', (e) => {
            const range = document.createRange();
            range.selectNodeContents(e.target);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        el.addEventListener('blur', updateField);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        });
    });

    tabsContent.querySelectorAll('.encounter-none').forEach(btn => {
        btn.addEventListener('click', () => addRoundNoEncounter(parseInt(btn.dataset.index, 10)));
    });

    tabsContent.querySelectorAll('.encounter').forEach(btn => {
        btn.addEventListener('click', () => handleEncounter(parseInt(btn.dataset.index, 10)));
    });

    tabsContent.querySelectorAll('.undo').forEach(btn => {
        btn.addEventListener('click', undoRecord);
    });

    tabsContent.querySelectorAll('.redo').forEach(btn => {
        btn.addEventListener('click', redoRecord);
    });

    tabsContent.querySelectorAll('.history').forEach(btn => {
        btn.addEventListener('click', () => showHistory(parseInt(btn.dataset.index, 10)));
    });

    tabsContent.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.confirm === 'true') {
                confirmDelete(parseInt(btn.dataset.index, 10), btn);
            } else {
                btn.dataset.confirm = 'true';
                btn.textContent = '削除する';
                btn.classList.add('confirming');
                setTimeout(() => {
                    if (btn.dataset.confirm === 'true') {
                        btn.dataset.confirm = 'false';
                        btn.textContent = '×';
                        btn.classList.remove('confirming');
                    }
                }, 3000);
            }
        });
    });
}

// タブを切り替える
function switchTab(index) {
    activeTabIndex = index;
    renderTabs();
}

// フィールドを直接編集して保存する
function updateField(event) {
    const index = parseInt(event.target.dataset.index, 10);
    const field = event.target.dataset.field;
    const value = parseInt(event.target.textContent.trim(), 10);

    if (!Number.isFinite(value) || value < 0) {
        event.target.textContent = records[index][field];
        return;
    }

    pushHistory(records[index]);
    records[index][field] = value;
    records[index].probability = calcProbability(records[index]);
    records[index].lastUpdated = new Date().toLocaleString();
    saveRecords();
    renderTabs();
}

// データ名を更新する
function updateName(event) {
    const index = parseInt(event.target.dataset.index, 10);
    const newName = event.target.textContent.trim();
    if (newName) {
        records[index].name = newName;
        records[index].lastUpdated = new Date().toLocaleString();
        saveRecords();
    } else {
        event.target.textContent = records[index].name;
    }
}

// 遭遇時の処理
function handleEncounter(index) {
    const record = records[index];

    const { container, close } = openModal(`
        <div class="drop-input-modal">
            <label>ドロップ数を入力してください<br><small style="white-space:nowrap">(0の場合は敗北)</small></label>
            <input type="number" class="drop-count-input form-control" min="0" value="0">
            <div style="display:flex;gap:8px;margin-top:10px;justify-content:center">
                <button class="btn btn-primary submit-drop">決定</button>
                <button class="btn btn-secondary cancel-drop">キャンセル</button>
            </div>
        </div>
    `);

    const input = container.querySelector('.drop-count-input');
    input.focus();
    input.select();

    container.querySelector('.cancel-drop').addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  container.querySelector('.submit-drop').click();
        if (e.key === 'Escape') close();
    });

    container.querySelector('.submit-drop').addEventListener('click', () => {
        const drops = parseInt(input.value, 10);
        if (!Number.isFinite(drops) || drops < 0) {
            input.classList.add('is-invalid');
            return;
        }

        pushHistory(record);

        const prevStreak = record.lastEncounterRounds;
        record.totalRounds    += 1;
        record.encounters     += 1;
        if (record.encounters === 1) {
            record.minRounds = prevStreak;
            record.maxRounds = prevStreak;
        } else {
            record.minRounds = Math.min(record.minRounds, prevStreak);
            record.maxRounds = Math.max(record.maxRounds, prevStreak);
        }
        record.lastEncounterRounds = 0;

        if (drops === 0) {
            record.defeats    += 1;
        } else {
            record.totalDrops += drops;
        }

        record.encounterLog.push({
            no:          record.encounters,
            streak:      prevStreak,
            drops,
            result:      drops === 0 ? '敗北' : '勝利',
            totalRounds: record.totalRounds,
        });

        record.probability  = calcProbability(record);
        record.lastUpdated  = new Date().toLocaleString();
        saveRecords();
        renderTabs();
        close();
    });
}

// 遭遇履歴モーダルを表示
function showHistory(index) {
    const record = records[index];
    const log = record.encounterLog || [];

    const rows = log.length === 0
        ? '<tr><td colspan="5" class="history-empty">記録がありません</td></tr>'
        : [...log].reverse().map(entry => `
            <tr>
                <td>${entry.no}</td>
                <td>${entry.streak}</td>
                <td>${entry.drops}</td>
                <td class="result-${entry.result === '勝利' ? 'win' : 'lose'}">${entry.result}</td>
                <td>${entry.totalRounds}</td>
            </tr>`).join('');

    const { container, close } = openModal(`
        <div class="drop-input-modal history-modal">
            <h3 class="history-title">📋 遭遇履歴：${escapeHtml(record.name)}</h3>
            <div class="history-table-wrapper">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>No.</th>
                            <th>ハマり</th>
                            <th>ドロップ</th>
                            <th>結果</th>
                            <th>累計周回</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="margin-top:12px;text-align:center">
                <button class="btn btn-secondary close-history">閉じる</button>
            </div>
        </div>
    `);

    container.querySelector('.close-history').addEventListener('click', close);
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}

// 削除確認ダイアログを表示
function confirmDelete(idx, btn) {
    const name = escapeHtml(records[idx].name);
    const { container, close } = openModal(`
        <div class="drop-input-modal">
            <p style="margin:0 0 12px;text-align:center">「${name}」を削除しますか？<br><small style="white-space:nowrap">この操作は元に戻せません</small></p>
            <div style="display:flex;gap:8px;justify-content:center">
                <button class="btn btn-danger confirm-delete-ok">削除する</button>
                <button class="btn btn-secondary confirm-delete-cancel">キャンセル</button>
            </div>
        </div>
    `);
    const cancel = () => {
        close();
        btn.dataset.confirm = 'false';
        btn.textContent = '×';
        btn.classList.remove('confirming');
    };
    container.querySelector('.confirm-delete-cancel').addEventListener('click', cancel);
    container.querySelector('.confirm-delete-ok').addEventListener('click', () => {
        close();
        deleteRecord(idx);
    });
}

// 遭遇なしボタンの処理
function addRoundNoEncounter(index) {
    const record = records[index];
    pushHistory(record);

    record.totalRounds         += 1;
    record.lastEncounterRounds += 1;
    record.maxRounds = Math.max(record.maxRounds || 0, record.lastEncounterRounds);

    record.probability  = calcProbability(record);
    record.lastUpdated  = new Date().toLocaleString();
    saveRecords();
    renderTabs();
}

// Undo機能
function undoRecord(event) {
    const index  = parseInt(event.currentTarget.dataset.index, 10);
    const record = records[index];
    if (record.history.length === 0) return;

    const { history, future, ...currentState } = record;
    record.future.push({ ...currentState, encounterLog: [...(currentState.encounterLog || [])] });
    if (record.future.length > MAX_HISTORY) record.future.shift();
    Object.assign(record, record.history.pop());
    saveRecords();
    renderTabs();
}

// Redo機能
function redoRecord(event) {
    const index  = parseInt(event.currentTarget.dataset.index, 10);
    const record = records[index];
    if (record.future.length === 0) return;

    const { history, future, ...currentState } = record;
    record.history.push({ ...currentState, encounterLog: [...(currentState.encounterLog || [])] });
    if (record.history.length > MAX_HISTORY) record.history.shift();
    Object.assign(record, record.future.pop());
    saveRecords();
    renderTabs();
}

// 記録を削除する
function deleteRecord(index) {
    records.splice(index, 1);
    editModes.splice(index, 1);
    activeTabIndex = Math.max(0, Math.min(activeTabIndex, records.length - 1));
    saveRecords();
    renderTabs();
}

// 初期化
loadRecords();
renderTabs();