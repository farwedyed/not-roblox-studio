import * as THREE from 'three';
import { state, serializeObject, getSerializableObjects } from './state.js';
import { scene, transformControls, selectionBox, updateLighting, updateRobloxScaleGizmoPositions } from './scene.js';
import { selectObject, selectMultipleObjects, selectLightingService, clearMultiPivot } from './selection.js';
import { applyMaterialToSelected, setTextureRepeatScale } from './loaders.js';
import { saveTextureToDB } from './db.js';
import { materialTextureLibrary } from './materials.js';

const textureLoader = new THREE.TextureLoader();

function bindEvent(id, eventName, callback) {
    const el = document.getElementById(id);
    if (el) el[eventName] = callback;
}

export function autoSaveMap() {
    if (state.isRestoring) return; // Blocked if clearing or restoring!
    if (!state.placedObjects || state.placedObjects.length === 0) return;
    try {
        const serializable = getSerializableObjects();
        const exportData = {
            lighting: { ...state.lightingSettings },
            objects: serializable.map(o => serializeObject(o, scene))
        };
        localStorage.setItem('studio_editor_autosave', JSON.stringify(exportData));
    } catch(e) {}
}

export function checkAndRestoreAutoSave() {
    const saved = localStorage.getItem('studio_editor_autosave');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.objects && data.objects.length > 0) {
                restoreState(JSON.stringify(data.objects));
                if (data.lighting) Object.assign(state.lightingSettings, data.lighting);
                updateLighting();
                showStatus(`Restored Auto-Save (${data.objects.length} Objects)`);
            }
        } catch(e) {
            console.error("Auto-save restore error:", e);
        }
    }
    state.isRestoring = false; // Restoration complete, enable normal auto-saving!
}

export function saveState() {
    if (state.isRestoring) return;
    if (!state.placedObjects) return;
    const serializable = getSerializableObjects();
    const snapshot = serializable.map(o => serializeObject(o, scene));
    const jsonStr = JSON.stringify(snapshot);

    if (state.undoStack.length > 0 && state.undoStack[state.undoStack.length - 1] === jsonStr) {
        return;
    }

    state.undoStack.push(jsonStr);
    state.redoStack.length = 0;
    autoSaveMap();
}

export function undo() {
    if (state.undoStack.length <= 1) return;
    state.redoStack.push(state.undoStack.pop());
    restoreState(state.undoStack[state.undoStack.length - 1]);
    showStatus("Undo");
}

export function redo() {
    if (state.redoStack.length === 0) return;
    const snapshotStr = state.redoStack.pop();
    state.undoStack.push(snapshotStr);
    restoreState(snapshotStr);
    showStatus("Redo");
}

export function restoreState(jsonState) {
    const data = JSON.parse(jsonState);

    clearMultiPivot();

    if (transformControls) transformControls.detach();
    if (selectionBox) selectionBox.visible = false;
    updateRobloxScaleGizmoPositions(null);
    state.selectedObjects = [];
    state.selectedObject = null;

    state.placedObjects.forEach(o => {
        scene.remove(o);
        o.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
    });
    state.placedObjects = [];

    const objectMap = new Map();

    data.forEach(item => {
        let obj;
        const safeColor = (item.color && typeof item.color === 'string') ? parseInt(item.color.replace('#', '0x')) : 0xa3a2a5;

        if (item.objectType === "Baseplate" || item.name === "Baseplate" || item.isBaseplate) {
            const geo = new THREE.BoxGeometry(100, 1, 100);
            const mat = new THREE.MeshStandardMaterial({ 
                color: safeColor, 
                map: materialTextureLibrary["Studs"],
                roughness: item.roughness || 0.35, 
                metalness: 0.1 
            });
            if (mat.map) mat.map.repeat.set(25, 25);
            obj = new THREE.Mesh(geo, mat);
            obj.userData = { locked: true, anchored: true, canCollide: true, materialName: "Studs" };
        } else if ((item.objectType === "GLTFModel" || item.modelType) && item.modelType && state.loadedModels[item.modelType]) {
            obj = state.loadedModels[item.modelType].clone();
            obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            obj.userData = { locked: !!item.locked, anchored: !!item.anchored, canCollide: !!item.canCollide, modelType: item.modelType };
        } else if (item.objectType === "Primitive" || item.isPrimitive || item.primitiveType) {
            const pType = item.primitiveType || 'Block';
            let geo = pType === 'Sphere' ? new THREE.SphereGeometry(1.5, 32, 32) : new THREE.BoxGeometry(2, 2, 2);
            const mat = new THREE.MeshStandardMaterial({ color: safeColor, roughness: item.roughness || 0.5 });
            obj = new THREE.Mesh(geo, mat);
            obj.userData = { locked: !!item.locked, anchored: !!item.anchored, canCollide: !!item.canCollide, isPrimitive: true, primitiveType: pType };
        } else {
            obj = new THREE.Group();
            obj.userData = { locked: !!item.locked, isUserGroup: true };
        }

        if (item.uuid) {
            obj.uuid = item.uuid;
        }
        obj.name = item.name;
        obj.castShadow = !!item.castShadow;
        obj.receiveShadow = !!item.receiveShadow;

        let tex = null;
        if (item.textureName && state.loadedTextures[item.textureName]) {
            tex = state.loadedTextures[item.textureName].clone();
            obj.userData.textureName = item.textureName;
        } else if (item.materialName && materialTextureLibrary[item.materialName]) {
            tex = materialTextureLibrary[item.materialName].clone();
            obj.userData.materialName = item.materialName;
        }

        if (tex) {
            tex.needsUpdate = true;
            if (item.textureRepeat) tex.repeat.set(item.textureRepeat.u, item.textureRepeat.v);
            if (item.textureOffset) tex.offset.set(item.textureOffset.u, item.textureOffset.v);

            obj.traverse(c => {
                if (c.isMesh) {
                    c.material.map = tex;
                    c.material.needsUpdate = true;
                }
            });
        }

        // Backward compatibility fallback to support previous non-UUID maps and auto-saves
        const key = item.uuid || item.name;
        const parentKey = item.parentUuid || item.parentName;

        objectMap.set(key, { instance: obj, parentKey: parentKey, rawItem: item });
    });

    // 1. Build relationships first based on UUIDs or fallback names
    objectMap.forEach(({ instance, parentKey }) => {
        if (parentKey && objectMap.has(parentKey)) {
            objectMap.get(parentKey).instance.add(instance);
        } else {
            scene.add(instance);
            state.placedObjects.push(instance);
        }
    });

    // 2. Adjust local vectors based on absolute world coordinates (resolves nested scaling/offset bugs)
    data.forEach(item => {
        const key = item.uuid || item.name;
        const mapping = objectMap.get(key);
        if (!mapping) return;
        const obj = mapping.instance;

        obj.position.set(item.position.x, item.position.y, item.position.z);
        obj.scale.set(item.scale.x, item.scale.y, item.scale.z);

        const worldQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(item.rotation.x, item.rotation.y, item.rotation.z));

        if (obj.parent && obj.parent !== scene && obj.parent.name !== "TempMultiPivot") {
            obj.parent.worldToLocal(obj.position);

            const parentWorldQ = new THREE.Quaternion();
            obj.parent.getWorldQuaternion(parentWorldQ);
            obj.quaternion.copy(parentWorldQ.invert().multiply(worldQ));

            const parentWorldScale = new THREE.Vector3();
            obj.parent.getWorldScale(parentWorldScale);
            obj.scale.divide(parentWorldScale);
        } else {
            obj.quaternion.copy(worldQ);
        }
    });

    updateExplorer();
    renderPropertiesPanel();
}

export function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.style.display = 'none';
}

export function showContextMenu(x, y) {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';
    }
}

export function updateExplorer() {
    const explorerTree = document.getElementById('explorer-tree');
    if (!explorerTree) return;

    explorerTree.innerHTML = '';

    const lightingItem = document.createElement('div');
    lightingItem.className = `tree-item ${state.isLightingSelected ? 'selected' : ''}`;
    lightingItem.innerHTML = `<span>☀️</span> Lighting`;
    lightingItem.onclick = () => selectLightingService();
    lightingItem.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectLightingService();
    };
    explorerTree.appendChild(lightingItem);

    state.placedObjects.forEach(obj => {
        const item = document.createElement('div');
        const isSel = state.selectedObjects.includes(obj) || state.selectedObject === obj;
        item.className = `tree-item ${isSel ? 'selected' : ''}`;

        let icon = '🔷';
        if (obj.userData && obj.userData.locked) icon = '🔒';
        else if (obj.name === "Baseplate") icon = '🧱';
        else if (obj.userData && obj.userData.isPrimitive) {
            icon = obj.userData.primitiveType === 'Sphere' ? '⚪' : '🟩';
        } else if (obj.userData && obj.userData.modelType) icon = '📦';
        else if (obj.isGroup) icon = '📁';

        item.innerHTML = `<span>${icon}</span> ${obj.name}`;
        
        item.onclick = (e) => selectObject(obj, e.shiftKey);
        item.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.selectedObjects.includes(obj)) {
                selectObject(obj, e.shiftKey);
            }
            showContextMenu(e.clientX, e.clientY);
        };

        explorerTree.appendChild(item);
    });
}

export function updateExplorerUI() { updateExplorer(); }

export function showStatus(text) {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    statusBar.innerText = text;
    statusBar.style.display = 'block';
    setTimeout(() => { statusBar.style.display = 'none'; }, 1500);
}

export function renderLightingProperties() {
    const propertiesContent = document.getElementById('properties-content');
    if (!propertiesContent) return;

    propertiesContent.innerHTML = `
        <div class="prop-section">Lighting Service</div>
        <div class="prop-row">
            <span class="prop-label">ClockTime</span>
            <input class="prop-input" id="light-time" type="number" min="0" max="24" step="0.5" value="${state.lightingSettings.clockTime}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Time Slider</span>
            <input type="range" id="light-time-slider" min="0" max="24" step="0.25" value="${state.lightingSettings.clockTime}">
        </div>

        <div class="prop-section">Sun Settings</div>
        <div class="prop-row">
            <span class="prop-label">Brightness</span>
            <input type="range" id="light-brightness" min="0" max="4" step="0.1" value="${state.lightingSettings.brightness}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Ambient Light</span>
            <input type="range" id="light-ambient" min="0" max="3" step="0.1" value="${state.lightingSettings.ambient}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Global Shadows</span>
            <input type="checkbox" id="light-shadows" ${state.lightingSettings.shadows ? 'checked' : ''}>
        </div>
    `;

    bindEvent('light-time', 'onchange', (e) => {
        state.lightingSettings.clockTime = parseFloat(e.target.value);
        document.getElementById('light-time-slider').value = state.lightingSettings.clockTime;
        updateLighting();
        saveState();
    });

    bindEvent('light-time-slider', 'oninput', (e) => {
        state.lightingSettings.clockTime = parseFloat(e.target.value);
        document.getElementById('light-time').value = state.lightingSettings.clockTime;
        updateLighting();
    });
    
    bindEvent('light-time-slider', 'onchange', () => {
        saveState();
    });

    bindEvent('light-brightness', 'oninput', (e) => {
        state.lightingSettings.brightness = parseFloat(e.target.value);
        updateLighting();
    });
    bindEvent('light-brightness', 'onchange', () => {
        saveState();
    });

    bindEvent('light-ambient', 'oninput', (e) => {
        state.lightingSettings.ambient = parseFloat(e.target.value);
        updateLighting();
    });
    bindEvent('light-ambient', 'onchange', () => {
        saveState();
    });

    bindEvent('light-shadows', 'onchange', (e) => {
        state.lightingSettings.shadows = e.target.checked;
        updateLighting();
        saveState();
    });
}

export function renderPropertiesPanel() {
    const propertiesContent = document.getElementById('properties-content');
    if (!propertiesContent) return;

    if (state.isLightingSelected) {
        renderLightingProperties();
        return;
    }

    if (!state.selectedObject) {
        propertiesContent.innerHTML = `<div style="color: #666; font-size: 11px; text-align: center; padding: 20px;">Select an object or Lighting service in Explorer</div>`;
        return;
    }

    const isMesh = state.selectedObject.isMesh;
    const colorHex = (isMesh && state.selectedObject.material && state.selectedObject.material.color) ? "#" + state.selectedObject.material.color.getHexString() : "#ffffff";
    const currentMatName = state.selectedObject.userData.materialName || "Plastic";

    let curTexName = state.selectedObject.userData.textureName || "None";
    let repeatU = 1, repeatV = 1;

    const currentBox = new THREE.Box3().setFromObject(state.selectedObject);
    const studsSize = currentBox.getSize(new THREE.Vector3());

    state.selectedObject.traverse(c => {
        if (c.isMesh && c.material && c.material.map) {
            repeatU = c.material.map.repeat.x;
            repeatV = c.material.map.repeat.y;
        }
    });

    const textureKeys = Object.keys(state.loadedTextures);

    propertiesContent.innerHTML = `
        <div class="prop-section">Data (${state.selectedObjects.length} Selected)</div>
        <div class="prop-row">
            <span class="prop-label">Name</span>
            <input class="prop-input" id="prop-name" type="text" value="${state.selectedObject.name}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Locked</span>
            <input type="checkbox" id="prop-locked" ${state.selectedObject.userData.locked ? 'checked' : ''}>
        </div>

        <div class="prop-section">Material & Custom Texture</div>
        <div class="prop-row">
            <span class="prop-label">Material</span>
            <select class="prop-input" id="prop-material">
                <option value="Plastic" ${currentMatName === 'Plastic' ? 'selected' : ''}>Plastic (Smooth)</option>
                <option value="Studs" ${currentMatName === 'Studs' ? 'selected' : ''}>Studs (Roblox)</option>
                <option value="Grass" ${currentMatName === 'Grass' ? 'selected' : ''}>Grass</option>
                <option value="Brick" ${currentMatName === 'Brick' ? 'selected' : ''}>Brick</option>
                <option value="Wood" ${currentMatName === 'Wood' ? 'selected' : ''}>Wood</option>
                <option value="Concrete" ${currentMatName === 'Concrete' ? 'selected' : ''}>Concrete</option>
                <option value="Metal" ${currentMatName === 'Metal' ? 'selected' : ''}>Metal (Diamond)</option>
            </select>
        </div>
        <div class="prop-row">
            <span class="prop-label">Texture ID</span>
            <select class="prop-input" id="prop-texture-id">
                <option value="None">None (Color Only)</option>
                ${textureKeys.map(k => `<option value="${k}" ${curTexName === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
        </div>
        <div class="prop-row">
            <span class="prop-label">Custom Texture</span>
            <label for="prop-custom-tex-file" class="btn" style="padding:2px 6px; font-size:10px;">📷 Select Image</label>
            <input type="file" id="prop-custom-tex-file" class="file-input-hidden" accept="image/*">
        </div>

        <div class="prop-section">UV Mapping (StudsPerTile)</div>
        <div class="prop-row">
            <span class="prop-label">StudsPerTile U / V</span>
            <div class="vector3-group">
                <input id="prop-tile-u" type="number" step="0.5" value="${repeatU}">
                <input id="prop-tile-v" type="number" step="0.5" value="${repeatV}">
            </div>
        </div>

        <div class="prop-section">Behavior (Bulk Edit)</div>
        <div class="prop-row">
            <span class="prop-label">Anchored</span>
            <input type="checkbox" id="prop-anchored" ${state.selectedObject.userData.anchored ? 'checked' : ''}>
        </div>
        <div class="prop-row">
            <span class="prop-label">CanCollide</span>
            <input type="checkbox" id="prop-cancollide" ${state.selectedObject.userData.canCollide ? 'checked' : ''}>
        </div>

        <div class="prop-section">Appearance (Bulk Edit)</div>
        <div class="prop-row">
            <span class="prop-label">Cast Shadow</span>
            <input type="checkbox" id="prop-castshadow" ${state.selectedObject.castShadow ? 'checked' : ''}>
        </div>
        <div class="prop-row">
            <span class="prop-label">Receive Shadow</span>
            <input type="checkbox" id="prop-receiveshadow" ${state.selectedObject.receiveShadow ? 'checked' : ''}>
        </div>
        ${isMesh ? `
        <div class="prop-row">
            <span class="prop-label">Color</span>
            <input type="color" id="prop-color" value="${colorHex}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Transparency</span>
            <input type="range" id="prop-transparency" min="0" max="1" step="0.05" value="${1 - state.selectedObject.material.opacity}">
        </div>
        <div class="prop-row">
            <span class="prop-label">Roughness</span>
            <input type="range" id="prop-roughness" min="0" max="1" step="0.05" value="${state.selectedObject.material.roughness}">
        </div>` : ''}

        <div class="prop-section">Size in Studs</div>
        <div class="prop-row">
            <span class="prop-label">Studs (W x H x D)</span>
            <div class="vector3-group">
                <input id="size-x" type="number" step="0.5" value="${studsSize.x.toFixed(1)}">
                <input id="size-y" type="number" step="0.5" value="${studsSize.y.toFixed(1)}">
                <input id="size-z" type="number" step="0.5" value="${studsSize.z.toFixed(1)}">
            </div>
        </div>

        <div class="prop-section">Transform</div>
        <div class="prop-row">
            <span class="prop-label">Position</span>
            <div class="vector3-group">
                <input id="pos-x" type="number" step="0.5" value="${state.selectedObject.position.x.toFixed(1)}">
                <input id="pos-y" type="number" step="0.5" value="${state.selectedObject.position.y.toFixed(1)}">
                <input id="pos-z" type="number" step="0.5" value="${state.selectedObject.position.z.toFixed(1)}">
            </div>
        </div>
        <div class="prop-row">
            <span class="prop-label">Scale Factor</span>
            <div class="vector3-group">
                <input id="scale-x" type="number" step="0.1" value="${state.selectedObject.scale.x.toFixed(1)}">
                <input id="scale-y" type="number" step="0.1" value="${state.selectedObject.scale.y.toFixed(1)}">
                <input id="scale-z" type="number" step="0.1" value="${state.selectedObject.scale.z.toFixed(1)}">
            </div>
        </div>
    `;

    bindEvent('prop-name', 'onchange', (e) => {
        state.selectedObject.name = e.target.value;
        updateExplorer();
        saveState();
    });

    bindEvent('prop-material', 'onchange', (e) => {
        applyMaterialToSelected(e.target.value);
    });

    bindEvent('prop-texture-id', 'onchange', (e) => {
        const texName = e.target.value;
        if (texName === "None") {
            state.selectedObjects.forEach(obj => {
                obj.userData.textureName = null;
                obj.traverse(c => { if (c.isMesh) c.material.map = null; c.material.needsUpdate = true; });
            });
            saveState();
        } else if (state.loadedTextures[texName]) {
            const tex = state.loadedTextures[texName].clone();
            tex.needsUpdate = true;
            state.selectedObjects.forEach(obj => {
                obj.userData.textureName = texName;
                obj.traverse(c => { if (c.isMesh) { c.material.map = tex; c.material.needsUpdate = true; } });
            });
            saveState();
        }
    });

    bindEvent('prop-custom-tex-file', 'onchange', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const arrayBuffer = ev.target.result;
            saveTextureToDB(file.name, arrayBuffer, file.type);

            const blob = new Blob([arrayBuffer], { type: file.type });
            const url = URL.createObjectURL(blob);

            textureLoader.load(url, (tex) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                state.loadedTextures[file.name] = tex;

                state.selectedObjects.forEach(obj => {
                    obj.userData.textureName = file.name;
                    obj.traverse(c => {
                        if (c.isMesh) {
                            c.material.map = tex;
                            c.material.needsUpdate = true;
                        }
                    });
                });
                saveState();
                renderPropertiesPanel();
                showStatus("Applied & Saved Custom Texture!");
            });
        };
        reader.readAsArrayBuffer(file);
    });

    ['prop-tile-u', 'prop-tile-v'].forEach((id) => {
        bindEvent(id, 'onchange', () => {
            const uVal = parseFloat(document.getElementById('prop-tile-u')?.value || 1);
            const vVal = parseFloat(document.getElementById('prop-tile-v')?.value || 1);

            setTextureRepeatScale(uVal, vVal);
            saveState();
        });
    });

    ['size-x', 'size-y', 'size-z'].forEach((id, idx) => {
        bindEvent(id, 'onchange', () => {
            if (!state.selectedObject) return;
            const axis = ['x', 'y', 'z'][idx];
            const targetSize = parseFloat(document.getElementById(id).value) || 1;

            const box = new THREE.Box3().setFromObject(state.selectedObject);
            const curSize = box.getSize(new THREE.Vector3());
            const curAxisLen = curSize[axis] || 1;

            const ratio = targetSize / curAxisLen;
            state.selectedObject.scale[axis] *= ratio;

            if (selectionBox) selectionBox.update();
            const targetObj = state.selectedObjects.length > 1 ? window.multiPivotGroup : state.selectedObject;
            updateRobloxScaleGizmoPositions(targetObj);
            updatePropertiesUIValues();
            saveState();
        });
    });

    bindEvent('prop-locked', 'onchange', (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.locked = val);
        selectObject(state.selectedObject);
        saveState();
    });

    bindEvent('prop-anchored', 'onchange', (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.anchored = val);
        saveState();
    });

    bindEvent('prop-cancollide', 'onchange', (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.canCollide = val);
        saveState();
    });

    bindEvent('prop-castshadow', 'onchange', (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.castShadow = val);
        saveState();
    });

    bindEvent('prop-receiveshadow', 'onchange', (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.receiveShadow = val);
        saveState();
    });

    if (isMesh) {
        bindEvent('prop-color', 'oninput', (e) => {
            const col = e.target.value;
            state.selectedObjects.forEach(o => {
                o.traverse(c => { if (c.isMesh && c.material && c.material.color) c.material.color.set(col); });
            });
        });
        bindEvent('prop-color', 'onchange', () => {
            saveState();
        });

        bindEvent('prop-transparency', 'oninput', (e) => {
            const alpha = 1 - parseFloat(e.target.value);
            state.selectedObjects.forEach(o => {
                o.traverse(c => {
                    if (c.isMesh && c.material) {
                        c.material.transparent = true;
                        c.material.opacity = alpha;
                    }
                });
            });
        });
        bindEvent('prop-transparency', 'onchange', () => {
            saveState();
        });

        bindEvent('prop-roughness', 'oninput', (e) => {
            const r = parseFloat(e.target.value);
            state.selectedObjects.forEach(o => {
                o.traverse(c => { if (c.isMesh && c.material) c.material.roughness = r; });
            });
        });
        bindEvent('prop-roughness', 'onchange', () => {
            saveState();
        });
    }

    ['pos-x', 'pos-y', 'pos-z'].forEach((id, idx) => {
        bindEvent(id, 'onchange', () => {
            const axis = ['x', 'y', 'z'][idx];
            state.selectedObject.position[axis] = parseFloat(document.getElementById(id).value);
            if (selectionBox) selectionBox.update();
            const targetObj = state.selectedObjects.length > 1 ? window.multiPivotGroup : state.selectedObject;
            updateRobloxScaleGizmoPositions(targetObj);
            saveState();
        });
    });

    ['scale-x', 'scale-y', 'scale-z'].forEach((id, idx) => {
        bindEvent(id, 'onchange', () => {
            const axis = ['x', 'y', 'z'][idx];
            state.selectedObject.scale[axis] = parseFloat(document.getElementById(id).value);
            if (selectionBox) selectionBox.update();
            const targetObj = state.selectedObjects.length > 1 ? window.multiPivotGroup : state.selectedObject;
            updateRobloxScaleGizmoPositions(targetObj);
            saveState();
        });
    });
}

export function updatePropertiesUIValues() {
    if (!state.selectedObject) return;
    if (document.getElementById('pos-x')) {
        document.getElementById('pos-x').value = state.selectedObject.position.x.toFixed(1);
        document.getElementById('pos-y').value = state.selectedObject.position.y.toFixed(1);
        document.getElementById('pos-z').value = state.selectedObject.position.z.toFixed(1);

        document.getElementById('scale-x').value = state.selectedObject.scale.x.toFixed(1);
        document.getElementById('scale-y').value = state.selectedObject.scale.y.toFixed(1);
        document.getElementById('scale-z').value = state.selectedObject.scale.z.toFixed(1);

        const currentBox = new THREE.Box3().setFromObject(state.selectedObject);
        const studsSize = currentBox.getSize(new THREE.Vector3());

        if (document.getElementById('size-x')) {
            document.getElementById('size-x').value = studsSize.x.toFixed(1);
            document.getElementById('size-y').value = studsSize.y.toFixed(1);
            document.getElementById('size-z').value = studsSize.z.toFixed(1);
        }
    }
}

export function exportMapJSON() {
    const serializable = getSerializableObjects();
    const exportData = {
        lighting: { ...state.lightingSettings },
        objects: serializable.map(o => serializeObject(o, scene))
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "map_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}