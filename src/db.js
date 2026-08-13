import { state } from './state.js';
import { generateModelThumbnail, spawnModel, cloneModelWithMaterials, resolveRelativePath, getOrCreateToolboxFolderSection } from './loaders.js';
import { fileBlobMap, fileToAssetIdMap, blobUrlToAssetIdMap, assetIdToDisplayNameMap } from './materials.js';
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

export function cleanupCollidingTextures() {
    return new Promise((resolve) => {
        if (!db) return resolve();
        try {
            const tx = db.transaction("textures", "readwrite");
            const store = tx.objectStore("textures");
            store.delete("palette.png");
            store.delete("colormap.png");
            store.delete("texture.png");
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch(e) { resolve(); }
    });
}

export function saveModelToDB(name, arrayBuffer, baseDir = "") {
    if (!db) return;
    try {
        const tx = db.transaction("models", "readwrite");
        tx.objectStore("models").put({ name: name, data: arrayBuffer, baseDir: baseDir });
    } catch(e) {}
}

export function saveTextureToDB(name, base64Data, mimeType, originalPath = "") {
    if (!db) return;
    try {
        const tx = db.transaction("textures", "readwrite");
        tx.objectStore("textures").put({ 
            name: name,
            data: base64Data,
            type: mimeType,
            originalPath: originalPath
        });
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
                    let base64Data;
                    
                    if (item.data instanceof ArrayBuffer) {
                        const blob = new Blob([item.data], { type: item.type || 'image/png' });
                        base64Data = URL.createObjectURL(blob);
                    } else {
                        base64Data = item.data;
                    }
                    
                    const assetId = item.name;
                    const originalPath = item.originalPath || "";

                    state.textureData[assetId] = base64Data;

                    if (originalPath) {
                        fileToAssetIdMap.set(originalPath.toLowerCase(), assetId);
                        
                        if (!originalPath.includes('/')) {
                            const fileName = originalPath.split('/').pop().toLowerCase();
                            fileToAssetIdMap.set(fileName, assetId);
                        }
                        
                        assetIdToDisplayNameMap.set(assetId, originalPath);
                    } else {
                        assetIdToDisplayNameMap.set(assetId, assetId);
                    }

                    fileBlobMap.set(assetId, base64Data);
                    blobUrlToAssetIdMap.set(base64Data, assetId);

                    textureLoader.load(base64Data, (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        state.loadedTextures[assetId] = texture;

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

export function findSmartTextureFallback(fileName, modelName) {
    const cleanFileName = fileName.toLowerCase();
    const cleanModelName = modelName.toLowerCase();
    
    let bestMatchKey = null;
    let highestScore = 0;

    for (let key of fileToAssetIdMap.keys()) {
        const keyLower = key.toLowerCase();
        if (keyLower.endsWith('/' + cleanFileName) || keyLower === cleanFileName) {
            const parts = keyLower.split('/');
            let score = 0;
            parts.forEach(part => {
                if (part && part !== cleanFileName) {
                    if (cleanModelName.includes(part) || part.includes(cleanModelName)) {
                        score += part.length;
                    }
                }
            });
            if (score > highestScore) {
                highestScore = score;
                bestMatchKey = key;
            }
        }
    }
    
    if (highestScore > 0 && bestMatchKey && fileToAssetIdMap.has(bestMatchKey)) {
        const assetId = fileToAssetIdMap.get(bestMatchKey);
        return fileBlobMap.get(assetId);
    }
    return null;
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

                const parsePromises = savedList.map(item => {
                    return new Promise((res) => {
                        const baseDir = item.baseDir || "";
                        const uniqueModelId = item.name; // Stores full relative path (e.g., "mypack/nature/tile_2")

                        const localManager = new THREE.LoadingManager();
                        localManager.setURLModifier((url) => {
                            if (!url) return url;
                            const cleanUrl = decodeURIComponent(url).replace(/\\/g, '/').toLowerCase();
                            const fileName = cleanUrl.split('/').pop().split('?')[0];

                            const localResolvedPath = resolveRelativePath(baseDir, cleanUrl).toLowerCase();
                            
                            if (fileToAssetIdMap.has(localResolvedPath)) {
                                const assetId = fileToAssetIdMap.get(localResolvedPath);
                                if (fileBlobMap.has(assetId)) {
                                    const resolvedUrl = fileBlobMap.get(assetId);
                                    blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                                    return resolvedUrl;
                                }
                            }
                            
                            if (fileToAssetIdMap.has(cleanUrl)) {
                                const assetId = fileToAssetIdMap.get(cleanUrl);
                                if (fileBlobMap.has(assetId)) {
                                    const resolvedUrl = fileBlobMap.get(assetId);
                                    blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                                    return resolvedUrl;
                                }
                            }
                            
                            if (fileToAssetIdMap.has(fileName)) {
                                const assetId = fileToAssetIdMap.get(fileName);
                                if (fileBlobMap.has(assetId)) {
                                    const resolvedUrl = fileBlobMap.get(assetId);
                                    blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                                    return resolvedUrl;
                                }
                            }

                            const smartFallback = findSmartTextureFallback(fileName, uniqueModelId);
                            if (smartFallback) {
                                return smartFallback;
                            }

                            const dWhitePixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
                            if (url.match(/\.(png|jpg|jpeg|webp)$/i) || url.includes('Textures/')) {
                                return dWhitePixel;
                            }
                            return url;
                        });

                        const loader = new GLTFLoader(localManager);
                        loader.parse(item.data, '', (gltf) => {
                            const model = gltf.scene;
                            model.name = uniqueModelId;
                            state.loadedModels[uniqueModelId] = model;

                            model.traverse(c => {
                                if (c.isMesh) {
                                    c.castShadow = true;
                                    c.receiveShadow = true;
                                    if (c.material) {
                                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                                        mats.forEach(mat => {
                                            if (mat.map && mat.map.image) {
                                                const imgSrc = mat.map.image.src;
                                                if (blobUrlToAssetIdMap.has(imgSrc)) {
                                                    const assetId = blobUrlToAssetIdMap.get(imgSrc);
                                                    mat.userData.textureAssetId = assetId;
                                                    c.userData.textureAssetId = assetId;
                                                }
                                            }
                                        });
                                    }
                                }
                            });

                            const parts = uniqueModelId.split('/');
                            const folderName = parts.length > 1 ? parts.slice(0, -1).join('/') : "Loose Files";
                            const cleanDisplayName = parts.pop();
                            
                            const folderContent = getOrCreateToolboxFolderSection(folderName);

                            const thumbDataUrl = generateModelThumbnail(model);
                            const tbItem = document.createElement('div');
                            tbItem.className = 'asset-item';
                            tbItem.innerHTML = `
                                ${thumbDataUrl ? `<img class="asset-thumb" src="${thumbDataUrl}" alt="${cleanDisplayName}">` : `<div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>`}
                                <div style="flex:1; overflow:hidden;">
                                    <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${cleanDisplayName}</div>
                                    <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                                </div>
                                <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                            `;
                            tbItem.onclick = () => spawnModel(uniqueModelId);
                            if (folderContent) folderContent.appendChild(tbItem);

                            res();
                        }, () => res());
                    });
                });

                Promise.all(parsePromises).then(() => resolve());
            };
            request.onerror = () => resolve();
        } catch(e) { resolve(); }
    });
}

export function clearAllSavedData() {
    state.isRestoring = true;
    localStorage.removeItem('studio_editor_autosave');
    
    if (db) {
        try {
            const tx = db.transaction(["models", "textures"], "readwrite");
            tx.objectStore("models").clear();
            tx.objectStore("textures").clear();
        } catch(e) {}
    }

    state.placedObjects = [];
    state.undoStack = [];
    state.redoStack = [];

    window.location.reload();
}