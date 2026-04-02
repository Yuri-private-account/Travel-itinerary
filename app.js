const predefinedCosts = { "水族館": { estimated: 4500 } };

// 18種類のパステル/見やすいカラーパレット
const colors = [
    "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", 
    "#bdb2ff", "#ffc6ff", "#fffffc", "#ffb4a2", "#e5989b", "#b5838d",
    "#fcd5ce", "#f8edeb", "#f0efeb", "#dcd2c6", "#c5dedd", "#a2d2ff"
];

let itineraryData = JSON.parse(localStorage.getItem('itinerary')) || [];
let currentEditingId = null; 

const listElement = document.getElementById('itinerary-list');
const colorPicker = document.getElementById('color-picker');

// --- カラーピッカーの生成 ---
colors.forEach(color => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color;
    circle.dataset.color = color;
    circle.addEventListener('click', () => selectColor(color));
    colorPicker.appendChild(circle);
});

function selectColor(color) {
    document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.color-circle[data-color="${color}"]`).classList.add('selected');
}

// --- 仮の地図初期化 ---
const map = L.map('map').setView([34.6441, 135.4323], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- ブロックの描画処理 ---
function renderItinerary() {
    listElement.innerHTML = '';
    itineraryData.forEach(spot => {
        const li = document.createElement('li');
        li.className = 'spot-block';
        li.dataset.id = spot.id;
        li.style.backgroundColor = spot.color || "#ffffff";
        
        // 【重要】滞在時間に応じた縦の長さを計算 (1時間 = 60pxの高さとする)
        const blockHeight = Math.max(50, spot.duration * 60); 
        li.style.height = `${blockHeight}px`;

        li.innerHTML = `
            <div class="drag-handle">≡</div>
            <div class="spot-info">
                <h3>${spot.title}</h3>
                <p>予定: ${spot.duration}h</p>
            </div>
            <button class="edit-btn">編集</button>
        `;

        // 編集ボタンを押した時の処理
        li.querySelector('.edit-btn').addEventListener('click', () => openEditSheet(spot));
        listElement.appendChild(li);
    });
}

// --- スポット追加（モック） ---
document.getElementById('add-mock-spot').addEventListener('click', () => {
    const newSpot = {
        id: Date.now().toString(),
        title: "サンプルの水族館",
        duration: 2.0, // デフォルト2時間
        estimated: 4500,
        memo: "メモをここに入力",
        color: colors[0] // デフォルトカラー
    };
    itineraryData.push(newSpot);
    saveData();
    renderItinerary();
});

// --- 並び替え (SortableJS) ---
new Sortable(listElement, {
    handle: '.drag-handle', // 左端のみでドラッグ可能
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
        const movedItem = itineraryData.splice(evt.oldIndex, 1)[0];
        itineraryData.splice(evt.newIndex, 0, movedItem);
        saveData();
    }
});

// --- 編集シート（ボトムシート）の制御 ---
const bottomSheet = document.getElementById('bottom-sheet');
const overlay = document.getElementById('overlay');

function openEditSheet(spot) {
    currentEditingId = spot.id;
    
    // フォームに現在の値を入れる
    document.getElementById('edit-title').value = spot.title;
    document.getElementById('edit-duration').value = spot.duration;
    document.getElementById('sheet-cost').textContent = `概算: 約 ${spot.estimated.toLocaleString()} 円`;
    document.getElementById('edit-memo').value = spot.memo || "";
    selectColor(spot.color || colors[0]);
    
    bottomSheet.classList.add('show');
    overlay.classList.add('show');
}

function closeSheet() {
    bottomSheet.classList.remove('show');
    overlay.classList.remove('show');
    currentEditingId = null;
}

// --- 保存処理（直接編集を反映） ---
document.getElementById('save-spot-btn').addEventListener('click', () => {
    const spotIndex = itineraryData.findIndex(s => s.id === currentEditingId);
    if (spotIndex > -1) {
        // 入力された値で更新
        itineraryData[spotIndex].title = document.getElementById('edit-title').value;
        itineraryData[spotIndex].duration = parseFloat(document.getElementById('edit-duration').value);
        itineraryData[spotIndex].memo = document.getElementById('edit-memo').value;
        itineraryData[spotIndex].color = document.querySelector('.color-circle.selected').dataset.color;
        
        saveData();
        renderItinerary();
        closeSheet();
    }
});

// 削除処理
document.getElementById('delete-spot-btn').addEventListener('click', () => {
    if(confirm('この予定を削除しますか？')){
        itineraryData = itineraryData.filter(s => s.id !== currentEditingId);
        saveData();
        renderItinerary();
        closeSheet();
    }
});

document.getElementById('close-sheet').addEventListener('click', closeSheet);
overlay.addEventListener('click', closeSheet);

function saveData() {
    localStorage.setItem('itinerary', JSON.stringify(itineraryData));
}

// --- 同期ボタンのモック処理 ---
document.getElementById('sync-btn').addEventListener('click', () => {
    const btn = document.getElementById('sync-btn');
    btn.textContent = "⏳ 同期中...";
    btn.style.backgroundColor = "#ff9800";
    
    // 1秒後に完了したふりをする
    setTimeout(() => {
        btn.textContent = "✅ 最新の状態";
        btn.style.backgroundColor = "#4caf50";
        setTimeout(() => { btn.textContent = "🔄 更新を共有"; }, 3000);
        alert("※現在の実装ではブラウザ内に保存されました。\n実際に他の人と共有するにはFirebase等のデータベース連携が必要です。");
    }, 1000);
});

renderItinerary();