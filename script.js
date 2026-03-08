// 記録データを管理する配列
let records = [];

// タブを管理するための変数
let activeTabIndex = 0;
let editModes = []; // 各レコードの編集モード状態

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
    const savedRecords = localStorage.getItem('records');
    if (savedRecords) {
        const parsedRecords = JSON.parse(savedRecords);
        records = parsedRecords.map(record => ({
            ...record,
            history: [],
            future: [],
            defeats: record.defeats || 0,
            totalDrops: record.totalDrops || 0
        }));
        editModes = records.map(() => false);
    }
}

// 操作前に履歴を保存（futureをクリア）
function pushHistory(record) {
    const { history, future, ...state } = record;
    record.history.push(state);
    if (record.history.length > 5) record.history.shift();
    record.future = []; // 新しい操作でredoスタックをクリア
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
        totalDrops: 0
    };
    records.push(newRecord);
    editModes.push(false);
    saveRecords();
    renderTabs();
    switchTab(records.length - 1); // 新しいタブに切り替え
}

// タブを描画する
function renderTabs() {
    const tabsList = document.getElementById('tabs-list');
    const tabsContent = document.getElementById('tabs-content');

    tabsList.innerHTML = '';
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
        const isEditing = editModes[index] || false;
        content.innerHTML = `
            <div class="record-header">
                <div class="record-header-info">
                    <h2 contenteditable="true" class="editable-name" data-index="${index}">${record.name}</h2>
                    <span class="last-updated">最終更新: ${record.lastUpdated}</span>
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
                <button class="btn-edit-toggle edit-toggle${isEditing ? ' active' : ''}" data-index="${index}">✏️ 編集</button>
            </div>
            <div class="stats-grid${isEditing ? ' editing' : ''}">
                <div class="stat-card">
                    <span class="stat-label">総周回数</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="totalRounds">${record.totalRounds}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">遭遇回数</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="encounters">${record.encounters}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">遭遇確率</span>
                    <span class="stat-value">${(record.probability * 100).toFixed(2)}%</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">現在ハマり</span>
                    <span class="stat-value highlight editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="lastEncounterRounds">${record.lastEncounterRounds}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">最小ハマり</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="minRounds">${record.minRounds}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">最大ハマり</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="maxRounds">${record.maxRounds}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">総ドロップ数</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="totalDrops">${record.totalDrops}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">敗北数</span>
                    <span class="stat-value editable-field" contenteditable="${isEditing}" data-index="${index}" data-field="defeats">${record.defeats}</span>
                </div>
            </div>
            <div class="controls">
                <div class="encounter-buttons">
                    <button class="btn-encounter-none encounter-none" data-index="${index}">遭遇なし</button>
                    <button class="btn-encounter encounter" data-index="${index}">遭遇</button>
                </div>
            </div>
        `;
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

    document.querySelectorAll('.editable-name').forEach(el => {
        el.addEventListener('input', (e) => {
            // 入力中にタブのテキストをリアルタイム更新
            const idx = parseInt(e.target.dataset.index, 10);
            const tabButtons = document.querySelectorAll('#tabs-list li:not(:last-child) button');
            if (tabButtons[idx]) tabButtons[idx].textContent = e.target.textContent || '';
        });
        el.addEventListener('blur', updateName);
    });

    document.querySelectorAll('.edit-toggle').forEach(button => {
        button.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            editModes[idx] = !editModes[idx];
            renderTabs();
        });
    });

    document.querySelectorAll('.editable-field').forEach(el => {
        el.addEventListener('focus', (e) => {
            // フォーカス時に全選択
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

    document.querySelectorAll('.encounter-none').forEach(button => {
        button.addEventListener('click', () => updateRounds(button.dataset.index, false));
    });

    document.querySelectorAll('.encounter').forEach(button => {
        button.addEventListener('click', () => handleEncounter(button.dataset.index));
    });

    document.querySelectorAll('.undo').forEach(button => {
        button.addEventListener('click', undoRecord);
    });

    document.querySelectorAll('.redo').forEach(button => {
        button.addEventListener('click', redoRecord);
    });

    document.querySelectorAll('.delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            if (btn.dataset.confirm === 'true') {
                deleteRecord(btn.dataset.index);
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

    if (isNaN(value) || value < 0) {
        // 無効値の場合は元に戻す
        event.target.textContent = records[index][field];
        return;
    }

    // 履歴を保存
    pushHistory(records[index]);

    records[index][field] = value;
    // 確率の再計算
    records[index].probability = records[index].encounters / records[index].totalRounds || 0;
    records[index].lastUpdated = new Date().toLocaleString();
    saveRecords();
    renderTabs();
}

// データ名を更新する
function updateName(event) {
    const index = event.target.dataset.index;
    const newName = event.target.textContent.trim();
    if (newName) {
        records[index].name = newName;
        records[index].lastUpdated = new Date().toLocaleString();
        saveRecords();
    } else {
        event.target.textContent = records[index].name; // 空の場合は元に戻す
    }
}

// 遭遇時の処理
function handleEncounter(index) {
    const record = records[index];

    // 入力フォームを表示
    const inputContainer = document.createElement('div');
    inputContainer.className = 'drop-input-container';
    inputContainer.innerHTML = `
        <div class="drop-input-modal">
            <label for="drop-count">ドロップ数を入力してください (0の場合は敗北):</label>
            <input type="number" id="drop-count" min="0" class="form-control">
            <button id="submit-drop" class="btn btn-primary">決定</button>
            <button id="cancel-drop" class="btn btn-secondary">キャンセル</button>
        </div>
    `;
    document.body.appendChild(inputContainer);

    // 入力処理
    document.getElementById('submit-drop').addEventListener('click', () => {
        const drops = parseInt(document.getElementById('drop-count').value, 10);
        if (isNaN(drops) || drops < 0) {
            alert("有効な数値を入力してください。");
            return;
        }

        // 履歴を保存
        pushHistory(record);

        record.totalRounds += 1;
        record.encounters += 1;
        record.minRounds = record.minRounds === null || record.minRounds === undefined ? record.lastEncounterRounds : Math.min(record.minRounds, record.lastEncounterRounds);
        record.maxRounds = record.maxRounds === null || record.maxRounds === undefined ? record.lastEncounterRounds : Math.max(record.maxRounds, record.lastEncounterRounds);
        record.lastEncounterRounds = 0; // 遭遇したのでリセット

        if (drops === 0) {
            record.defeats += 1; // 敗北数を増加
        } else {
            record.totalDrops += drops; // 総ドロップ数を増加
        }

        record.probability = record.encounters / record.totalRounds || 0;
        record.lastUpdated = new Date().toLocaleString();
        saveRecords();
        renderTabs();

        // 入力フォームを削除
        document.body.removeChild(inputContainer);
    });

    // キャンセル処理
    document.getElementById('cancel-drop').addEventListener('click', () => {
        document.body.removeChild(inputContainer);
    });
}

// 周回数を更新する
function updateRounds(index, isEncounter) {
    const record = records[index];

    // 履歴を保存
    pushHistory(record);

    record.totalRounds += 1;

    if (isEncounter) {
        record.encounters += 1;
        record.minRounds = record.minRounds === null || record.minRounds === undefined ? 0 : Math.min(record.minRounds, record.lastEncounterRounds);
        record.maxRounds = record.maxRounds === null || record.maxRounds === undefined ? 0 : Math.max(record.maxRounds, record.lastEncounterRounds);
        record.lastEncounterRounds = 0; // 遭遇したのでリセット
    } else {
        record.lastEncounterRounds += 1; // 遭遇なしの場合、ハマりを増加

        // 遭遇なしのたびに最大・最小ハマりを更新
        record.minRounds = record.minRounds === null || record.minRounds === undefined ? record.lastEncounterRounds : Math.min(record.minRounds, record.lastEncounterRounds);
        record.maxRounds = record.maxRounds === null || record.maxRounds === undefined ? record.lastEncounterRounds : Math.max(record.maxRounds, record.lastEncounterRounds);
    }

    record.probability = record.encounters / record.totalRounds || 0;
    record.lastUpdated = new Date().toLocaleString();
    saveRecords();
    renderTabs();
}

// Undo機能
function undoRecord(event) {
    const index = event.target.dataset.index;
    const record = records[index];

    if (record.history.length > 0) {
        const { history, future, ...currentState } = record;
        record.future.push(currentState);
        if (record.future.length > 5) record.future.shift();
        const previousState = record.history.pop();
        Object.assign(record, previousState);
        saveRecords();
        renderTabs();
    }
}

// Redo機能
function redoRecord(event) {
    const index = event.target.dataset.index;
    const record = records[index];

    if (record.future.length > 0) {
        const { history, future, ...currentState } = record;
        record.history.push(currentState);
        if (record.history.length > 5) record.history.shift();
        const nextState = record.future.pop();
        Object.assign(record, nextState);
        saveRecords();
        renderTabs();
    }
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