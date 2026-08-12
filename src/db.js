import { state } from './state.js';
import { generateModelThumbnail } from './loaders.js';
import { spawnModel } from './loaders.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DB_NAME = "StudioEditorDB";
const DB_VERSION = 1;
let db = null;

export function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains("models")) {
                database.createObjectStore("models", { keyPath: "name" });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => {
            console.warn("IndexedDB error:", e);
            resolve(null);
        };
    });
}

export function saveModelToDB(name, arrayBuffer) {
    if (!db) return;
    try {
        const tx = db.transaction("models", "readwrite");
        tx.objectStore("models").put({ name: name, data: arrayBuffer });
    } catch(e) {}
}

export function loadSavedModelsFromDB() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        try {
            const tx = db.transaction("models", "readonly");
            const store = tx.objectStore("models");
            const request = store.getAll();

            request.onsuccess = () => {
                const savedList = request.result || [];
                if (savedList.length === 0) return resolve();

                const toolboxList = document.getElementById('toolbox-list');
                let loadedCount = 0;

                savedList.forEach(item => {
                    const loader = new GLTFLoader();
                    loader.parse(item.data, '', (gltf) => {
                        const model = gltf.scene;
                        model.name = item.name;
                        state.loadedModels[model.name] = model;

                        const thumbDataUrl = generateModelThumbnail(model);
                        const tbItem = document.createElement('div');
                        tbItem.className = 'asset-item';
                        tbItem.innerHTML = `
                            ${thumbDataUrl ? `<img class="asset-thumb" src="${thumbDataUrl}" alt="${model.name}">` : `<div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>`}
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${model.name}</div>
                                <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                            </div>
                            <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                        `;
                        tbItem.onclick = () => spawnModel(model.name);
                        toolboxList.appendChild(tbItem);

                        loadedCount++;
                        if (loadedCount === savedList.length) resolve();
                    }, () => {
                        loadedCount++;
                        if (loadedCount === savedList.length) resolve();
                    });
                });
            };
            request.onerror = () => resolve();
        } catch(e) { resolve(); }
    });
}

export function clearAllSavedData() {
    localStorage.removeItem('studio_editor_autosave');
    if (db) {
        try {
            const tx = db.transaction("models", "readwrite");
            tx.objectStore("models").clear();
        } catch(e) {}
    }
}