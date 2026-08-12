import * as THREE from 'three';
import { state, serializeObject } from './state.js';
import { scene, transformControls, selectionBox, updateLighting } from './scene.js';
import { selectObject, selectMultipleObjects, selectLightingService, clearMultiPivot } from './selection.js';
import { applyMaterialToSelected, setTextureRepeatScale } from './loaders.js';

const textureLoader = new THREE.TextureLoader();

export function autoSaveMap() {
    if (!state.placedObjects || state.placedObjects.length === 0) return;
    try {
        const exportData = {
            lighting: { ...state.lightingSettings },
            objects: state.placedObjects.map(o => serializeObject(o, scene))
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
                showStatus("Restored Auto-Save!");
            }
        } catch(e) {}
    }
}

export function saveState() {
    if (!state.placedObjects) return;
    const snapshot = state.placedObjects.map(o => serializeObject(o, scene));
    state.undoStack.push(JSON.stringify(snapshot));
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
        if (item.name === "Baseplate" || item.isBaseplate) {
            const geo = new THREE.BoxGeometry(100, 1, 100);
            const mat = new THREE.MeshStandardMaterial({ 
                color: parseInt(item.color.replace('#', '0x')), 
                roughness: item.roughness, 
                metalness: 0.1 
            });
            obj = new THREE.Mesh(geo, mat);
            obj.userData = { locked: true, anchored: true, canCollide: true, materialName: "Studs" };
        } else if (item.modelType && state.loadedModels[item.modelType]) {
            obj = state.loadedModels[item.modelType].clone();
            obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            obj.userData = { locked: !!item.locked, anchored: !!item.anchored, canCollide: !!item.canCollide, modelType: item.modelType };
        } else if (item.isPrimitive) {
            let geo = item.primitiveType === 'Sphere' ? new THREE.SphereGeometry(1.5, 32, 32) : new THREE.BoxGeometry(2, 2, 2);
            const mat = new THREE.MeshStandardMaterial({ color: parseInt(item.color.replace('#', '0x')), roughness: item.roughness });
            obj = new THREE.Mesh(geo, mat);
            obj.userData = { locked: !!item.locked, anchored: !!item.anchored, canCollide: !!item.canCollide, isPrimitive: true, primitiveType: item.primitiveType };
        } else {
            obj = new THREE.Group();
            obj.userData = { locked: !!item.locked, isUserGroup: true };
        }

        obj.name = item.name;
        obj.castShadow = !!item.castShadow;
        obj.receiveShadow = !!item.receiveShadow;

        obj.position.set(item.position.x, item.position.y, item.position.z);
        obj.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
        obj.scale.set(item.scale.x, item.scale.y, item.scale.z);

        objectMap.set(obj.name, { instance: obj, parentName: item.parentName });
    });

    objectMap.forEach(({ instance, parentName }) => {
        if (parentName && objectMap.has(parentName)) {
            objectMap.get(parentName).instance.add(instance);
        } else {
            scene.add(instance);
            state.placedObjects.push(instance);
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

// Clean DOM Event Binding for Explorer Tree
export function updateExplorer() {
    const explorerTree = document.getElementById('explorer-tree');
    if (!explorerTree) return;

    explorerTree.innerHTML = '';

    // 1. Lighting Service Item
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

    // 2. Placed Objects & Baseplate Items
    state.placedObjects.forEach(obj => {
        const item = document.createElement('div');
        const isSel = state.selectedObjects.includes(obj) || state.selectedObject === obj;
        item.className = `tree-item ${isSel ? 'selected' : ''}`;
        item.innerHTML = `<span>${obj.userData.locked ? '🔒' : (obj.isGroup ? '📁' : '🔷')}</span> ${obj.name}`;
        
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

    const updateTime = (val) => {
        state.lightingSettings.clockTime = parseFloat(val);
        document.getElementById('light-time').value = state.lightingSettings.clockTime;
        document.getElementById('light-time-slider').value = state.lightingSettings.clockTime;
        updateLighting();
    };

    document.getElementById('light-time').onchange = (e) => updateTime(e.target.value);
    document.getElementById('light-time-slider').oninput = (e) => updateTime(e.target.value);

    document.getElementById('light-brightness').oninput = (e) => {
        state.lightingSettings.brightness = parseFloat(e.target.value);
        updateLighting();
    };

    document.getElementById('light-ambient').oninput = (e) => {
        state.lightingSettings.ambient = parseFloat(e.target.value);
        updateLighting();
    };

    document.getElementById('light-shadows').onchange = (e) => {
        state.lightingSettings.shadows = e.target.checked;
        updateLighting();
    };
}

export function renderPropertiesPanel() {
    const propertiesContent = document.getElementById('properties-content');
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
            <span class="prop-label">Custom Texture</span>
            <label for="prop-custom-tex-file" class="btn" style="padding:2px 6px; font-size:10px;">📷 Upload Texture</label>
            <input type="file" id="prop-custom-tex-file" class="file-input-hidden" accept="image/*">
        </div>
        <div class="prop-row">
            <span class="prop-label">Texture Scale</span>
            <input type="range" id="prop-texscale" min="1" max="20" step="1" value="4">
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
            <span class="prop-label">Scale</span>
            <div class="vector3-group">
                <input id="scale-x" type="number" step="0.1" value="${state.selectedObject.scale.x.toFixed(1)}">
                <input id="scale-y" type="number" step="0.1" value="${state.selectedObject.scale.y.toFixed(1)}">
                <input id="scale-z" type="number" step="0.1" value="${state.selectedObject.scale.z.toFixed(1)}">
            </div>
        </div>
    `;

    document.getElementById('prop-name').onchange = (e) => {
        saveState();
        state.selectedObject.name = e.target.value;
        updateExplorer();
    };

    document.getElementById('prop-material').onchange = (e) => {
        applyMaterialToSelected(e.target.value);
    };

    document.getElementById('prop-custom-tex-file').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        textureLoader.load(url, (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            saveState();
            state.selectedObjects.forEach(obj => {
                obj.traverse(c => {
                    if (c.isMesh) {
                        c.material.map = tex;
                        c.material.needsUpdate = true;
                    }
                });
            });
            showStatus("Applied Custom Texture!");
        });
    };

    document.getElementById('prop-texscale').oninput = (e) => {
        setTextureRepeatScale(parseFloat(e.target.value));
    };

    document.getElementById('prop-locked').onchange = (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.locked = val);
        selectObject(state.selectedObject);
    };

    document.getElementById('prop-anchored').onchange = (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.anchored = val);
    };

    document.getElementById('prop-cancollide').onchange = (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.userData.canCollide = val);
    };

    document.getElementById('prop-castshadow').onchange = (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.castShadow = val);
    };

    document.getElementById('prop-receiveshadow').onchange = (e) => {
        const val = e.target.checked;
        state.selectedObjects.forEach(o => o.receiveShadow = val);
    };

    if (isMesh) {
        document.getElementById('prop-color').oninput = (e) => {
            const col = e.target.value;
            state.selectedObjects.forEach(o => {
                o.traverse(c => { if (c.isMesh && c.material && c.material.color) c.material.color.set(col); });
            });
        };

        document.getElementById('prop-transparency').oninput = (e) => {
            const alpha = 1 - parseFloat(e.target.value);
            state.selectedObjects.forEach(o => {
                o.traverse(c => {
                    if (c.isMesh && c.material) {
                        c.material.transparent = true;
                        c.material.opacity = alpha;
                    }
                });
            });
        };

        document.getElementById('prop-roughness').oninput = (e) => {
            const r = parseFloat(e.target.value);
            state.selectedObjects.forEach(o => {
                o.traverse(c => { if (c.isMesh && c.material) c.material.roughness = r; });
            });
        };
    }

    ['pos-x', 'pos-y', 'pos-z'].forEach((id, idx) => {
        document.getElementById(id).onchange = () => {
            saveState();
            const axis = ['x', 'y', 'z'][idx];
            state.selectedObject.position[axis] = parseFloat(document.getElementById(id).value);
            if (selectionBox) selectionBox.update();
        };
    });

    ['scale-x', 'scale-y', 'scale-z'].forEach((id, idx) => {
        document.getElementById(id).onchange = () => {
            saveState();
            const axis = ['x', 'y', 'z'][idx];
            state.selectedObject.scale[axis] = parseFloat(document.getElementById(id).value);
            if (selectionBox) selectionBox.update();
        };
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
    }
}

export function exportMapJSON() {
    const exportData = {
        lighting: { ...state.lightingSettings },
        objects: state.placedObjects.map(o => serializeObject(o, scene))
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "map_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}