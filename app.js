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
    const allSpots = [...predefinedSpots, ...customMapSpots];

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

function parseTimeToMinutes(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTimeString(totalMinutes) {
    let value = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(value / 60);
    const m = value % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculateEndTime(startTime, durationHours) {
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes === null) return '--:--';
    return minutesToTimeString(startMinutes + Math.round(Number(durationHours || 0) * 60));
}

function sumCostList(list = []) {
    return list.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function calculateSpotTotal(spot) {
    return Number(spot.entryFee || 0) + sumCostList(spot.items) + sumCostList(spot.foods);
}

function getDefaultStartTime() {
    if (!itineraryData.length) return '09:00';
    const lastSpot = itineraryData[itineraryData.length - 1];
    const lastEnd = calculateEndTime(lastSpot.startTime || '09:00', lastSpot.duration || 1);
    return lastEnd === '--:--' ? '09:00' : lastEnd;
}

function renderTotalSummary() {
    const totalSummaryEl = document.getElementById('total-summary');
    if (!totalSummaryEl) return;

    const grandTotal = itineraryData.reduce((sum, spot) => sum + calculateSpotTotal(spot), 0);
    totalSummaryEl.textContent = `合計金額: ${grandTotal.toLocaleString()} 円`;
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
        duration: spotInfo.duration || 1.0,
        estimated: spotInfo.estimated || 0,
        memo: "",
        color: colors[Math.floor(Math.random() * colors.length)],
        startTime: getDefaultStartTime(),
        entryFee: 0,
        items: [],
        foods: []
    };

    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            let data = currentData || [];
            data.push(newBlock);
            return data;
        }).then(() => {
            openEditSheet(newBlock);
        }).catch((error) => {
            console.error(error);
            alert("しおりの追加に失敗しました。");
        });
    } else {
        itineraryData.push(newBlock);
        saveData();
        openEditSheet(newBlock);
    }
}

function renderItinerary() {
    listElement.innerHTML = '';

    itineraryData.forEach(spot => {
        const li = document.createElement('li');
        li.className = 'spot-block';
        li.dataset.id = spot.id;

        const blockHeight = Math.max(70, Number(spot.duration || 1) * 60);
        const startTime = spot.startTime || '--:--';
        const endTime = calculateEndTime(startTime, spot.duration);
        const totalCost = calculateSpotTotal(spot);

        li.innerHTML = `
            <div class="time-row">
                <span class="time-label">${startTime}</span>
                <span class="time-line"></span>
            </div>

            <div class="spot-main" style="background-color: ${spot.color || "#ffffff"}; height: ${blockHeight}px;">
                <div class="drag-handle">≡</div>
                <div class="spot-info">
                    <h3>${spot.title}</h3>
                    <p>予定: ${spot.duration}h</p>
                    <p>費用合計: 約 ${totalCost.toLocaleString()} 円</p>
                </div>
                <button class="edit-btn">編集</button>
            </div>

            <div class="time-row">
                <span class="time-label">${endTime}</span>
                <span class="time-line"></span>
            </div>
        `;

        li.querySelector('.edit-btn').addEventListener('click', () => openEditSheet(spot));
        listElement.appendChild(li);
    });

    renderTotalSummary();
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
const startTimeInput = document.getElementById('edit-start-time');
const entryFeeInput = document.getElementById('edit-entry-fee');
const itemsListEl = document.getElementById('items-list');
const foodsListEl = document.getElementById('foods-list');
const sheetCostEl = document.getElementById('sheet-cost');
const sheetCostDetailEl = document.getElementById('sheet-cost-detail');

function addCostRow(container, entry = { name: '', price: '' }, placeholder = '項目名') {
    const row = document.createElement('div');
    row.className = 'cost-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cost-name form-input';
    nameInput.placeholder = placeholder;
    nameInput.value = entry.name || '';

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'cost-price form-input';
    priceInput.placeholder = '0';
    priceInput.min = '0';
    priceInput.step = '1';
    priceInput.value = entry.price ?? '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-cost-btn';
    removeBtn.textContent = '削除';

    removeBtn.addEventListener('click', () => {
        row.remove();
        updateSheetCostPreview();
    });

    nameInput.addEventListener('input', updateSheetCostPreview);
    priceInput.addEventListener('input', updateSheetCostPreview);

    row.appendChild(nameInput);
    row.appendChild(priceInput);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function fillCostRows(container, entries, placeholder) {
    container.innerHTML = '';
    (entries || []).forEach(entry => addCostRow(container, entry, placeholder));
}

function collectCostRows(container) {
    return Array.from(container.querySelectorAll('.cost-row'))
        .map(row => {
            const name = row.querySelector('.cost-name').value.trim();
            const rawPrice = row.querySelector('.cost-price').value;
            const price = rawPrice === '' ? 0 : Number(rawPrice);

            if (!name && !price) return null;

            return {
                name: name || '名称未設定',
                price: Number.isFinite(price) ? price : 0
            };
        })
        .filter(Boolean);
}

function readEditorData() {
    return {
        title: document.getElementById('edit-title').value.trim() || '名称未設定',
        startTime: startTimeInput.value || '09:00',
        duration: parseFloat(document.getElementById('edit-duration').value) || 1,
        entryFee: Number(entryFeeInput.value || 0),
        items: collectCostRows(itemsListEl),
        foods: collectCostRows(foodsListEl),
        memo: document.getElementById('edit-memo').value,
        color: document.querySelector('.color-circle.selected')?.dataset.color || colors[0]
    };
}

function updateSheetCostPreview() {
    const entryFee = Number(entryFeeInput.value || 0);
    const items = collectCostRows(itemsListEl);
    const foods = collectCostRows(foodsListEl);

    const itemsTotal = sumCostList(items);
    const foodsTotal = sumCostList(foods);
    const total = entryFee + itemsTotal + foodsTotal;

    sheetCostEl.textContent = `合計: ${total.toLocaleString()} 円`;
    sheetCostDetailEl.textContent =
        `入場料 ${entryFee.toLocaleString()} 円 / アイテム ${itemsTotal.toLocaleString()} 円 / 食べ物 ${foodsTotal.toLocaleString()} 円`;
}

document.getElementById('add-item-btn').addEventListener('click', () => {
    addCostRow(itemsListEl, { name: '', price: '' }, 'アイテム名');
});

document.getElementById('add-food-btn').addEventListener('click', () => {
    addCostRow(foodsListEl, { name: '', price: '' }, '食べ物名');
});

startTimeInput.addEventListener('input', updateSheetCostPreview);
entryFeeInput.addEventListener('input', updateSheetCostPreview);
document.getElementById('edit-duration').addEventListener('input', updateSheetCostPreview);

function openEditSheet(spot) {
    currentEditingId = spot.id;
    document.getElementById('edit-title').value = spot.title || '';
    document.getElementById('edit-start-time').value = spot.startTime || '09:00';
    document.getElementById('edit-duration').value = spot.duration || 1;
    document.getElementById('edit-entry-fee').value = spot.entryFee || 0;
    document.getElementById('edit-memo').value = spot.memo || '';

    fillCostRows(itemsListEl, spot.items || [], 'アイテム名');
    fillCostRows(foodsListEl, spot.foods || [], '食べ物名');

    selectColor(spot.color || colors[0]);
    updateSheetCostPreview();

    bottomSheet.classList.add('show');
    overlay.classList.add('show');
}

function closeSheet() {
    bottomSheet.classList.remove('show');
    overlay.classList.remove('show');
    currentEditingId = null;
}

document.getElementById('save-spot-btn').addEventListener('click', () => {
    const editorData = readEditorData();

    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            if (!currentData) return [];
            const spotIndex = currentData.findIndex(s => s.id === currentEditingId);
            if (spotIndex > -1) {
                currentData[spotIndex] = {
                    ...currentData[spotIndex],
                    ...editorData
                };
            }
            return currentData;
        });
        closeSheet();
    } else {
        const spotIndex = itineraryData.findIndex(s => s.id === currentEditingId);
        if (spotIndex > -1) {
            itineraryData[spotIndex] = {
                ...itineraryData[spotIndex],
                ...editorData
            };
            saveData();
            renderItinerary();
        }
        closeSheet();
    }
});

document.getElementById('delete-spot-btn').addEventListener('click', () => {
    if (confirm('この予定を削除しますか？')) {
        if (window.fbDB) {
            window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
                if (!currentData) return [];
                return currentData.filter(s => s.id !== currentEditingId);
            });
        } else {
            itineraryData = itineraryData.filter(s => s.id !== currentEditingId);
            saveData();
            renderItinerary();
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
