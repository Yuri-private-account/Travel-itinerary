// --- 1. カラーパレット ---
const colors = [
    "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff",
    "#bdb2ff", "#ffc6ff", "#fffffc", "#ffb4a2", "#e5989b", "#b5838d",
    "#fcd5ce", "#f8edeb", "#f0efeb", "#dcd2c6", "#c5dedd", "#a2d2ff"
];

// --- 2. データの初期化 ---
const DEFAULT_DAY = { key: 'day-1', label: '1日目' };
const predefinedSpots = [];

let itineraryData = [];
let dayTabs = JSON.parse(localStorage.getItem('dayTabs')) || [DEFAULT_DAY];
let activeDayKey = localStorage.getItem('activeDayKey') || dayTabs[0]?.key || DEFAULT_DAY.key;
let customMapSpots = JSON.parse(localStorage.getItem('customMapSpots')) || [];
let currentEditingId = null;

let syncedItineraryRaw = null;
let syncedDaysRaw = null;

// --- 3. UI初期化 ---
const listElement = document.getElementById('itinerary-list');
const colorPicker = document.getElementById('color-picker');
const dayTabsElement = document.getElementById('day-tabs');
const totalSummaryEl = document.getElementById('total-summary');
const editDaySelect = document.getElementById('edit-day');
const addManualBtn = document.getElementById('add-manual-btn');
const addDayBtn = document.getElementById('add-day-btn');

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
    const target = document.querySelector(`.color-circle[data-color="${color}"]`);
    if (target) target.classList.add('selected');
}

function normalizeDayTabs(rawDays = [], spots = []) {
    const normalized = [];
    const usedKeys = new Set();

    (Array.isArray(rawDays) ? rawDays : Object.values(rawDays || {})).forEach((day, index) => {
        const key = day?.key || `day-${index + 1}`;
        if (usedKeys.has(key)) return;
        usedKeys.add(key);
        normalized.push({
            key,
            label: day?.label?.trim() || `${normalized.length + 1}日目`
        });
    });

    if (!normalized.length) {
        normalized.push({ ...DEFAULT_DAY });
        usedKeys.add(DEFAULT_DAY.key);
    }

    (Array.isArray(spots) ? spots : []).forEach(spot => {
        const dayKey = spot?.dayKey;
        if (!dayKey || usedKeys.has(dayKey)) return;
        usedKeys.add(dayKey);
        normalized.push({ key: dayKey, label: `${normalized.length + 1}日目` });
    });

    return normalized;
}

function normalizeItinerary(rawItinerary = [], normalizedDays = dayTabs) {
    const safeDays = normalizedDays.length ? normalizedDays : [{ ...DEFAULT_DAY }];
    const fallbackDayKey = safeDays[0].key;
    const validDayKeys = new Set(safeDays.map(day => day.key));

    return (Array.isArray(rawItinerary) ? rawItinerary : Object.values(rawItinerary || {})).map((spot, index) => ({
        id: spot?.id || `${Date.now()}-${index}`,
        title: spot?.title || '名称未設定',
        duration: Number(spot?.duration || 1),
        estimated: Number(spot?.estimated || 0),
        memo: spot?.memo || '',
        color: spot?.color || colors[index % colors.length],
        startTime: spot?.startTime || '09:00',
        entryFee: Number(spot?.entryFee || 0),
        items: Array.isArray(spot?.items) ? spot.items : [],
        foods: Array.isArray(spot?.foods) ? spot.foods : [],
        dayKey: validDayKeys.has(spot?.dayKey) ? spot.dayKey : fallbackDayKey
    }));
}

function setDayState(days, spots) {
    dayTabs = normalizeDayTabs(days, spots);
    itineraryData = normalizeItinerary(spots, dayTabs);

    if (!dayTabs.some(day => day.key === activeDayKey)) {
        activeDayKey = dayTabs[0].key;
    }

    persistDayLocalState();
    renderDayTabs();
    renderItinerary();
}

function getSpotsForDay(dayKey = activeDayKey) {
    return itineraryData.filter(spot => spot.dayKey === dayKey);
}

function getDefaultStartTime(dayKey = activeDayKey) {
    const daySpots = getSpotsForDay(dayKey);
    if (!daySpots.length) return '09:00';

    const lastSpot = daySpots[daySpots.length - 1];
    const lastEnd = calculateEndTime(lastSpot.startTime || '09:00', lastSpot.duration || 1);
    return lastEnd === '--:--' ? '09:00' : lastEnd;
}

function renderDayTabs() {
    if (!dayTabsElement) return;

    dayTabsElement.innerHTML = '';

    dayTabs.forEach(day => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `day-tab${day.key === activeDayKey ? ' active' : ''}`;
        btn.textContent = day.label;
        btn.addEventListener('click', () => {
            activeDayKey = day.key;
            persistDayLocalState();
            renderDayTabs();
            renderItinerary();
        });
        dayTabsElement.appendChild(btn);
    });

    populateDaySelect();
}

function populateDaySelect() {
    if (!editDaySelect) return;

    editDaySelect.innerHTML = '';
    dayTabs.forEach(day => {
        const option = document.createElement('option');
        option.value = day.key;
        option.textContent = day.label;
        editDaySelect.appendChild(option);
    });
}

function persistDayLocalState() {
    localStorage.setItem('dayTabs', JSON.stringify(dayTabs));
    localStorage.setItem('activeDayKey', activeDayKey);
}

function addNewDay() {
    const nextNumber = dayTabs.length + 1;
    const input = prompt('追加する日の名前を入力してください。', `${nextNumber}日目`);
    if (input === null) return;

    const label = input.trim() || `${nextNumber}日目`;
    const newDay = {
        key: `day-${Date.now()}`,
        label
    };

    dayTabs = [...dayTabs, newDay];
    activeDayKey = newDay.key;
    saveDays();
    renderDayTabs();
    renderItinerary();
}

if (addDayBtn) {
    addDayBtn.addEventListener('click', addNewDay);
}

if (addManualBtn) {
    addManualBtn.addEventListener('click', () => addManualBlock());
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTimeString(totalMinutes) {
    const value = ((totalMinutes % 1440) + 1440) % 1440;
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

function renderTotalSummary() {
    if (!totalSummaryEl) return;

    const currentDayTotal = getSpotsForDay(activeDayKey).reduce((sum, spot) => sum + calculateSpotTotal(spot), 0);
    const grandTotal = itineraryData.reduce((sum, spot) => sum + calculateSpotTotal(spot), 0);
    totalSummaryEl.textContent = `この日の合計金額: ${currentDayTotal.toLocaleString()} 円 / 旅行全体: ${grandTotal.toLocaleString()} 円`;
}

// --- 4. Leaflet地図の制御 ---
const map = L.map('map').setView([34.6687, 135.5013], 12);

L.tileLayer('https://tile.openstreetmap.jp/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

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
setTimeout(() => { map.invalidateSize(); }, 100);

// --- 5. 現在地取得機能 ---
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
                    radius: 8,
                    fillColor: "#007bff",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
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
function createBaseBlock(partial = {}) {
    const targetDayKey = partial.dayKey || activeDayKey;
    return {
        id: Date.now().toString(),
        title: partial.title || '新しい予定',
        duration: Number(partial.duration || 1.0),
        estimated: Number(partial.estimated || 0),
        memo: partial.memo || '',
        color: partial.color || colors[Math.floor(Math.random() * colors.length)],
        startTime: partial.startTime || getDefaultStartTime(targetDayKey),
        entryFee: Number(partial.entryFee || 0),
        items: Array.isArray(partial.items) ? partial.items : [],
        foods: Array.isArray(partial.foods) ? partial.foods : [],
        dayKey: targetDayKey
    };
}

function addSpotToItinerary(spotInfo = {}) {
    const newBlock = createBaseBlock({
        title: spotInfo.title,
        duration: spotInfo.duration,
        estimated: spotInfo.estimated
    });

    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            const data = Array.isArray(currentData) ? currentData : Object.values(currentData || {});
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

function addManualBlock() {
    const newBlock = createBaseBlock({ title: '新しい予定' });

    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            const data = Array.isArray(currentData) ? currentData : Object.values(currentData || {});
            data.push(newBlock);
            return data;
        }).then(() => {
            openEditSheet(newBlock);
        }).catch((error) => {
            console.error(error);
            alert("手動の予定追加に失敗しました。");
        });
    } else {
        itineraryData.push(newBlock);
        saveData();
        openEditSheet(newBlock);
    }
}

function renderItinerary() {
    listElement.innerHTML = '';

    const currentSpots = getSpotsForDay(activeDayKey);

    if (!currentSpots.length) {
        const emptyEl = document.createElement('li');
        emptyEl.className = 'empty-state';
        emptyEl.innerHTML = 'この日はまだ予定がありません。<br>「＋ ブロック追加」または地図のスポット追加から登録できます。';
        listElement.appendChild(emptyEl);
        renderTotalSummary();
        return;
    }

    currentSpots.forEach(spot => {
        const li = document.createElement('li');
        li.className = 'spot-block';
        li.dataset.id = spot.id;

        const blockHeight = Math.max(70, Number(spot.duration || 1) * 60);
        const startTime = spot.startTime || '--:--';
        const endTime = calculateEndTime(startTime, spot.duration);
        const totalCost = calculateSpotTotal(spot);
        const currentDayLabel = dayTabs.find(day => day.key === spot.dayKey)?.label || '';

        li.innerHTML = `
            <div class="time-row">
                <span class="time-label">${startTime}</span>
                <span class="time-line"></span>
            </div>

            <div class="spot-main" style="background-color: ${spot.color || "#ffffff"}; height: ${blockHeight}px;">
                <div class="drag-handle">≡</div>
                <div class="spot-info">
                    <h3>${spot.title}</h3>
                    <p>${currentDayLabel}</p>
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

new Sortable(listElement, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
        const currentSpots = getSpotsForDay(activeDayKey);
        if (!currentSpots.length) return;

        const reordered = [...currentSpots];
        const movedItem = reordered.splice(evt.oldIndex, 1)[0];
        reordered.splice(evt.newIndex, 0, movedItem);

        let activePointer = 0;
        itineraryData = itineraryData.map(spot => {
            if (spot.dayKey !== activeDayKey) return spot;
            return reordered[activePointer++];
        });

        saveData();
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
        dayKey: editDaySelect.value || activeDayKey,
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
    populateDaySelect();

    document.getElementById('edit-title').value = spot.title || '';
    editDaySelect.value = spot.dayKey || activeDayKey;
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
    activeDayKey = editorData.dayKey;

    if (window.fbDB) {
        window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
            const safeData = Array.isArray(currentData) ? currentData : Object.values(currentData || {});
            const spotIndex = safeData.findIndex(s => s.id === currentEditingId);
            if (spotIndex > -1) {
                safeData[spotIndex] = {
                    ...safeData[spotIndex],
                    ...editorData
                };
            }
            return safeData;
        }).then(() => {
            persistDayLocalState();
            renderDayTabs();
            closeSheet();
        });
    } else {
        const spotIndex = itineraryData.findIndex(s => s.id === currentEditingId);
        if (spotIndex > -1) {
            itineraryData[spotIndex] = {
                ...itineraryData[spotIndex],
                ...editorData
            };
            saveData();
            renderDayTabs();
            renderItinerary();
        }
        closeSheet();
    }
});

document.getElementById('delete-spot-btn').addEventListener('click', () => {
    if (confirm('この予定を削除しますか？')) {
        if (window.fbDB) {
            window.fbRunTransaction(window.fbRef(window.fbDB, 'itinerary'), (currentData) => {
                const safeData = Array.isArray(currentData) ? currentData : Object.values(currentData || {});
                return safeData.filter(s => s.id !== currentEditingId);
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
window.startDatabaseSync = () => {
    if (!window.fbDB) return;

    const itineraryRef = window.fbRef(window.fbDB, 'itinerary');
    window.fbOnValue(itineraryRef, (snapshot) => {
        syncedItineraryRaw = snapshot.val();
        setDayState(syncedDaysRaw, syncedItineraryRaw);
    });

    const daysRef = window.fbRef(window.fbDB, 'days');
    window.fbOnValue(daysRef, (snapshot) => {
        syncedDaysRaw = snapshot.val();
        setDayState(syncedDaysRaw, syncedItineraryRaw);
    });

    const mapSpotsRef = window.fbRef(window.fbDB, 'mapSpots');
    window.fbOnValue(mapSpotsRef, (snapshot) => {
        const data = snapshot.val();
        customMapSpots = data ? Object.values(data) : [];
        localStorage.setItem('customMapSpots', JSON.stringify(customMapSpots));
        renderMapMarkers();
    });
};

function saveDays() {
    persistDayLocalState();

    if (window.fbDB) {
        const daysRef = window.fbRef(window.fbDB, 'days');
        window.fbSet(daysRef, dayTabs);
    }
}

function saveData() {
    localStorage.setItem('itinerary', JSON.stringify(itineraryData));
    persistDayLocalState();

    if (window.fbDB) {
        const itineraryRef = window.fbRef(window.fbDB, 'itinerary');
        window.fbSet(itineraryRef, itineraryData);
    }
}

const syncBtn = document.getElementById('sync-btn');
if (syncBtn) {
    syncBtn.addEventListener('click', () => {
        syncBtn.textContent = '✅ 最新の状態です';
        setTimeout(() => { syncBtn.textContent = '🔄 リアルタイム同期中'; }, 3000);
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
            const address = place.formatted_address || '';
            const placeId = place.place_id || basicPlace.place_id || '';

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
                    lat,
                    lng,
                    estimated: 2000,
                    duration: 1.0,
                    address,
                    placeId,
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

// --- 9. ローカル初期表示 ---
const localItinerary = JSON.parse(localStorage.getItem('itinerary')) || [];
setDayState(dayTabs, localItinerary);
