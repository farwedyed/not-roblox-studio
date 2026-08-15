import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Model } from './Instance.js';

export class SelectionService {
    constructor(engine) {
        this.engine = engine;
        this.selectedMeshes = [];
        this.selectionHelpers = [];
        this.transformControls = null;
        this.currentTool = 'select';
        this.blockNextClick = false;

        this.isDraggingMesh = false;
        this.draggedMesh = null;
        this.draggedOffsetsCaptured = false;

        this.initialPrimaryPos = null;
        this.initialPrimaryRot = null;
        this.initialPrimaryScale = null;
        this.initialTransforms = null;
        this.initialDragPrimaryPos = null;
        this.initialDragOffsets = null;
        this.clipboard = null;
        this.sphereGeom = new THREE.SphereGeometry(0.14, 16, 16);
    }

    init(camera, domElement, scene) {
        this.transformControls = new TransformControls(camera, domElement);
        this.transformControls.setTranslationSnap(1.0);
        this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
        
        const overlay = this.engine.rendererService.overlayScene || scene;
        overlay.add(this.transformControls);

        this.transformControls.addEventListener('change', () => {
            this.customizeGizmoHandles();
            this.updateHandleHoverEffects();
        });

        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (event.value) {
                this.blockNextClick = true;
                this.isDraggingMesh = false;
                this.draggedMesh = null;
                this.draggedOffsetsCaptured = false;
                this.engine.history.saveState();
                this.captureInitialSelectedTransforms();
            } else {
                setTimeout(() => { this.blockNextClick = false; }, 50);
            }
        });

        this.transformControls.addEventListener('objectChange', () => {
            const activeObj = this.transformControls.object;
            if (activeObj && activeObj.userData.instance) {
                const instance = activeObj.userData.instance;
                this.resolvePartStacking(activeObj);

                if (this.transformControls.mode === 'scale' && this.engine.keys.shift && this.initialPrimaryScale) {
                    const curScale = activeObj.scale;
                    const initScale = this.initialPrimaryScale;

                    let ratio = 1.0;
                    const dx = Math.abs(curScale.x - initScale.x);
                    const dy = Math.abs(curScale.y - initScale.y);
                    const dz = Math.abs(curScale.z - initScale.z);

                    if (dx >= dy && dx >= dz && initScale.x !== 0) {
                        ratio = curScale.x / initScale.x;
                    } else if (dy >= dx && dy >= dz && initScale.y !== 0) {
                        ratio = curScale.y / initScale.y;
                    } else if (dz >= dx && dz >= dy && initScale.z !== 0) {
                        ratio = curScale.z / initScale.z;
                    }

                    if (ratio > 0) {
                        activeObj.scale.set(
                            initScale.x * ratio,
                            initScale.y * ratio,
                            initScale.z * ratio
                        );
                    }
                }

                instance.Position.copy(activeObj.position);
                if (instance.Size) instance.Size.copy(activeObj.scale);
                instance.updateTransform?.();

                if (this.selectedMeshes.length > 1 && this.initialPrimaryPos && this.initialTransforms) {
                    const deltaPos = activeObj.position.clone().sub(this.initialPrimaryPos);
                    const deltaRot = activeObj.quaternion.clone().multiply(this.initialPrimaryRot.clone().invert());

                    const scaleRatioX = this.initialPrimaryScale.x !== 0 ? activeObj.scale.x / this.initialPrimaryScale.x : 1;
                    const scaleRatioY = this.initialPrimaryScale.y !== 0 ? activeObj.scale.y / this.initialPrimaryScale.y : 1;
                    const scaleRatioZ = this.initialPrimaryScale.z !== 0 ? activeObj.scale.z / this.initialPrimaryScale.z : 1;

                    for (const mesh of this.selectedMeshes) {
                        if (mesh === activeObj) continue;
                        const initTrans = this.initialTransforms.get(mesh);
                        if (!initTrans) continue;
                        const otherInstance = mesh.userData.instance;
                        if (!otherInstance) continue;

                        if (this.transformControls.mode === 'translate') {
                            mesh.position.copy(initTrans.position).add(deltaPos);
                        } else if (this.transformControls.mode === 'rotate') {
                            const offset = initTrans.position.clone().sub(this.initialPrimaryPos);
                            offset.applyQuaternion(deltaRot);
                            mesh.position.copy(this.initialPrimaryPos).add(offset).add(deltaPos);
                            mesh.quaternion.copy(deltaRot).multiply(initTrans.quaternion);
                        } else if (this.transformControls.mode === 'scale') {
                            mesh.scale.set(initTrans.scale.x * scaleRatioX, initTrans.scale.y * scaleRatioY, initTrans.scale.z * scaleRatioZ);
                            const offset = initTrans.position.clone().sub(this.initialPrimaryPos);
                            offset.x *= scaleRatioX;
                            offset.y *= scaleRatioY;
                            offset.z *= scaleRatioZ;
                            mesh.position.copy(this.initialPrimaryPos).add(offset);
                        }

                        if (otherInstance.Position) otherInstance.Position.copy(mesh.position);
                        if (otherInstance.Size) otherInstance.Size.copy(mesh.scale);
                        otherInstance.updateTransform?.();
                    }
                }

                this.updateSelectionOutlines();
                this.engine.ui.refreshProperties();
            }
        });
    }

    customizeGizmoHandles() {
        if (!this.transformControls) return;

        this.transformControls.traverse((child) => {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    mat.depthTest = false;
                    mat.depthWrite = false;
                    mat.transparent = true;
                    mat.opacity = 1.0;
                });
            }
            child.renderOrder = 99999;

            if (child.isMesh && child.name) {
                const nameLower = child.name.toLowerCase();
                if (nameLower.includes('scale')) {
                    child.geometry = this.sphereGeom;
                }
            }
        });
    }

    updateHandleHoverEffects() {
        if (!this.transformControls) return;
        const activeAxis = this.transformControls.axis;

        this.transformControls.traverse((child) => {
            if (child.isMesh && child.name && child.name.toLowerCase().includes('scale')) {
                const isMatch = activeAxis && child.name.toUpperCase().includes(activeAxis.toUpperCase());
                if (isMatch) {
                    child.scale.set(1.6, 1.6, 1.6);
                } else {
                    child.scale.set(1.0, 1.0, 1.0);
                }
            }
        });
    }

    captureInitialSelectedTransforms() {
        const activeObj = this.transformControls.object;
        if (!activeObj) return;

        this.initialPrimaryPos = activeObj.position.clone();
        this.initialPrimaryRot = activeObj.quaternion.clone();
        this.initialPrimaryScale = activeObj.scale.clone();

        this.initialTransforms = new Map();
        for (const mesh of this.selectedMeshes) {
            if (mesh === activeObj) continue;
            this.initialTransforms.set(mesh, {
                position: mesh.position.clone(),
                quaternion: mesh.quaternion.clone(),
                scale: mesh.scale.clone()
            });
        }
    }

    resolvePartStacking(activeObj) {
        const activeBox = new THREE.Box3().setFromObject(activeObj);
        const yOffset = activeObj.position.y - activeBox.min.y;

        if (activeBox.min.y < 0) {
            activeObj.position.y = 0 + yOffset;
            activeBox.setFromObject(activeObj); 
        }

        for (const mesh of this.engine.collidableMeshes) {
            if (mesh === activeObj) continue;

            const meshBox = new THREE.Box3().setFromObject(mesh);
            const overlapX = activeBox.min.x < meshBox.max.x && activeBox.max.x > meshBox.min.x;
            const overlapZ = activeBox.min.z < meshBox.max.z && activeBox.max.z > meshBox.min.z;

            if (overlapX && overlapZ) {
                const topOfOtherPart = meshBox.max.y;
                const bottomOfActivePart = activeBox.min.y;

                if (bottomOfActivePart < topOfOtherPart && activeObj.position.y > mesh.position.y) {
                    activeObj.position.y = topOfOtherPart + yOffset;
                    activeBox.setFromObject(activeObj); 
                }
            }
        }
    }

    updateSelectionOutlines() {
        const overlay = this.engine.rendererService.overlayScene || this.engine.scene;
        for (const helper of this.selectionHelpers) {
            overlay.remove(helper);
        }
        this.selectionHelpers = [];

        for (const mesh of this.selectedMeshes) {
            const helper = new THREE.BoxHelper(mesh, 0x00ff00);
            overlay.add(helper);
            this.selectionHelpers.push(helper);
        }
    }

    refreshMultiSelection() {
        this.updateSelectionOutlines();

        if (this.selectedMeshes.length > 0) {
            const primaryMesh = this.selectedMeshes[this.selectedMeshes.length - 1];
            if (this.currentTool !== 'select') {
                this.transformControls.attach(primaryMesh);
                this.customizeGizmoHandles();
            } else {
                this.transformControls.detach();
            }
        } else {
            this.transformControls.detach();
        }
    }

    selectPart(instance) {
        if (instance && (instance.ClassName === "Part" || instance.ClassName === "LightBlock" || instance.ClassName === "SpawnLocation" || instance.ClassName === "Terrain" || instance.ClassName === "Water")) {
            this.selectedMeshes = [instance.mesh];
            this.refreshMultiSelection();
        } else {
            this.selectedMeshes = [];
            this.refreshMultiSelection();
        }
    }

    selectMultipleParts(instances) {
        this.selectedMeshes = [];
        for (const inst of instances) {
            if (inst && inst.mesh) {
                this.selectedMeshes.push(inst.mesh);
            }
        }
        this.refreshMultiSelection();
    }

    groupSelected() {
        if (this.selectedMeshes.length === 0) return;
        this.engine.history.saveState();

        const model = new Model();
        model.Name = "Model";

        const workspace = window.game.children.find(c => c.Name === "Workspace");
        model.Parent = workspace;

        for (const mesh of [...this.selectedMeshes]) {
            const inst = mesh.userData.instance;
            inst.Parent = model; 
        }

        this.engine.ui.selectInstance(model);
        this.engine.logToConsole("Grouped selections into Model", "success");
    }

    ungroupSelected() {
        const inst = this.engine.ui.selectedInstance;
        if (inst && inst.ClassName === "Model") {
            this.engine.history.saveState();
            const parent = inst.Parent;

            for (const child of [...inst.children]) {
                child.Parent = parent; 
            }

            inst.Destroy();
            this.engine.ui.selectInstance(null);
            this.engine.logToConsole("Ungrouped model", "warning");
        }
    }

    startMarqueeSelection(e) {
        e.preventDefault();
        e.stopPropagation();

        const container = document.getElementById('canvas-container');
        const rect = this.engine.renderer.domElement.getBoundingClientRect();

        const startX = e.clientX;
        const startY = e.clientY;

        const div = document.createElement('div');
        div.style.cssText = `border: 1.5px dashed #0098ff; background-color: rgba(0, 152, 255, 0.12); position: absolute; pointer-events: none; z-index: 10000; left: ${startX - rect.left}px; top: ${startY - rect.top}px; width: 0px; height: 0px;`;
        container.appendChild(div);

        const onMouseMove = (moveEvent) => {
            const currentX = moveEvent.clientX;
            const currentY = moveEvent.clientY;

            const left = Math.min(startX, currentX) - rect.left;
            const top = Math.min(startY, currentY) - rect.top;
            const width = Math.abs(startX - currentX);
            const height = Math.abs(startY - currentY);

            div.style.left = `${left}px`;
            div.style.top = `${top}px`;
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;

            const minX = Math.min(startX, currentX) - rect.left;
            const maxX = Math.max(startX, currentX) - rect.left;
            const minY = Math.min(startY, currentY) - rect.top;
            const maxY = Math.max(startY, currentY) - rect.top;

            const selectedInstances = [];
            for (const mesh of this.engine.collidableMeshes) {
                const instance = mesh.userData.instance;
                if (!instance || instance.Locked) continue;

                const meshCenter = new THREE.Vector3();
                const bbox = new THREE.Box3().setFromObject(mesh);
                bbox.getCenter(meshCenter);
                meshCenter.project(this.engine.camera);

                const px = (meshCenter.x * 0.5 + 0.5) * rect.width;
                const py = (-meshCenter.y * 0.5 + 0.5) * rect.height;

                if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                    selectedInstances.push(instance);
                }
            }

            this.engine.ui.selectedInstances = selectedInstances;
            this.selectedMeshes = selectedInstances.map(inst => inst.mesh);
            this.updateSelectionOutlines();
            this.engine.ui.refreshExplorer();
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            div.remove();

            this.engine.ui.refreshProperties();
            this.refreshMultiSelection();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }
}