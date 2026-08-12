import * as THREE from 'three';
import { state } from './state.js';
import { scene, camera, renderer, transformControls, selectionBox, robloxScaleGizmoGroup, updateRobloxScaleGizmoPositions } from './scene.js';
import { selectObject, selectMultipleObjects, raycastSelect, getObjectsInSelectionBox, multiPivotGroup, clearMultiPivot } from './selection.js';
import { saveState, updatePropertiesUIValues, showContextMenu, hideContextMenu, showStatus, undo, redo } from './ui.js';
import { insertPrimitive, handleFileSelect, processImportedFiles } from './loaders.js';

export { undo, redo };

let isRightMouseDown = false;
let rMouseX = 0, rMouseY = 0;
let lastMouseX = 0, lastMouseY = 0;
let rMouseDownTime = 0;
let rTotalMovement = 0;
const keys = {};
let yaw = 0, pitch = 0;

let isMarqueeSelecting = false;
let marqueeStartX = 0, marqueeStartY = 0;
let isMeshDragging = false;

// Roblox Scale Gizmo Handle State
let activeRobloxScaleHandle = null;
let scaleStartObjPos = new THREE.Vector3();
let scaleStartObjScale = new THREE.Vector3();
let scaleStartSize = new THREE.Vector3();
let scaleDragPlane = new THREE.Plane();
let scaleStartHit = new THREE.Vector3();
let hoveredScaleHandle = null;

export function setTool(mode) {
    state.currentTool = mode;
    document.querySelectorAll('#header .btn').forEach(b => b.classList.remove('btn-active'));
    if (document.getElementById('tool-' + mode)) {
        document.getElementById('tool-' + mode).classList.add('btn-active');
    }

    const targetObj = state.selectedObjects.length > 1 ? multiPivotGroup : state.selectedObject;

    if (mode === 'scale') {
        if (transformControls) transformControls.detach();
        updateRobloxScaleGizmoPositions(targetObj);
        showStatus("Scale Tool Equipped");
    } else if (mode === 'select') {
        if (transformControls) transformControls.detach();
        updateRobloxScaleGizmoPositions(null);
        showStatus("Select Tool Equipped");
    } else if (targetObj && !targetObj.userData?.locked) {
        updateRobloxScaleGizmoPositions(null);
        transformControls.setMode(mode);
        transformControls.attach(targetObj);
        showStatus(mode.toUpperCase() + " Tool Equipped");
    }
}

export function updateSnapSettings() {
    if (!transformControls) return;
    const moveInput = document.getElementById('snap-move-input');
    const rotInput = document.getElementById('snap-rotate-input');

    const moveVal = moveInput ? parseFloat(moveInput.value) : 1;
    const rotVal = rotInput ? parseFloat(rotInput.value) : 15;

    transformControls.setTranslationSnap(moveVal > 0 ? moveVal : null);
    transformControls.setRotationSnap(rotVal > 0 ? THREE.MathUtils.degToRad(rotVal) : null);
    transformControls.setScaleSnap(moveVal > 0 ? moveVal * 0.5 : null);
}

export function snapSelectedToGround() {
    if (state.selectedObjects.length === 0) return;

    state.selectedObjects.forEach(obj => {
        const box = new THREE.Box3().setFromObject(obj);
        const minY = box.min.y;
        const currentY = obj.position.y;
        obj.position.y = currentY - minY;
    });

    updatePropertiesUIValues();
    if (selectionBox) selectionBox.update();
    const targetObj = state.selectedObjects.length > 1 ? multiPivotGroup : state.selectedObject;
    updateRobloxScaleGizmoPositions(targetObj);
    saveState();
    showStatus("Dropped selected to Ground");
}

export function toggleLockSelected() {
    if (!state.selectedObject) return;
    state.selectedObject.userData.locked = !state.selectedObject.userData.locked;
    selectObject(state.selectedObject);
    saveState();
    showStatus(state.selectedObject.name + (state.selectedObject.userData.locked ? " Locked" : " Unlocked"));
}

export function focusCamera() {
    if (!state.selectedObject) return;

    const box = new THREE.Box3().setFromObject(state.selectedObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = Math.max(maxDim * 2.5, 5);

    const offset = new THREE.Vector3(0, distance * 0.5, distance);
    camera.position.copy(center).add(offset);
    camera.lookAt(center);

    const dir = new THREE.Vector3().subVectors(center, camera.position).normalize();
    pitch = Math.asin(dir.y);
    yaw = Math.atan2(-dir.x, -dir.z);

    showStatus("Teleported to " + state.selectedObject.name);
}

export function deleteSelected() {
    if (state.selectedObjects.length === 0) return;
    transformControls.detach();
    if (selectionBox) selectionBox.visible = false;
    clearMultiPivot();
    updateRobloxScaleGizmoPositions(null);

    state.selectedObjects.forEach(obj => {
        scene.remove(obj);
        state.placedObjects = state.placedObjects.filter(o => o !== obj);
    });

    state.selectedObjects = [];
    state.selectedObject = null;
    saveState();
    import('./ui.js').then(m => { m.updateExplorer(); m.renderPropertiesPanel(); });
}

export function duplicateSelected() {
    if (state.selectedObjects.length === 0) return;

    const newSelection = [];
    state.selectedObjects.forEach(obj => {
        const clone = obj.clone();
        clone.name = obj.name + "_Copy";
        clone.position.x += 2;
        clone.userData = JSON.parse(JSON.stringify(obj.userData || {}));
        scene.add(clone);
        state.placedObjects.push(clone);
        newSelection.push(clone);
    });

    selectMultipleObjects(newSelection);
    saveState();
    import('./ui.js').then(m => m.updateExplorer());
    showStatus("Duplicated Selection");
}

export function groupSelected() {
    if (state.selectedObjects.length === 0) return;

    const modelGroup = new THREE.Group();
    modelGroup.name = "Model_" + (state.placedObjects.length + 1);
    modelGroup.userData = { locked: false, isUserGroup: true };

    scene.add(modelGroup);
    state.selectedObjects.forEach(obj => {
        if (obj.name !== "Baseplate") {
            modelGroup.add(obj);
            state.placedObjects = state.placedObjects.filter(o => o !== obj);
        }
    });

    state.placedObjects.push(modelGroup);
    selectMultipleObjects([modelGroup]);
    saveState();
    import('./ui.js').then(m => m.updateExplorer());
    showStatus("Grouped Models");
}

export function ungroupSelected() {
    if (!state.selectedObject || !state.selectedObject.isGroup) return;

    while (state.selectedObject.children.length > 0) {
        const child = state.selectedObject.children[0];
        scene.add(child);
        state.placedObjects.push(child);
    }

    scene.remove(state.selectedObject);
    state.placedObjects = state.placedObjects.filter(o => o !== state.selectedObject);
    selectMultipleObjects([]);

    saveState();
    import('./ui.js').then(m => { m.updateExplorer(); m.renderPropertiesPanel(); });
    showStatus("Ungrouped Model");
}

export function updateCamera() {
    if (!isRightMouseDown) return;
    const speed = keys['shift'] ? 0.08 : 0.35;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    if (keys['w']) camera.position.addScaledVector(forward, speed);
    if (keys['s']) camera.position.addScaledVector(forward, -speed);
    if (keys['a']) camera.position.addScaledVector(right, -speed);
    if (keys['d']) camera.position.addScaledVector(right, speed);
    if (keys['e']) camera.position.y += speed;
    if (keys['q']) camera.position.y -= speed;
}

export function setupControlListeners() {
    const canvasContainer = document.getElementById('canvas-container');
    const transformReadout = document.getElementById('transform-readout');
    const dragOverlay = document.getElementById('drag-overlay');
    const selectionMarquee = document.getElementById('selection-marquee');

    document.addEventListener('contextmenu', e => e.preventDefault(), false);
    window.addEventListener('click', hideContextMenu);

    window.addEventListener('dragover', (e) => { e.preventDefault(); dragOverlay.style.display = 'flex'; });
    window.addEventListener('dragleave', (e) => { if (e.clientX === 0 || e.clientY === 0) dragOverlay.style.display = 'none'; });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragOverlay.style.display = 'none';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processImportedFiles(e.dataTransfer.files);
        }
    });

    window.addEventListener('blur', () => {
        for (let k in keys) keys[k] = false;
        isRightMouseDown = false;
        isMarqueeSelecting = false;
        activeRobloxScaleHandle = null;
        if (selectionMarquee) selectionMarquee.style.display = 'none';
        if (document.pointerLockElement) document.exitPointerLock();
        document.getElementById('crosshair').style.opacity = '0';
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        if (e.button === 2) {
            isRightMouseDown = true;
            rMouseX = e.clientX;
            rMouseY = e.clientY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            rMouseDownTime = Date.now();
            rTotalMovement = 0;
            document.getElementById('crosshair').style.opacity = '1';
            try { canvasContainer.requestPointerLock(); } catch(err) {}
        } else if (e.button === 0 && !transformControls.dragging) {
            const rect = renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );

            // 1. Check if user clicked a Roblox 6-Sphere Scale Handle
            if (state.currentTool === 'scale' && robloxScaleGizmoGroup && robloxScaleGizmoGroup.visible) {
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, camera);

                const handleHits = raycaster.intersectObjects(robloxScaleGizmoGroup.children);
                if (handleHits.length > 0) {
                    const hitHandle = handleHits[0].object;
                    activeRobloxScaleHandle = hitHandle.userData.axis;

                    const targetObj = (state.selectedObjects.length > 1 && multiPivotGroup) ? multiPivotGroup : state.selectedObject;
                    if (targetObj) {
                        scaleStartObjPos.copy(targetObj.position);
                        scaleStartObjScale.copy(targetObj.scale);
                        const box = new THREE.Box3().setFromObject(targetObj);
                        box.getSize(scaleStartSize);

                        const camDir = new THREE.Vector3();
                        camera.getWorldDirection(camDir).negate();
                        scaleDragPlane.setFromNormalAndCoplanarPoint(camDir, handleHits[0].point);
                        scaleStartHit.copy(handleHits[0].point);
                    }
                    return;
                }
            }

            // 2. Otherwise raycast selected scene objects
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(state.placedObjects, true);

            if (intersects.length > 0) {
                raycastSelect(e);
                if (state.selectedObject && !state.selectedObject.userData.locked && state.selectedObject.name !== "Baseplate") {
                    isMeshDragging = true;
                }
            } else if (state.currentTool === 'select') {
                isMarqueeSelecting = true;
                marqueeStartX = e.clientX;
                marqueeStartY = e.clientY;
                selectionMarquee.style.left = marqueeStartX + 'px';
                selectionMarquee.style.top = marqueeStartY + 'px';
                selectionMarquee.style.width = '0px';
                selectionMarquee.style.height = '0px';
                selectionMarquee.style.display = 'block';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        if (state.currentTool === 'scale' && robloxScaleGizmoGroup && robloxScaleGizmoGroup.visible && !isRightMouseDown && !activeRobloxScaleHandle) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            const handleHits = raycaster.intersectObjects(robloxScaleGizmoGroup.children);

            if (handleHits.length > 0) {
                const hitMesh = handleHits[0].object;
                if (hoveredScaleHandle && hoveredScaleHandle !== hitMesh) {
                    hoveredScaleHandle.scale.set(1, 1, 1);
                }
                hoveredScaleHandle = hitMesh;
                hoveredScaleHandle.scale.set(1.4, 1.4, 1.4);
            } else if (hoveredScaleHandle) {
                hoveredScaleHandle.scale.set(1, 1, 1);
                hoveredScaleHandle = null;
            }
        }

        if (isRightMouseDown) {
            const dx = document.pointerLockElement ? e.movementX : (e.clientX - lastMouseX);
            const dy = document.pointerLockElement ? e.movementY : (e.clientY - lastMouseY);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            if (!isNaN(dx) && !isNaN(dy)) {
                rTotalMovement += Math.abs(dx) + Math.abs(dy);
                yaw -= dx * 0.0025;
                pitch -= dy * 0.0025;
                pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
                camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
            }
        } else if (activeRobloxScaleHandle) {
            const targetObj = (state.selectedObjects.length > 1 && multiPivotGroup) ? multiPivotGroup : state.selectedObject;
            if (targetObj) {
                const dragRay = new THREE.Raycaster();
                dragRay.setFromCamera(mouse, camera);

                const currentHit = new THREE.Vector3();
                if (dragRay.ray.intersectPlane(scaleDragPlane, currentHit)) {
                    const moveSnap = parseFloat(document.getElementById('snap-move-input')?.value || 1);
                    const deltaVec = currentHit.clone().sub(scaleStartHit);

                    const isShift = keys['shift'] || e.shiftKey; // Shift Key for Proportional Scaling!

                    let deltaVal = 0;
                    let mainAxis = 'X';

                    if (activeRobloxScaleHandle === 'PX') { deltaVal = deltaVec.x; mainAxis = 'X'; }
                    else if (activeRobloxScaleHandle === 'NX') { deltaVal = -deltaVec.x; mainAxis = 'X'; }
                    else if (activeRobloxScaleHandle === 'PY') { deltaVal = deltaVec.y; mainAxis = 'Y'; }
                    else if (activeRobloxScaleHandle === 'NY') { deltaVal = -deltaVec.y; mainAxis = 'Y'; }
                    else if (activeRobloxScaleHandle === 'PZ') { deltaVal = deltaVec.z; mainAxis = 'Z'; }
                    else if (activeRobloxScaleHandle === 'NZ') { deltaVal = -deltaVec.z; mainAxis = 'Z'; }

                    let newSizeX = scaleStartSize.x;
                    let newSizeY = scaleStartSize.y;
                    let newSizeZ = scaleStartSize.z;

                    let posOffsetX = 0, posYOffset = 0, posOffsetZ = 0;

                    if (isShift) {
                        // Shift Key: Proportional Uniform Scale across ALL 3 axes!
                        const baseSize = scaleStartSize[mainAxis.toLowerCase()] || 1;
                        const scaleFactor = Math.max(0.1, (baseSize + deltaVal) / baseSize);

                        newSizeX = Math.max(0.2, scaleStartSize.x * scaleFactor);
                        newSizeY = Math.max(0.2, scaleStartSize.y * scaleFactor);
                        newSizeZ = Math.max(0.2, scaleStartSize.z * scaleFactor);

                        const signMultiplier = activeRobloxScaleHandle.includes('N') ? -1 : 1;
                        posOffsetX = (newSizeX - scaleStartSize.x) * 0.5 * (activeRobloxScaleHandle.includes('X') ? signMultiplier : 0);
                        posYOffset = (newSizeY - scaleStartSize.y) * 0.5 * (activeRobloxScaleHandle.includes('Y') ? signMultiplier : 0);
                        posOffsetZ = (newSizeZ - scaleStartSize.z) * 0.5 * (activeRobloxScaleHandle.includes('Z') ? signMultiplier : 0);
                    } else {
                        // Single-Axis Non-Uniform Stretch
                        if (mainAxis === 'X') {
                            newSizeX = Math.max(0.2, scaleStartSize.x + deltaVal);
                            if (moveSnap > 0) newSizeX = Math.round(newSizeX / moveSnap) * moveSnap;
                            posOffsetX = (newSizeX - scaleStartSize.x) * 0.5 * (activeRobloxScaleHandle === 'NX' ? -1 : 1);
                        } else if (mainAxis === 'Y') {
                            newSizeY = Math.max(0.2, scaleStartSize.y + deltaVal);
                            if (moveSnap > 0) newSizeY = Math.round(newSizeY / moveSnap) * moveSnap;
                            posYOffset = (newSizeY - scaleStartSize.y) * 0.5 * (activeRobloxScaleHandle === 'NY' ? -1 : 1);
                        } else if (mainAxis === 'Z') {
                            newSizeZ = Math.max(0.2, scaleStartSize.z + deltaVal);
                            if (moveSnap > 0) newSizeZ = Math.round(newSizeZ / moveSnap) * moveSnap;
                            posOffsetZ = (newSizeZ - scaleStartSize.z) * 0.5 * (activeRobloxScaleHandle === 'NZ' ? -1 : 1);
                        }
                    }

                    const ratioX = newSizeX / scaleStartSize.x;
                    const ratioY = newSizeY / scaleStartSize.y;
                    const ratioZ = newSizeZ / scaleStartSize.z;

                    targetObj.scale.set(
                        scaleStartObjScale.x * ratioX,
                        scaleStartObjScale.y * ratioY,
                        scaleStartObjScale.z * ratioZ
                    );

                    targetObj.position.set(
                        scaleStartObjPos.x + posOffsetX,
                        scaleStartObjPos.y + posYOffset,
                        scaleStartObjPos.z + posOffsetZ
                    );

                    updateRobloxScaleGizmoPositions(targetObj);
                    updatePropertiesUIValues();
                    if (selectionBox) selectionBox.update();

                    if (transformReadout) {
                        transformReadout.style.display = 'block';
                        transformReadout.innerText = `📏 Size: ${newSizeX.toFixed(1)} x ${newSizeY.toFixed(1)} x ${newSizeZ.toFixed(1)} Studs [${isShift ? 'Proportional' : activeRobloxScaleHandle}]`;
                    }
                }
            }
        } else if (isMarqueeSelecting) {
            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(marqueeStartX, currentX);
            const top = Math.min(marqueeStartY, currentY);
            const width = Math.abs(currentX - marqueeStartX);
            const height = Math.abs(currentY - marqueeStartY);

            selectionMarquee.style.left = left + 'px';
            selectionMarquee.style.top = top + 'px';
            selectionMarquee.style.width = width + 'px';
            selectionMarquee.style.height = height + 'px';
        } else if (isMeshDragging && (state.selectedObject || multiPivotGroup)) {
            const targetToDrag = (state.selectedObjects.length > 1 && multiPivotGroup) ? multiPivotGroup : state.selectedObject;
            if (targetToDrag && !targetToDrag.userData?.locked && targetToDrag.name !== "Baseplate") {
                const dragRay = new THREE.Raycaster();
                dragRay.setFromCamera(mouse, camera);

                const targets = state.placedObjects.filter(o => !state.selectedObjects.includes(o) && o !== targetToDrag);
                const intersects = dragRay.intersectObjects(targets, true);

                const moveVal = parseFloat(document.getElementById('snap-move-input')?.value || 1);

                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const box = new THREE.Box3().setFromObject(targetToDrag);
                    const heightOffset = targetToDrag.position.y - box.min.y;

                    let posX = hit.point.x;
                    let posZ = hit.point.z;
                    let posY = hit.point.y + heightOffset;

                    if (moveVal > 0) {
                        posX = Math.round(posX / moveVal) * moveVal;
                        posZ = Math.round(posZ / moveVal) * moveVal;
                    }

                    targetToDrag.position.set(posX, posY, posZ);
                } else {
                    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                    const target = new THREE.Vector3();
                    if (dragRay.ray.intersectPlane(plane, target)) {
                        const box = new THREE.Box3().setFromObject(targetToDrag);
                        const heightOffset = targetToDrag.position.y - box.min.y;

                        let posX = target.x;
                        let posZ = target.z;
                        let posY = heightOffset;

                        if (moveVal > 0) {
                            posX = Math.round(posX / moveVal) * moveVal;
                            posZ = Math.round(posZ / moveVal) * moveVal;
                        }

                        targetToDrag.position.set(posX, posY, posZ);
                    }
                }

                updatePropertiesUIValues();
                if (selectionBox) selectionBox.update();
            }
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            const wasScaling = (activeRobloxScaleHandle !== null);
            const wasDragging = isMeshDragging;

            if (activeRobloxScaleHandle) {
                activeRobloxScaleHandle = null;
                if (transformReadout) transformReadout.style.display = 'none';
            }
            if (isMarqueeSelecting) {
                isMarqueeSelecting = false;
                selectionMarquee.style.display = 'none';

                const currentX = e.clientX;
                const currentY = e.clientY;
                const left = Math.min(marqueeStartX, currentX);
                const top = Math.min(marqueeStartY, currentY);
                const width = Math.abs(currentX - marqueeStartX);
                const height = Math.abs(currentY - marqueeStartY);

                if (width > 10 && height > 10) {
                    const foundObjects = getObjectsInSelectionBox(left, top, width, height);
                    const isShift = e.shiftKey || keys['shift'];

                    if (foundObjects.length > 0) {
                        if (isShift) {
                            const combined = [...state.selectedObjects];
                            foundObjects.forEach(obj => {
                                if (!combined.includes(obj)) combined.push(obj);
                            });
                            selectMultipleObjects(combined);
                        } else {
                            selectMultipleObjects(foundObjects);
                        }
                    } else if (!isShift) {
                        selectMultipleObjects([]);
                    }
                }
            }
            isMeshDragging = false;

            // Save state when scaling or dragging is successfully committed
            if (wasScaling || wasDragging) {
                saveState();
            }
        } else if (e.button === 2) {
            isRightMouseDown = false;
            for (let k in keys) keys[k] = false;
            if (document.pointerLockElement) document.exitPointerLock();
            document.getElementById('crosshair').style.opacity = '0';

            const holdDuration = Date.now() - rMouseDownTime;
            if (holdDuration < 220 && rTotalMovement < 10) {
                raycastSelect(e);
                showContextMenu(e.clientX, e.clientY);
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

        // Prevent standard repeat triggers on held keydown for Undo/Redo commands
        if (e.repeat && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            e.preventDefault();
            return;
        }

        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Shift') keys['shift'] = true;

        if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }

        if (e.key.toLowerCase() === 'f') { focusCamera(); }
        if (e.ctrlKey && e.key === '1') { setTool('select'); }
        if (e.ctrlKey && e.key === '2') { setTool('translate'); }
        if (e.ctrlKey && e.key === '3') { setTool('scale'); }
        if (e.ctrlKey && e.key === '4') { setTool('rotate'); }

        if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelected(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); ungroupSelected(); }

        if (e.key === 't' || e.key === 'T') setTool('translate');
        if (e.key === 'r' || e.key === 'R') setTool('rotate');
        if (e.key === 'e' || e.key === 'E') setTool('scale');
        if (e.key === 'Delete') deleteSelected();
    });

    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
        if (e.key === 'Shift') keys['shift'] = false;
    });

    window.addEventListener('resize', () => {
        import('./scene.js').then(m => m.onWindowResize());
    });

    document.getElementById('file-input-folder').addEventListener('change', handleFileSelect);
    document.getElementById('file-input-files').addEventListener('change', handleFileSelect);
    document.getElementById('snap-move-input').addEventListener('input', updateSnapSettings);
    document.getElementById('snap-rotate-input').addEventListener('input', updateSnapSettings);
}