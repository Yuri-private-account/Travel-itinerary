// --- 1. カラーパレット ---
const colors = [
    "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", 
    "#bdb2ff", "#ffc6ff", "#fffffc", "#ffb4a2", "#e5989b", "#b5838d",
    "#fcd5ce", "#f8edeb", "#f0efeb", "#dcd2c6", "#c5dedd", "#a2d2ff"
];

// --- 2. データの初期化 ---
// しおりのデータはFirebaseから降ってくるのを待つため、初期値は空
let itineraryData = [];
// カスタムスポット（地図上のピン）は端末ごとにローカル保存
let customMapSpots = JSON.parse(localStorage.getItem('customMapSpots')) || [];
let currentEditingId = null; 

// --- 3. 事前登録スポット ---
const predefinedSpots = [
    { title: "海遊館", lat: 34.6441, lng: 135.4323, estimated: 4500, duration: 2.5 },
    { title: "大阪城", lat: 34.6873, lng: 135.5262, estimated: 1500, duration: 1.5 },
    { title: "道頓堀 (グリコサイン)", lat: 34.6687, lng: 135.5013, estimated: 3000, duration: 2.0 },
    { title: "ユニバーサル・スタジオ・ジャパン", lat: 34.6654, lng: 135.4323, estimated: 12000, duration: 8.0 }
];

// --- 4. UI初期化 ---
const listElement = document.getElementById('itinerary-list');
const colorPicker = document.getElementById('color-picker');

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

// --- 5. Leaflet地図の制御 ---
const map = L.map('map').setView([34.6687, 135.5013], 12);

// タイルサーバーをOSM日本語版に変更
L.tileLayer('https://{s}.tile.openstreetmap.jp/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);

// --- app.js 76行目付近 ---

function renderMapMarkers() {
    markersLayer.clearLayers();
    const allSpots = [...predefinedSpots, ...customMapSpots];

    allSpots.forEach(spot => {
        const marker = L.marker([spot.lat, spot.lng]);
        const popupContent = document.createElement('div');
        
        // 正しいGoogleマップ検索URLの形式
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

        popupContent.innerHTML = `
            <p class="popup-title">${spot.title}</p>
            <button class="popup-btn add-btn">📍 しおりに追加</button>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn" style="display:block; text-align:center; text-decoration:none; background:#34a853; margin-top:8px; color:white;">🗺️ Googleマップで見る</a>
        `;
        
        popupContent.querySelector('.add-btn').addEventListener('click', () => {
            addSpotToItinerary(spot);
            map.closePopup();
        });

        marker.bindPopup(popupContent);
        markersLayer.addLayer(marker);
    });
}

// 地図タップでカスタムスポット追加
map.on('click', function(e) {
    const spotName = prompt("📍 この場所に新しいスポットを登録しますか？\n名前を入力してください:");
    if (spotName && spotName.trim() !== "") {
        const newCustomSpot = {
            title: spotName,
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            estimated: 2000,
            duration: 1.0
        };
        customMapSpots.push(newCustomSpot);
        localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
        renderMapMarkers();
    }
});

renderMapMarkers();

// 地図の描画崩れ対策
setTimeout(() => { map.invalidateSize(); }, 100);

// --- 現在地取得機能 ---
const locateBtn = document.getElementById('locate-btn');
let userMarker = null;

if (locateBtn) {
    locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("お使いのブラウザは位置情報に対応していません。");
            return;
        }

        locateBtn.textContent = "⌛ 取得中...";
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const latlng = [latitude, longitude];

                map.setView(latlng, 15);
                if (userMarker) map.removeLayer(userMarker);

                userMarker = L.circleMarker(latlng, {
                    radius: 8, fillColor: "#007bff", color: "#fff",
                    weight: 2, opacity: 1, fillOpacity: 0.8
                }).addTo(map).bindPopup("あなたは今ここにいます").openPopup();

                locateBtn.textContent = "📍 現在地を表示";
            },
            (error) => {
                console.error(error);
                alert("位置情報の取得に失敗しました。");
                locateBtn.textContent = "📍 現在地を表示";
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
}

// --- 6. しおりのデータ操作・UI処理 ---

function addSpotToItinerary(spotInfo) {
    const newBlock = {
        id: Date.now().toString(),
        title: spotInfo.title,
        duration: spotInfo.duration,
        estimated: spotInfo.estimated,
        memo: "",
        color: colors[Math.floor(Math.random() * colors.length)]
    };

    if (window.fbDB) {
        // トランザクション：サーバーの最新配列を取得し、末尾に追加して返す
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            let data = currentData || [];
            data.push(newBlock);
            return data;
        });
    } else {
        // オフライン時のフォールバック
        itineraryData.push(newBlock);
        saveData();
    }
}

function renderItinerary() {
    listElement.innerHTML = '';
    itineraryData.forEach(spot => {
        const li = document.createElement('li');
        li.className = 'spot-block';
        li.dataset.id = spot.id;
        li.style.backgroundColor = spot.color || "#ffffff";
        
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

        li.querySelector('.edit-btn').addEventListener('click', () => openEditSheet(spot));
        listElement.appendChild(li);
    });
}

// 並び替え
new Sortable(listElement, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
        const movedItem = itineraryData.splice(evt.oldIndex, 1)[0];
        itineraryData.splice(evt.newIndex, 0, movedItem);
        saveData(); // Firebaseへ自動同期
    }
});

const bottomSheet = document.getElementById('bottom-sheet');
const overlay = document.getElementById('overlay');

function openEditSheet(spot) {
    currentEditingId = spot.id;
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

document.getElementById('save-spot-btn').addEventListener('click', () => {
    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            if (!currentData) return [];
            // 最新データの中から編集中のIDを探して更新
            const spotIndex = currentData.findIndex(s => s.id === currentEditingId);
            if (spotIndex > -1) {
                currentData[spotIndex].title = document.getElementById('edit-title').value;
                currentData[spotIndex].duration = parseFloat(document.getElementById('edit-duration').value);
                currentData[spotIndex].memo = document.getElementById('edit-memo').value;
                currentData[spotIndex].color = document.querySelector('.color-circle.selected').dataset.color;
            }
            return currentData; // 更新した配列をサーバーに返す
        });
        closeSheet();
    }
});

document.getElementById('delete-spot-btn').addEventListener('click', () => {
    if(confirm('この予定を削除しますか？')){
        if (window.fbDB) {
            window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
                if (!currentData) return [];
                // 削除対象のID「以外」を残した新しい配列をサーバーに返す
                return currentData.filter(s => s.id !== currentEditingId);
            });
        }
        closeSheet();
    }
});

document.getElementById('close-sheet').addEventListener('click', closeSheet);
overlay.addEventListener('click', closeSheet);

// --- 7. Firebase リアルタイム同期処理 ---

// index.htmlの認証が完了した直後に呼ばれる
window.startDatabaseSync = () => {
    if (!window.fbDB) return;
    const itineraryRef = window.fbRef(window.fbDB, 'itinerary');
    
    // データが変更されるたびに自動で降ってくる
    window.fbOnValue(itineraryRef, (snapshot) => {
        const data = snapshot.val();
        itineraryData = data ? Object.values(data) : [];
        renderItinerary(); // 再描画
    });
};

function saveData() {
    // ローカルにもバックアップ
    localStorage.setItem('itinerary', JSON.stringify(itineraryData));

    // Firebaseへ保存（これが他の画面へリアルタイムで反映されるトリガーになります）
    if (window.fbDB) {
        const itineraryRef = window.fbRef(window.fbDB, 'itinerary');
        window.fbSet(itineraryRef, itineraryData);
    }
}

// 同期ボタンの挙動調整（自動同期化されたのでステータス表示として使う）
const syncBtn = document.getElementById('sync-btn');
if (syncBtn) {
    syncBtn.addEventListener('click', () => {
        syncBtn.textContent = "✅ 最新の状態です";
        setTimeout(() => { syncBtn.textContent = "🔄 リアルタイム同期中"; }, 3000);
    });
}

// --- 8. Google Places 検索機能 ---
const searchInput = document.getElementById('pac-input');

// Leafletが検索窓のクリックや入力を奪わないように「伝搬」を停止させる
// これをしないと、入力のたびに地図が反応してフリーズすることがあります
L.DomEvent.disableClickPropagation(searchInput);
L.DomEvent.disableScrollPropagation(searchInput);

if (typeof google !== 'undefined') {
    // 候補リストが地図コンテナの中に閉じ込められないよう、オプションは最小限に
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'jp' } // 日本国内に限定（安定化のため）
    });

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        
        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const spotName = place.name;

        // 地図を移動
        map.setView([lat, lng], 15);

        // フリーズ対策：以前提案したLeafletポップアップ方式を採用
        const tempMarker = L.marker([lat, lng]).addTo(map);
        const popupDiv = document.createElement('div');
        popupDiv.innerHTML = `
            <p style="font-weight:bold; margin-bottom:5px;">${spotName}</p>
            <button id="confirm-add-btn" class="popup-btn">📍 この場所を登録</button>
        `;
        tempMarker.bindPopup(popupDiv).openPopup();

        popupDiv.querySelector('#confirm-add-btn').addEventListener('click', () => {
            const newCustomSpot = {
                title: spotName,
                lat: lat,
                lng: lng,
                estimated: 2000,
                duration: 1.0
            };
            customMapSpots.push(newCustomSpot);
            localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
            renderMapMarkers();
            map.removeLayer(tempMarker);
            searchInput.value = ''; 
        });
    });
}
