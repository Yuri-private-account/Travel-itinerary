// --- 1. カラーパレット ---
const colors = [
    "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", 
    "#bdb2ff", "#ffc6ff", "#fffffc", "#ffb4a2", "#e5989b", "#b5838d",
    "#fcd5ce", "#f8edeb", "#f0efeb", "#dcd2c6", "#c5dedd", "#a2d2ff"
];

// --- 2. データの初期化 ---
let itineraryData = [];

// カスタムスポットはローカル + Firebase同期の両対応
let customMapSpots = JSON.parse(localStorage.getItem('customMapSpots')) || [];
let currentEditingId = null; 

// --- 3. 事前登録スポット ---
//const predefinedSpots = [
//    { title: "海遊館", lat: 34.6441, lng: 135.4323, estimated: 4500, duration: 2.5 },
//    { title: "大阪城", lat: 34.6873, lng: 135.5262, estimated: 1500, duration: 1.5 },
//    { title: "道頓堀 (グリコサイン)", lat: 34.6687, lng: 135.5013, estimated: 3000, duration: 2.0 },
//    { title: "ユニバーサル・スタジオ・ジャパン", lat: 34.6654, lng: 135.4323, estimated: 12000, duration: 8.0 }
//];

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

function buildGoogleMapsUrl(spot) {
    const queryText =
        spot.address
            ? `${spot.title}, ${spot.address}`
            : spot.title
                ? spot.title
                : `${spot.lat},${spot.lng}`;

    const query = encodeURIComponent(queryText);

    if (spot.placeId) {
        return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(spot.placeId)}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function saveCustomSpot(spot) {
    if (!spot.id) {
        spot.id = Date.now().toString();
    }
    spot.isCustom = true;

    if (window.fbDB) {
        // mapSpots/{id} に保存
        const spotRef = window.fbRef(window.fbDB, `mapSpots/${spot.id}`);
        window.fbSet(spotRef, spot);
    } else {
        customMapSpots.push(spot);
        localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
        renderMapMarkers();
    }
}

function deleteCustomSpot(spotId) {
    if (window.fbDB) {
        const spotRef = window.fbRef(window.fbDB, `mapSpots/${spotId}`);
        window.fbSet(spotRef, null);
    } else {
        customMapSpots = customMapSpots.filter(s => s.id !== spotId);
        localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
        renderMapMarkers();
    }
}

function renderMapMarkers() {
    markersLayer.clearLayers();
    const allSpots = [..., ...customMapSpots];

    allSpots.forEach(spot => {
        const marker = L.marker([spot.lat, spot.lng]);
        const popupContent = document.createElement('div');

        const googleMapsUrl = buildGoogleMapsUrl(spot);
        const deleteButtonHtml = spot.isCustom
            ? `<button class="popup-btn delete-btn" style="background:#d9534f; margin-top:8px;">🗑️ このスポットを削除</button>`
            : '';

        popupContent.innerHTML = `
            <p class="popup-title">${spot.title}</p>
            <button class="popup-btn add-btn">📍 しおりに追加</button>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn" style="display:block; text-align:center; text-decoration:none; background:#34a853; margin-top:8px; color:white;">🗺️ Googleマップで見る</a>
            ${deleteButtonHtml}
        `;

        popupContent.querySelector('.add-btn').addEventListener('click', () => {
            addSpotToItinerary(spot);
            map.closePopup();
        });

        if (spot.isCustom) {
            popupContent.querySelector('.delete-btn').addEventListener('click', () => {
                if (confirm(`「${spot.title}」を削除しますか？`)) {
                    deleteCustomSpot(spot.id);
                    map.closePopup();
                }
            });
        }

        marker.bindPopup(popupContent);
        markersLayer.addLayer(marker);
    });
}

// 地図タップでカスタムスポット追加
map.on('click', function(e) {
    if (typeof isSearching !== 'undefined' && isSearching) return;

    const spotName = prompt("📍 この場所に新しいスポットを登録しますか？\n名前を入力してください:");
    if (spotName && spotName.trim() !== "") {
        const newCustomSpot = {
            id: Date.now().toString(),
            title: spotName.trim(),
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            estimated: 2000,
            duration: 1.0,
            address: "",
            placeId: "",
            isCustom: true
        };

        saveCustomSpot(newCustomSpot);
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
    window.fbOnValue(itineraryRef, (snapshot) => {
        const data = snapshot.val();
        itineraryData = data ? Object.values(data) : [];
        renderItinerary();
    });

    const mapSpotsRef = window.fbRef(window.fbDB, 'mapSpots');
    window.fbOnValue(mapSpotsRef, (snapshot) => {
        const data = snapshot.val();
        customMapSpots = data ? Object.values(data) : [];
        localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
        renderMapMarkers();
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
let isSearching = false;

function setMapInteraction(enabled) {
    const action = enabled ? 'enable' : 'disable';
    if (map.dragging && map.dragging[action]) map.dragging[action]();
    if (map.touchZoom && map.touchZoom[action]) map.touchZoom[action]();
    if (map.doubleClickZoom && map.doubleClickZoom[action]) map.doubleClickZoom[action]();
    if (map.scrollWheelZoom && map.scrollWheelZoom[action]) map.scrollWheelZoom[action]();
    if (map.boxZoom && map.boxZoom[action]) map.boxZoom[action]();
    if (map.keyboard && map.keyboard[action]) map.keyboard[action]();
}

function stopInputPropagation(el) {
    const events = [
        'click', 'dblclick', 'mousedown', 'mouseup',
        'touchstart', 'touchend', 'pointerdown', 'pointerup',
        'keydown', 'keyup', 'keypress'
    ];

    events.forEach(type => {
        el.addEventListener(type, (e) => e.stopPropagation());
    });

    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
}

if (searchInput && window.google?.maps?.places) {
    stopInputPropagation(searchInput);

    searchInput.addEventListener('focus', () => {
        isSearching = true;
        setMapInteraction(false);
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            isSearching = false;
            setMapInteraction(true);
        }, 150);
    });

    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'jp' },
        fields: ['place_id', 'geometry', 'name']
    });

    const placesService = new google.maps.places.PlacesService(document.createElement('div'));

    autocomplete.addListener('place_changed', () => {
        const basicPlace = autocomplete.getPlace();

        if (!basicPlace.geometry || !basicPlace.geometry.location) return;

        const lat = basicPlace.geometry.location.lat();
        const lng = basicPlace.geometry.location.lng();

        const openPopupWithPlace = (place) => {
            const spotName = place.name || basicPlace.name || searchInput.value;
            const address = place.formatted_address || "";
            const placeId = place.place_id || basicPlace.place_id || "";

            map.setView([lat, lng], 15);

            const tempMarker = L.marker([lat, lng]).addTo(map);
            const popupDiv = document.createElement('div');

            popupDiv.innerHTML = `
                <p style="font-weight:bold; margin-bottom:5px;">${spotName}</p>
                ${address ? `<p style="font-size:12px; color:#555; margin-bottom:8px;">${address}</p>` : ''}
                <button id="confirm-add-btn" class="popup-btn">📍 この場所を登録</button>
            `;

            tempMarker.bindPopup(popupDiv).openPopup();

            popupDiv.querySelector('#confirm-add-btn').addEventListener('click', () => {
                const newCustomSpot = {
                    id: Date.now().toString(),
                    title: spotName,
                    lat: lat,
                    lng: lng,
                    estimated: 2000,
                    duration: 1.0,
                    address: address,
                    placeId: placeId,
                    isCustom: true
                };

                saveCustomSpot(newCustomSpot);
                map.removeLayer(tempMarker);
                searchInput.value = '';
            });
        };

        if (basicPlace.place_id) {
            placesService.getDetails({
                placeId: basicPlace.place_id,
                fields: ['name', 'formatted_address', 'place_id', 'geometry']
            }, (detailPlace, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && detailPlace) {
                    openPopupWithPlace(detailPlace);
                } else {
                    openPopupWithPlace(basicPlace);
                }
            });
        } else {
            openPopupWithPlace(basicPlace);
        }
    });
}
