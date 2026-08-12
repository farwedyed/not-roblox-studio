import { state } from './state.js';
import { generateModelThumbnail, spawnModel } from './loaders.js';
import { fileBlobMap } from './materials.js'; // Imported fileBlobMap!
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';

const DB_NAME = "StudioEditorDB";
const DB_VERSION = 2;
let db = null;

export function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains("models")) {
                database.createObjectStore("models", { keyPath: "name" });
            }
            if (!database.objectStoreNames.contains("textures")) {
                database.createObjectStore("textures", { keyPath: "name" });
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

export function saveTextureToDB(name, arrayBuffer, mimeType) {
    if (!db) return;
    try {
        const tx = db.transaction("textures", "readwrite");
        tx.objectStore("textures").put({ name: name, data: arrayBuffer, type: mimeType });
    } catch(e) {}
}

export function loadSavedTexturesFromDB() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        try {
            const tx = db.transaction("textures", "readonly");
            const store = tx.objectStore("textures");
            const request = store.getAll();

            request.onsuccess = () => {
                const savedList = request.result || [];
                if (savedList.length === 0) return resolve();

                const textureLoader = new THREE.TextureLoader();
                let loadedCount = 0;

                savedList.forEach(item => {
                    const blob = new Blob([item.data], { type: item.type || 'image/png' });
                    const fileURL = URL.createObjectURL(blob);

                    // CRITICAL FIX: Register texture Blob URLs into fileBlobMap on startup!
                    const nameLower = item.name.toLowerCase();
                    fileBlobMap.set(nameLower, fileURL);
                    fileBlobMap.set(item.name, fileURL);

                    textureLoader.load(fileURL, (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        state.loadedTextures[item.name] = texture;

                        loadedCount++;
                        if (loadedCount === savedList.length) resolve();
                    }, undefined, () => {
                        loadedCount++;
                        if (loadedCount === savedList.length) resolve();
                    });
                });
            };
            request.onerror = () => resolve();
        } catch(e) { resolve(); }
    });
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
            const tx = db.transaction(["models", "textures"], "readwrite");
            tx.objectStore("models").clear();
            tx.objectStore("textures").clear();
        } catch(e) {}
    }
}