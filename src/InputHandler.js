import * as THREE from 'three';
import { Part, LightBlock, SpawnLocation, Water, Terrain, Script, LocalScript, Model, PointLight, SpotLight, Player } from './Instance.js';

export class InputHandler {
    constructor(engine) {
        this.engine = engine;
    }

    setupControlEvents() {
        window.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });
        this.engine.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });

        document.addEventListener('click', () => {
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu) contextMenu.style.display = 'none';
        });

        const ribbonFileBtn = document.getElementById('ribbon-file-btn');
        const fileDropdownMenu = document.getElementById('file-dropdown-menu');

        if (ribbonFileBtn && fileDropdownMenu) {
            ribbonFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileDropdownMenu.style.display = fileDropdownMenu.style.display === 'flex' ? 'none' : 'flex';
            });
            document.addEventListener('click', () => { fileDropdownMenu.style.display = 'none'; });
        }

        document.getElementById('menu-file-new')?.addEventListener('click', () => document.getElementById('card-baseplate')?.click());
        document.getElementById('menu-file-open')?.addEventListener('click', () => document.getElementById('local-project-file-importer')?.click());
        document.getElementById('menu-file-save')?.addEventListener('click', () => this.engine.saveService.quickSave());
        document.getElementById('menu-file-save-as')?.addEventListener('click', () => this.engine.saveService.saveAs());
        document.getElementById('menu-file-publish')?.addEventListener('click', () => this.engine.saveService.saveCloud(this.engine.activeProjectName));
        document.getElementById('menu-file-close')?.addEventListener('click', () => document.getElementById('btn-close-project')?.click());

        // Command Bar with Instance.new("Player") Support
        const cmdBar = document.getElementById('command-bar');
        cmdBar?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = cmdBar.value;
                cmdBar.value = '';
                this.engine.logToConsole(`> ${cmd}`, 'info');

                try {
                    const context = {
                        game: window.game,
                        Instance: {
                            new: (className) => {
                                let inst;
                                if (className === "Part") inst = new Part();
                                else if (className === "LightBlock" || className === "Light") inst = new LightBlock();
                                else if (className === "SpawnLocation") inst = new SpawnLocation();
                                else if (className === "Water") inst = new Water();
                                else if (className === "Terrain") inst = new Terrain();
                                else if (className === "Script") inst = new Script();
                                else if (className === "LocalScript") inst = new LocalScript();
                                else if (className === "Model") inst = new Model();
                                else if (className === "PointLight") inst = new PointLight();
                                else if (className === "SpotLight") inst = new SpotLight();
                                else if (className === "Player") {
                                    const playersFolder = window.game.children.find(c => c.Name === "Players" || c.ClassName === "Players");
                                    const count = playersFolder ? playersFolder.children.length + 1 : 1;
                                    inst = new Player(`Player${count}`);
                                }
                                
                                if (inst) {
                                    const parentTarget = className === "Player" ? 
                                        window.game.children.find(c => c.Name === "Players" || c.ClassName === "Players") : 
                                        window.game.children.find(c => c.Name === "Workspace");
                                    
                                    inst.Parent = parentTarget;
                                    this.engine.logToConsole(`Instance: Created new ${className}.`, 'success');
                                    return inst;
                                }
                                return null;
                            }
                        },
                        print: (...args) => this.engine.logToConsole(args.join(' '), 'info'),
                        clear: () => { document.getElementById('console-output').innerHTML = ''; }
                    };

                    new Function(...Object.keys(context), cmd)(...Object.values(context));
                } catch (err) {
                    this.engine.logToConsole(err.message, 'error');
                }
            }
        });

        document.getElementById('input-snap-studs')?.addEventListener('change', (e) => {
            this.engine.selection.transformControls.setTranslationSnap(parseFloat(e.target.value) || 0);
        });

        document.getElementById('input-snap-deg')?.addEventListener('change', (e) => {
            this.engine.selection.transformControls.setRotationSnap(THREE.MathUtils.degToRad(parseFloat(e.target.value) || 0));
        });

        document.getElementById('menu-copy')?.addEventListener('click', () => {
            const inst = this.engine.ui.selectedInstances[0];
            if (inst) {
                this.engine.selection.clipboard = this.engine.history.serializeInstance(inst);
                this.engine.logToConsole(`Copied: ${inst.Name} to clipboard.`, 'info');
            }
        });

        document.getElementById('menu-paste')?.addEventListener('click', () => {
            if (this.engine.selection.clipboard) {
                this.engine.history.saveState();
                const parent = this.engine.ui.selectedInstances[0] || window.game.children.find(c => c.Name === "Workspace");
                const newPartData = JSON.parse(JSON.stringify(this.engine.selection.clipboard)); 
                if (newPartData.ClassName === "Part" || newPartData.ClassName === "LightBlock" || newPartData.ClassName === "SpawnLocation") newPartData.Position.x += 4; 
                this.engine.history.loadStateIntoFolder({ children: [newPartData] }, parent);
                this.engine.logToConsole(`Pasted: ${newPartData.Name} under ${parent.Name}.`, 'success');
            }
        });

        document.getElementById('menu-duplicate')?.addEventListener('click', () => {
            const inst = this.engine.ui.selectedInstances[0];
            if (inst && inst.Parent) {
                this.engine.history.saveState();
                const serialized = this.engine.history.serializeInstance(inst);
                serialized.Name += "_Copy";
                if (serialized.ClassName === "Part" || serialized.ClassName === "LightBlock" || serialized.ClassName === "SpawnLocation") serialized.Position.x += 4;
                this.engine.history.loadStateIntoFolder({ children: [serialized] }, inst.Parent);
                this.engine.logToConsole(`Duplicated: ${inst.Name}`, 'success');
            }
        });

        document.getElementById('menu-delete')?.addEventListener('click', () => {
            this.engine.ui.selectedInstances.forEach(inst => {
                this.engine.logToConsole(`Deleted: ${inst.Name}`, 'warning');
                inst.Destroy();
            });
            this.engine.history.saveState();
            this.engine.ui.selectInstance(null);
        });

        document.getElementById('menu-rename')?.addEventListener('click', () => {
            const inst = this.engine.ui.selectedInstances[0];
            if (inst) {
                const newName = prompt("Rename:", inst.Name);
                if (newName) {
                    this.engine.history.saveState();
                    inst.Name = newName;
                    window.dispatchEvent(new CustomEvent('explorer-changed'));
                    this.engine.ui.refreshProperties();
                }
            }
        });

        document.getElementById('btn-tool-lock')?.addEventListener('click', () => {
            if (this.engine.ui.selectedInstances.length === 0) return;
            const targetState = !this.engine.ui.selectedInstances.every(i => i.Locked === true);
            this.engine.ui.selectedInstances.forEach(inst => {
                if (["Part", "LightBlock", "SpawnLocation", "Terrain", "Water"].includes(inst.ClassName)) inst.Locked = targetState;
            });
            this.engine.ui.refreshExplorer();
            this.engine.ui.refreshProperties();
            this.engine.ui.updateToolbarStates();
        });

        document.getElementById('btn-tool-anchor')?.addEventListener('click', () => {
            if (this.engine.ui.selectedInstances.length === 0) return;
            const targetState = !this.engine.ui.selectedInstances.every(i => i.Anchored === true);
            this.engine.ui.selectedInstances.forEach(inst => {
                if (["Part", "LightBlock", "SpawnLocation", "Terrain", "Water"].includes(inst.ClassName)) inst.Anchored = targetState;
            });
            this.engine.ui.refreshExplorer();
            this.engine.ui.refreshProperties();
            this.engine.ui.updateToolbarStates();
        });

        document.getElementById('btn-play')?.addEventListener('click', () => this.engine.playtest.startPlaytest());
        document.getElementById('btn-pause')?.addEventListener('click', () => this.engine.playtest.togglePausePlaytest());
        document.getElementById('btn-stop')?.addEventListener('click', () => this.engine.playtest.stopPlaytest());

        // Escape Menu Buttons
        document.getElementById('menu-btn-resume')?.addEventListener('click', () => this.engine.playtest.togglePauseMenu());
        document.getElementById('menu-btn-reset')?.addEventListener('click', () => {
            this.engine.playtest.togglePauseMenu();
            this.engine.playtest.resetCharacter();
        });
        document.getElementById('menu-btn-leave')?.addEventListener('click', () => {
            this.engine.playtest.togglePauseMenu();
            this.engine.playtest.stopPlaytest();
        });

        document.getElementById('btn-save')?.addEventListener('click', () => this.engine.saveService.quickSave());
        document.getElementById('btn-save-as')?.addEventListener('click', () => this.engine.saveService.saveAs());
        document.getElementById('btn-publish')?.addEventListener('click', () => {
            const name = prompt("Enter experience name to upload to Cloud:", this.engine.activeProjectName || "My Roblox Place");
            if (name) this.engine.saveService.saveCloud(name, () => this.engine.saveService.updateTitleBar(name));
        });

        document.getElementById('btn-close-project')?.addEventListener('click', () => {
            if (confirm("Are you sure you want to close this place and return to Studio Hub? Unsaved progress will be lost.")) {
                document.getElementById('studio-hub').style.display = 'flex';
                document.getElementById('studio-container').style.display = 'none';
                this.engine.ui.selectInstance(null);
                this.engine.playtest.stopPlaytest();
            }
        });

        const btnSelect = document.getElementById('btn-tool-select');
        const btnMove = document.getElementById('btn-tool-move');
        const btnScale = document.getElementById('btn-tool-scale');
        const btnRotate = document.getElementById('btn-tool-rotate');

        const setActiveToolBtn = (activeBtn) => {
            [btnSelect, btnMove, btnScale, btnRotate].forEach(btn => btn?.classList.remove('active'));
            activeBtn?.classList.add('active');
        };

        btnSelect?.addEventListener('click', () => {
            setActiveToolBtn(btnSelect);
            this.engine.selection.currentTool = 'select';
            this.engine.selection.transformControls.detach(); 
        });

        btnMove?.addEventListener('click', () => {
            setActiveToolBtn(btnMove);
            this.engine.selection.currentTool = 'move';
            this.engine.selection.transformControls.setMode('translate');
            if (this.engine.selection.selectedMeshes.length > 0) this.engine.selection.transformControls.attach(this.engine.selection.selectedMeshes[0]);
        });

        btnScale?.addEventListener('click', () => {
            setActiveToolBtn(btnScale);
            this.engine.selection.currentTool = 'scale';
            this.engine.selection.transformControls.setMode('scale');
            if (this.engine.selection.selectedMeshes.length > 0) this.engine.selection.transformControls.attach(this.engine.selection.selectedMeshes[0]);
        });

        btnRotate?.addEventListener('click', () => {
            setActiveToolBtn(btnRotate);
            this.engine.selection.currentTool = 'rotate';
            this.engine.selection.transformControls.setMode('rotate');
            if (this.engine.selection.selectedMeshes.length > 0) this.engine.selection.transformControls.attach(this.engine.selection.selectedMeshes[0]);
        });

        window.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const isEditingText = active && (
                active.tagName === 'INPUT' || 
                active.tagName === 'TEXTAREA' || 
                active.tagName === 'SELECT' || 
                active.isContentEditable
            );

            if (isEditingText) {
                if (e.code === 'Escape') active.blur();
                return;
            }

            // Keyboard Shortcuts inside Escape Pause Menu (L = Leave, R = Respawn)
            const escMenu = document.getElementById('roblox-escape-menu');
            if (escMenu && escMenu.style.display === 'flex') {
                if (e.code === 'KeyL') {
                    e.preventDefault();
                    this.engine.playtest.togglePauseMenu();
                    this.engine.playtest.stopPlaytest();
                    return;
                }
                if (e.code === 'KeyR') {
                    e.preventDefault();
                    this.engine.playtest.togglePauseMenu();
                    this.engine.playtest.resetCharacter();
                    return;
                }
            }

            if (e.code === 'Slash' && this.engine.isPlaytesting) {
                e.preventDefault();
                const chatInput = document.getElementById('chat-input');
                if (chatInput) {
                    document.exitPointerLock();
                    chatInput.focus();
                }
                return;
            }

            if (e.code === 'Escape') {
                e.preventDefault();
                if (this.engine.isPlaytesting) this.engine.playtest.togglePauseMenu();
                return;
            }

            if (e.ctrlKey && e.code === 'KeyS') {
                e.preventDefault();
                if (e.shiftKey) this.engine.saveService.saveAs();
                else this.engine.saveService.quickSave();
                return;
            }

            if (e.ctrlKey && e.code === 'KeyZ') {
                e.preventDefault();
                this.engine.history.undo();
                this.engine.ui.selectInstance(null);
                this.engine.logToConsole("Executed Undo", "info");
                return;
            }
            if (e.ctrlKey && e.code === 'KeyY') {
                e.preventDefault();
                this.engine.history.redo();
                this.engine.ui.selectInstance(null);
                this.engine.logToConsole("Executed Redo", "info");
                return;
            }

            if (e.ctrlKey && e.code === 'KeyG') {
                e.preventDefault();
                this.engine.selection.groupSelected(); 
                return;
            }
            if (e.ctrlKey && e.code === 'KeyU') {
                e.preventDefault();
                this.engine.selection.ungroupSelected(); 
                return;
            }
            if (e.ctrlKey && e.code === 'KeyL') {
                e.preventDefault();
                const isLocal = this.engine.selection.transformControls.space === 'local';
                this.engine.selection.transformControls.setSpace(isLocal ? 'world' : 'local');
                this.engine.logToConsole(`Transformed coordinate space changed to: ${this.engine.selection.transformControls.space.toUpperCase()}`, 'info');
                return;
            }

            if (e.code === 'KeyF') {
                e.preventDefault();
                if (this.engine.isPlaytesting) {
                    this.engine.playtest.teleportCharacterToSelected();
                } else if (this.engine.selection.selectedMeshes.length > 0) {
                    this.engine.smoothFocus(this.engine.selection.selectedMeshes[0].position);
                }
            }

            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (this.engine.selection.selectedMeshes.length > 0 || this.engine.ui.selectedInstances.length > 0) {
                    e.preventDefault();
                    this.engine.history.saveState();
                    [...this.engine.ui.selectedInstances].forEach(inst => {
                        this.engine.logToConsole(`Deleted: ${inst.Name}`, 'warning');
                        inst.Destroy();
                    });
                    this.engine.ui.selectInstance(null);
                }
            }

            switch(e.code) {
                case 'KeyW': case 'ArrowUp': this.engine.keys.w = true; break;
                case 'KeyA': case 'ArrowLeft': this.engine.keys.a = true; break;
                case 'KeyS': case 'ArrowDown': this.engine.keys.s = true; break;
                case 'KeyD': case 'ArrowRight': this.engine.keys.d = true; break;
                case 'KeyQ': this.engine.keys.q = true; break; 
                case 'KeyE': this.engine.keys.e = true; break; 
                case 'Space': this.engine.keys.space = true; break;
                case 'ShiftLeft': case 'ShiftRight':
                    if (this.engine.isPlaytesting) this.engine.playtest.toggleShiftLock();
                    else this.engine.keys.shift = true;
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch(e.code) {
                case 'KeyW': case 'ArrowUp': this.engine.keys.w = false; break;
                case 'KeyA': case 'ArrowLeft': this.engine.keys.a = false; break;
                case 'KeyS': case 'ArrowDown': this.engine.keys.s = false; break;
                case 'KeyD': case 'ArrowRight': this.engine.keys.d = false; break;
                case 'KeyQ': case 'ArrowLeft': this.engine.keys.q = false; break;
                case 'KeyE': case 'ArrowRight': this.engine.keys.e = false; break;
                case 'Space': this.engine.keys.space = false; break; 
                case 'ShiftLeft': case 'ShiftRight': this.engine.keys.shift = false; break;
            }
        });

        this.engine.renderer.domElement.addEventListener('click', (e) => {
            if (this.engine.isPlaytesting) {
                if (document.getElementById('roblox-escape-menu').style.display === 'flex') return;
                if (document.activeElement === document.getElementById('chat-input')) return;
                if (this.engine.cameraController.shiftLockActive || this.engine.cameraController.isFirstPerson) {
                    this.engine.renderer.domElement.requestPointerLock();
                }
            } else {
                if (this.engine.selection.blockNextClick || this.engine.selection.transformControls.dragging) return;

                const mouse = new THREE.Vector2();
                const rect = this.engine.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.engine.raycaster.setFromCamera(mouse, this.engine.camera);
                const intersects = this.engine.raycaster.intersectObjects(this.engine.collidableMeshes);

                if (intersects.length > 0) {
                    const instance = intersects[0].object.userData.instance;
                    if (instance && instance.Locked) {
                        if (!e.ctrlKey) this.engine.ui.selectInstance(null);
                    } else {
                        this.engine.ui.selectInstance(instance, e.ctrlKey);
                    }
                } else if (!e.ctrlKey) {
                    this.engine.ui.selectInstance(null);
                }
            }
        });

        this.engine.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                const mouse = new THREE.Vector2();
                const rect = this.engine.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.engine.raycaster.setFromCamera(mouse, this.engine.camera);
                const intersects = this.engine.raycaster.intersectObjects(this.engine.collidableMeshes);

                if (intersects.length > 0 && !this.engine.isPlaytesting) {
                    this.engine.cameraController.rightMouseDown = false;
                    const instance = intersects[0].object.userData.instance;
                    if (instance && instance.Locked) {
                        this.engine.cameraController.rightMouseDown = true; 
                    } else {
                        this.engine.ui.selectInstance(instance);
                        this.engine.showContextMenu(e.clientX, e.clientY);
                    }
                } else {
                    this.engine.cameraController.rightMouseDown = true;
                }
            } else if (e.button === 0 && !this.engine.isPlaytesting) {
                const mouse = new THREE.Vector2();
                const rect = this.engine.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.engine.raycaster.setFromCamera(mouse, this.engine.camera);

                let hitGizmo = false;
                if (this.engine.selection.transformControls && this.engine.selection.transformControls.object) {
                    const gizmoIntersects = this.engine.raycaster.intersectObjects(this.engine.selection.transformControls.children, true);
                    if (gizmoIntersects.length > 0 || this.engine.selection.transformControls.dragging) {
                        hitGizmo = true;
                    }
                }

                if (!hitGizmo) {
                    const intersects = this.engine.raycaster.intersectObjects(this.engine.collidableMeshes);

                    let startMarquee = false;
                    if (intersects.length > 0) {
                        const hitMesh = intersects[0].object;
                        const instance = hitMesh.userData.instance;

                        if (instance && instance.ClassName === "Terrain") {
                            this.engine.isSculptingTerrain = true;
                            this.engine.activeSculptTerrain = instance;
                            this.engine.history.saveState();
                        } else if (instance && instance.Locked) {
                            startMarquee = true;
                        } else if (instance) {
                            this.engine.selection.isDraggingMesh = true;
                            this.engine.selection.draggedMesh = hitMesh;
                            if (e.ctrlKey) {
                                this.engine.ui.selectInstance(instance, true);
                            } else if (!this.engine.selection.selectedMeshes.includes(hitMesh)) {
                                this.engine.ui.selectInstance(instance);
                            }
                        }
                    } else {
                        startMarquee = true;
                    }

                    if (startMarquee && this.engine.selection.currentTool === 'select' && !this.engine.selection.transformControls.dragging) {
                        this.engine.selection.startMarqueeSelection(e);
                    }
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.engine.cameraController.rightMouseDown = false;
            if (e.button === 0) {
                this.engine.selection.isDraggingMesh = false;
                this.engine.selection.draggedMesh = null;
                this.engine.selection.draggedOffsetsCaptured = false;
                this.engine.isSculptingTerrain = false;
                this.engine.activeSculptTerrain = null;
            }
        });

        // Mouse Drag with Sensitivity & Inverted Y Axis Settings applied
        document.addEventListener('mousemove', (e) => {
            const isLocked = document.pointerLockElement === this.engine.renderer.domElement;
            
            if (this.engine.isSculptingTerrain && this.engine.activeSculptTerrain && !this.engine.isPlaytesting) {
                const mouse = new THREE.Vector2();
                const rect = this.engine.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.engine.raycaster.setFromCamera(mouse, this.engine.camera);
                const intersects = this.engine.raycaster.intersectObject(this.engine.activeSculptTerrain.mesh);

                if (intersects.length > 0) {
                    this.engine.activeSculptTerrain.sculpt(
                        intersects[0].point, 
                        window.terrainBrushRadius || 15, 
                        window.terrainBrushStrength || 0.4, 
                        window.terrainSculptMode || 'raise'
                    );
                }
            } else if (this.engine.selection.isDraggingMesh && this.engine.selection.draggedMesh && !this.engine.isPlaytesting) {
                if (this.engine.selection.transformControls.dragging) {
                    this.engine.selection.isDraggingMesh = false;
                    return;
                }

                const mouse = new THREE.Vector2();
                const rect = this.engine.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.engine.raycaster.setFromCamera(mouse, this.engine.camera);
                const targets = this.engine.collidableMeshes.filter(t => !this.engine.selection.selectedMeshes.includes(t));
                const intersects = this.engine.raycaster.intersectObjects(targets);

                let hitPoint = new THREE.Vector3();
                if (intersects.length > 0) hitPoint.copy(intersects[0].point);
                else this.engine.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPoint);

                const snappedX = Math.round(hitPoint.x);
                const snappedZ = Math.round(hitPoint.z);

                if (!this.engine.selection.draggedOffsetsCaptured) {
                    this.engine.selection.draggedOffsetsCaptured = true;
                    this.engine.selection.initialDragPrimaryPos = this.engine.selection.draggedMesh.position.clone();
                    this.engine.selection.initialDragOffsets = new Map();
                    for (const mesh of this.engine.selection.selectedMeshes) {
                        if (mesh === this.engine.selection.draggedMesh) continue;
                        this.engine.selection.initialDragOffsets.set(mesh, mesh.position.clone().sub(this.engine.selection.initialDragPrimaryPos));
                    }
                }

                const activeBox = new THREE.Box3().setFromObject(this.engine.selection.draggedMesh);
                const yOffset = this.engine.selection.draggedMesh.position.y - activeBox.min.y;

                this.engine.selection.draggedMesh.position.set(snappedX, hitPoint.y + yOffset, snappedZ);
                this.engine.selection.resolvePartStacking(this.engine.selection.draggedMesh);

                const primaryInstance = this.engine.selection.draggedMesh.userData.instance;
                primaryInstance.Position.copy(this.engine.selection.draggedMesh.position);
                primaryInstance.updateTransform();

                if (this.engine.selection.initialDragOffsets) {
                    const deltaPos = this.engine.selection.draggedMesh.position.clone().sub(this.engine.selection.initialDragPrimaryPos);
                    for (const mesh of this.engine.selection.selectedMeshes) {
                        if (mesh === this.engine.selection.draggedMesh) continue;
                        const offset = this.engine.selection.initialDragOffsets.get(mesh);
                        if (offset) {
                            mesh.position.copy(this.engine.selection.initialDragPrimaryPos.clone().add(offset)).add(deltaPos);
                            this.engine.selection.resolvePartStacking(mesh);
                            if (mesh.userData.instance) {
                                mesh.userData.instance.Position.copy(mesh.position);
                                mesh.userData.instance.updateTransform();
                            }
                        }
                    }
                }

                this.engine.selection.updateSelectionOutlines();
                this.engine.ui.refreshProperties();
            } else if (isLocked || this.engine.cameraController.rightMouseDown) {
                const sens = (this.engine.cameraController.sensitivity || 1.0) * 0.0025;
                const invertMult = this.engine.cameraController.inverted ? -1 : 1;

                this.engine.cameraController.cameraYaw -= e.movementX * sens;
                this.engine.cameraController.cameraPitch += e.movementY * sens * invertMult;

                const maxPitch = Math.PI / 2 - 0.05;
                const minPitch = this.engine.isPlaytesting ? -0.25 : -Math.PI / 2 + 0.05;
                this.engine.cameraController.cameraPitch = Math.max(minPitch, Math.min(maxPitch, this.engine.cameraController.cameraPitch));
            }
        });

        document.addEventListener('pointerlockchange', () => {
            const isLocked = document.pointerLockElement === this.engine.renderer.domElement;
            const crosshair = document.getElementById('crosshair');
            if (isLocked) {
                if (crosshair) crosshair.style.display = 'block';
            } else {
                if (!this.engine.cameraController.shiftLockActive && !this.engine.cameraController.isFirstPerson) {
                    if (crosshair) crosshair.style.display = 'none';
                }
            }
        });

        this.engine.renderer.domElement.addEventListener('wheel', (e) => {
            if (this.engine.isPlaytesting) {
                this.engine.cameraController.cameraDistance = Math.max(0.2, Math.min(25, this.engine.cameraController.cameraDistance + e.deltaY * 0.01));

                if (this.engine.cameraController.cameraDistance < 0.8) {
                    if (!this.engine.cameraController.isFirstPerson) {
                        this.engine.cameraController.isFirstPerson = true;
                        this.engine.renderer.domElement.requestPointerLock();
                    }
                } else if (this.engine.cameraController.isFirstPerson) {
                    this.engine.cameraController.isFirstPerson = false;
                    if (!this.engine.cameraController.shiftLockActive) {
                        document.exitPointerLock();
                    }
                }
            } else {
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.engine.camera.quaternion);
                const zoomSpeed = (e.deltaY > 0 ? -1 : 1) * (this.engine.keys.shift ? 6.0 : 2.5);
                this.engine.camera.position.addScaledVector(forward, zoomSpeed);
            }
        }, { passive: true });
    }
}