import * as THREE from 'three';
import { state } from './state.js';
import { scene, camera, transformControls, selectionBox, updateRobloxScaleGizmoPositions } from './scene.js';
import { updateExplorerUI, renderPropertiesPanel } from './ui.js';

export let multiPivotGroup = null;

export function clearMultiPivot() {
    if (multiPivotGroup) {
        while (multiPivotGroup.children.length > 0) {
            const child = multiPivotGroup.children[0];
            let origParent = child.userData.originalParent;
            delete child.userData.originalParent;

            // Validate that original parent is still present in the scene
            let parentValid = false;
            let check = origParent;
            while (check) {
                if (check === scene) {
                    parentValid = true;
                    break;
                }
                check = check.parent;
            }

            if (parentValid && origParent && origParent !== scene) {
                origParent.attach(child);
            } else {
                scene.attach(child);
                // Ensure root-level objects are kept inside tracking array
                if (!state.placedObjects.includes(child)) {
                    state.placedObjects.push(child);
                }
            }
        }
        scene.remove(multiPivotGroup);
        multiPivotGroup = null;
    }
}

export function setupMultiPivot(objectsArray) {
    clearMultiPivot();
    if (objectsArray.length <= 1) return;

    const box = new THREE.Box3();
    objectsArray.forEach(o => box.expandByObject(o));
    const center = box.getCenter(new THREE.Vector3());

    multiPivotGroup = new THREE.Group();
    multiPivotGroup.name = "TempMultiPivot";
    multiPivotGroup.position.copy(center);
    scene.add(multiPivotGroup);

    objectsArray.forEach(o => {
        if (o.parent && o.parent !== multiPivotGroup) {
            // Save original group or scene parent reference
            o.userData.originalParent = o.parent;
            multiPivotGroup.attach(o);
        }
    });
}

export function selectMultipleObjects(objectsArray) {
    state.isLightingSelected = false;
    state.selectedObjects = objectsArray.filter(o => o !== null && o !== undefined);
    state.selectedObject = state.selectedObjects[state.selectedObjects.length - 1] || null;

    clearMultiPivot();

    if (state.selectedObjects.length === 1) {
        if (selectionBox) {
            selectionBox.setFromObject(state.selectedObjects[0]);
            selectionBox.visible = true;
        }

        if (state.selectedObject && !state.selectedObject.userData.locked && state.currentTool !== 'select' && state.currentTool !== 'scale') {
            transformControls.setMode(state.currentTool);
            transformControls.attach(state.selectedObject);
        } else {
            transformControls.detach();
        }
    } else if (state.selectedObjects.length > 1) {
        const unlocked = state.selectedObjects.filter(o => !o.userData.locked);
        if (unlocked.length > 1) {
            setupMultiPivot(unlocked);
            if (selectionBox) {
                selectionBox.setFromObject(multiPivotGroup);
                selectionBox.visible = true;
            }
            if (state.currentTool !== 'select' && state.currentTool !== 'scale') {
                transformControls.setMode(state.currentTool);
                transformControls.attach(multiPivotGroup);
            } else {
                transformControls.detach();
            }
        } else if (unlocked.length === 1) {
            if (selectionBox) {
                selectionBox.setFromObject(unlocked[0]);
                selectionBox.visible = true;
            }
            if (state.currentTool !== 'select' && state.currentTool !== 'scale') {
                transformControls.setMode(state.currentTool);
                transformControls.attach(unlocked[0]);
            } else {
                transformControls.detach();
            }
        } else {
            if (selectionBox) selectionBox.visible = false;
            transformControls.detach();
        }
    } else {
        if (selectionBox) selectionBox.visible = false;
        transformControls.detach();
    }

    const activeTarget = state.selectedObjects.length > 1 ? multiPivotGroup : state.selectedObject;
    updateRobloxScaleGizmoPositions(activeTarget);

    updateExplorerUI();
    renderPropertiesPanel();
}

export function selectObject(obj, isShiftPressed = false) {
    if (!obj) {
        selectMultipleObjects([]);
        return;
    }

    if (isShiftPressed) {
        const combined = [...state.selectedObjects];
        const idx = combined.indexOf(obj);
        if (idx > -1) combined.splice(idx, 1);
        else combined.push(obj);
        selectMultipleObjects(combined);
    } else {
        selectMultipleObjects([obj]);
    }
}

export function selectLightingService() {
    state.selectedObjects = [];
    state.selectedObject = null;
    state.isLightingSelected = true;
    if (selectionBox) selectionBox.visible = false;
    if (transformControls) transformControls.detach();
    updateRobloxScaleGizmoPositions(null);
    updateExplorerUI();
    renderLightingProperties();
}

export function getObjectsInSelectionBox(left, top, width, height) {
    const right = left + width;
    const bottom = top + height;
    const canvasContainer = document.getElementById('canvas-container');
    const rect = canvasContainer.getBoundingClientRect();

    const found = [];
    const tempVec = new THREE.Vector3();

    state.placedObjects.forEach(obj => {
        if (obj.name === "Baseplate" || obj.userData.locked) return;

        const box = new THREE.Box3().setFromObject(obj);
        box.getCenter(tempVec);
        tempVec.project(camera);

        const screenX = ((tempVec.x + 1) / 2) * rect.width + rect.left;
        const screenY = ((-tempVec.y + 1) / 2) * rect.height + rect.top;

        if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) {
            found.push(obj);
        }
    });

    return found;
}

export function raycastSelect(e) {
    const canvasContainer = document.getElementById('canvas-container');
    const rect = canvasContainer.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(state.placedObjects, true);

    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && obj.parent !== scene && obj.parent.name !== "TempMultiPivot") obj = obj.parent;
        selectObject(obj, e.shiftKey);
    } else {
        if (!e.shiftKey) selectMultipleObjects([]);
    }
}