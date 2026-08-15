import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createDataModel } from './Explorer.js';
import { StudioUI } from './StudioUI.js';
import { ScriptSystem } from './ScriptSystem.js';
import { CameraController } from './CameraController.js';
import { CharacterController } from './CharacterController.js';
import { HistoryService } from './HistoryService.js';
import { GuiService } from './GuiService.js';
import { SaveService } from './SaveService.js';

import { RendererService } from './RendererService.js';
import { EnvironmentService } from './EnvironmentService.js';
import { PhysicsService } from './PhysicsService.js';
import { SelectionService } from './SelectionService.js';
import { PanelManager } from './PanelManager.js';
import { HubService } from './HubService.js';
import { AssetImportService } from './AssetImportService.js';
import { PlaytestService } from './PlaytestService.js';
import { InputHandler } from './InputHandler.js';

export class StudioEngine {
    constructor() {
        this.rendererService = new RendererService();
        this.environment = new EnvironmentService();
        this.physics = new PhysicsService();
        this.selection = new SelectionService(this);
        this.panelManager = new PanelManager(this);
        this.hub = new HubService(this);
        this.assetImporter = new AssetImportService(this);
        this.playtest = new PlaytestService(this);
        this.inputHandler = new InputHandler(this);

        this.scriptSystem = new ScriptSystem();
        this.history = new HistoryService();
        this.guiService = new GuiService(); 
        this.saveService = new SaveService(this); 

        this.collidableMeshes = []; 
        this.isPlaytesting = false;
        this.isPaused = false;
        this.keys = { w: false, a: false, s: false, d: false, q: false, e: false, space: false, shift: false };
        this.raycaster = new THREE.Raycaster();

        this.isSculptingTerrain = false;
        this.activeSculptTerrain = null;
        this.activeProjectName = "Untitled Place"; 

        this.chatBubbleContainerObj = null;
        this.chatBubbleStackDiv = null;

        this.masterVolume = 0.8;
        this.targetFps = 60;
        this.lastFrameTime = performance.now();

        this.init();
    }

    get scene() { return this.rendererService.scene; }
    get camera() { return this.rendererService.camera; }
    get renderer() { return this.rendererService.renderer; }
    get cssRenderer() { return this.rendererService.cssRenderer; }
    get clock() { return this.rendererService.clock; }
    get audioListener() { return this.rendererService.audioListener; }

    get transformControls() { return this.selection.transformControls; }
    get selectedMeshes() { return this.selection.selectedMeshes; }
    set selectedMeshes(val) { this.selection.selectedMeshes = val; }
    get selectionHelpers() { return this.selection.selectionHelpers; }
    set selectionHelpers(val) { this.selection.selectionHelpers = val; }

    selectPart(instance) { this.selection.selectPart(instance); }
    selectMultipleParts(instances) { this.selection.selectMultipleParts(instances); }

    init() {
        window.game = createDataModel();

        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.characterController = new CharacterController(this.scene);
        this.characterController.keys = this.keys;

        this.environment.init(this.scene, this.renderer);
        this.selection.init(this.camera, this.renderer.domElement, this.scene);

        this.ui = new StudioUI(window.game);

        this.panelManager.setupPanelSplitters();
        this.hub.setupHub();
        this.assetImporter.setupImportActions();
        this.inputHandler.setupControlEvents();
        this.setupRobloxChat();
        this.setupTopBarUI();

        window.addEventListener('gui-changed', () => this.guiService.sync());
        window.addEventListener('explorer-changed', () => this.guiService.sync());
        window.addEventListener('lighting-changed', () => this.environment.updateLighting());

        this.environment.updateLighting();
        this.guiService.sync();
    }

    setupTopBarUI() {
        document.getElementById('top-bar-menu-btn')?.addEventListener('click', () => {
            if (this.isPlaytesting) this.playtest.togglePauseMenu();
        });

        document.getElementById('top-bar-chat-btn')?.addEventListener('click', () => {
            const chatBox = document.getElementById('roblox-chat-container');
            if (chatBox) {
                const isVisible = chatBox.style.display === 'flex';
                chatBox.style.display = isVisible ? 'none' : 'flex';
            }
        });

        document.getElementById('top-bar-leaderboard-btn')?.addEventListener('click', () => {
            const list = document.getElementById('roblox-player-list');
            if (list) {
                const isVisible = list.style.display === 'block';
                list.style.display = isVisible ? 'none' : 'block';
            }
        });
    }

    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.audioListener) {
            this.audioListener.setMasterVolume(this.masterVolume);
        }
    }

    setGraphicsQuality(level) {
        const quality = Math.max(1, Math.min(10, level));
        if (this.rendererService) {
            const bloomVal = 0.05 * quality;
            const motionBlurVal = quality > 5 ? 1.0 : 0.0;
            this.rendererService.updatePostProcessing(bloomVal, motionBlurVal);

            if (this.rendererService.gtaoPass) {
                this.rendererService.gtaoPass.enabled = (quality >= 5);
            }
        }
    }

    setupRobloxChat() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = chatInput.value.trim();
                if (text) {
                    this.addChatMessage("Player1", text, "#ffffff");
                    this.createChatBubble(text);
                    chatInput.value = '';
                }
                chatInput.blur();
                this.renderer.domElement.requestPointerLock();
            }
        });
    }

    createChatBubble(text) {
        if (!this.characterController || !this.characterController.characterGroup) return;

        if (!this.chatBubbleContainerObj || !this.chatBubbleContainerObj.parent) {
            this.chatBubbleStackDiv = document.createElement('div');
            this.chatBubbleStackDiv.className = 'roblox-chat-stack-container';

            this.chatBubbleContainerObj = new CSS2DObject(this.chatBubbleStackDiv);
            this.characterController.characterGroup.add(this.chatBubbleContainerObj);
        }

        const currentHipHeight = this.characterController.humanoidInstance ? this.characterController.humanoidInstance.HipHeight : 3.3;
        const headHeight = 4.2 + (currentHipHeight > 3.3 ? (currentHipHeight - 3.3) : 0);
        this.chatBubbleContainerObj.position.set(0, headHeight, 0);

        while (this.chatBubbleStackDiv.children.length >= 3) {
            const oldest = this.chatBubbleStackDiv.firstChild;
            if (oldest.timeoutId) clearTimeout(oldest.timeoutId);
            this.chatBubbleStackDiv.removeChild(oldest);
        }

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'roblox-chat-bubble';
        bubbleDiv.innerText = text;

        bubbleDiv.timeoutId = setTimeout(() => {
            bubbleDiv.style.opacity = '0';
            setTimeout(() => {
                if (bubbleDiv.parentNode === this.chatBubbleStackDiv) {
                    this.chatBubbleStackDiv.removeChild(bubbleDiv);
                }
                if (this.chatBubbleStackDiv.children.length === 0 && this.chatBubbleContainerObj) {
                    if (this.characterController && this.characterController.characterGroup) {
                        this.characterController.characterGroup.remove(this.chatBubbleContainerObj);
                    }
                    this.chatBubbleContainerObj = null;
                }
            }, 300);
        }, 5000);

        this.chatBubbleStackDiv.appendChild(bubbleDiv);
    }

    addChatMessage(sender, text, color = "#ffffff") {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const line = document.createElement('div');
        line.style.marginBottom = '4px';
        line.innerHTML = `<span style="color: ${color}; font-weight: bold;">[${sender}]:</span> <span style="color: #eee;">${text}</span>`;
        
        chatMessages.appendChild(line);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    logToConsole(text, type = 'info') {
        const consoleOutput = document.getElementById('console-output');
        if (!consoleOutput) return;
        const line = document.createElement('div');
        if (type === 'error') line.style.color = '#ff6b6b';
        if (type === 'warning') line.style.color = '#ffea6b';
        if (type === 'success') line.style.color = '#a6e22e';
        line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight; 
    }

    positionSpawnedPart(instance) {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.collidableMeshes);
        
        let spawnPos = new THREE.Vector3();
        if (intersects.length > 0) {
            spawnPos.copy(intersects[0].point);
            spawnPos.y += (instance.Size?.y ? instance.Size.y / 2 : 1.5);
        } else {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            spawnPos.copy(this.camera.position).addScaledVector(direction, 12);
        }
        
        if (instance.Position) {
            instance.Position.copy(spawnPos);
        } else if (instance.children) {
            instance.children.forEach(child => {
                if (child.Position) {
                    child.Position.add(spawnPos);
                    child.updateTransform?.();
                }
            });
        }
        instance.updateTransform?.();
    }

    smoothFocus(targetPos) {
        const duration = 500;
        const startPos = this.camera.position.clone();
        const endPos = targetPos.clone().add(new THREE.Vector3(0, 5, 10));
        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const ease = progress * progress * (3 - 2 * progress);
            this.camera.position.lerpVectors(startPos, endPos, ease);
            this.camera.lookAt(targetPos);
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;
        menu.style.display = 'block';
        
        const menuWidth = 150;
        let menuX = x;
        if (x + menuWidth > window.innerWidth) menuX = window.innerWidth - menuWidth - 10;

        menu.style.left = `${menuX}px`;
        menu.style.top = `${y}px`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        if (this.targetFps > 0) {
            const minInterval = 1000 / this.targetFps;
            if (now - this.lastFrameTime < minInterval - 1) return;
        }
        this.lastFrameTime = now;

        const delta = this.clock.getDelta();
        if (delta > 0.1) return;

        const cameraSpeedMultiplier = this.keys.shift ? 0.25 : 1.0;

        const animateWater = (instance) => {
            if (instance.ClassName === "Water" && typeof instance.updateWaveAnimation === 'function') {
                instance.updateWaveAnimation(delta);
            }
            if (instance.children) {
                for (const child of instance.children) animateWater(child);
            }
        };

        if (window.game) animateWater(window.game);

        if (this.isPlaytesting) {
            if (!this.isPaused) {
                if (this.characterController.characterGroup) {
                    this.physics.update(this.collidableMeshes, delta);

                    this.characterController.update(
                        delta, 
                        this.camera, 
                        this.cameraController.shiftLockActive, 
                        this.cameraController.isFirstPerson,
                        this.cameraController.cameraYaw,
                        this.collidableMeshes
                    );
                    this.cameraController.update(this.characterController.characterGroup);
                }
            }
        } else {
            if ((this.selection.transformControls && this.selection.transformControls.dragging) || this.selection.isDraggingMesh) {
                this.cameraController.updateEditMode(delta * cameraSpeedMultiplier, { w: false, a: false, s: false, d: false, q: false, e: false });
            } else {
                this.cameraController.updateEditMode(delta * cameraSpeedMultiplier, this.keys);
            }
        }

        this.rendererService.renderPassPipeline(
            this.cameraController.cameraYaw, 
            this.cameraController.cameraPitch
        );
    }
}