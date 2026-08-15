import * as THREE from 'three';
import { Player, Humanoid, Backpack, PlayerGui, PlayerScripts, Model, Tool } from './Instance.js';

export class PlaytestService {
    constructor(engine) {
        this.engine = engine;
        this.playtestSnapshot = null;
        this.setupEscapeMenuEvents();

        // Dynamically sync player list whenever the Players service changes in DataModel
        window.addEventListener('explorer-changed', () => {
            if (this.engine && this.engine.isPlaytesting) {
                this.syncPlayerListUI();
            }
        });
    }

    setupEscapeMenuEvents() {
        const tabPeople = document.getElementById('esc-tab-people');
        const tabSettings = document.getElementById('esc-tab-settings');
        const tabHelp = document.getElementById('esc-tab-help');

        const viewPeople = document.getElementById('esc-view-people');
        const viewSettings = document.getElementById('esc-view-settings');
        const viewHelp = document.getElementById('esc-view-help');

        const switchTab = (tabEl, viewEl) => {
            [tabPeople, tabSettings, tabHelp].forEach(t => t?.classList.remove('active'));
            [viewPeople, viewSettings, viewHelp].forEach(v => { if (v) v.style.display = 'none'; });
            tabEl?.classList.add('active');
            if (viewEl) viewEl.style.display = 'block';
        };

        tabPeople?.addEventListener('click', () => switchTab(tabPeople, viewPeople));
        tabSettings?.addEventListener('click', () => switchTab(tabSettings, viewSettings));
        tabHelp?.addEventListener('click', () => switchTab(tabHelp, viewHelp));

        const inputVol = document.getElementById('setting-volume');
        inputVol?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('setting-volume-val').innerText = `${val}%`;
            this.engine.setMasterVolume(val / 100);
        });

        const inputSens = document.getElementById('setting-sensitivity');
        inputSens?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) / 100;
            document.getElementById('setting-sens-val').innerText = `${val.toFixed(1)}x`;
            this.engine.cameraController.sensitivity = val;
        });

        const btnShiftLock = document.getElementById('setting-shiftlock-toggle');
        btnShiftLock?.addEventListener('click', () => {
            const isCurrentlyOn = btnShiftLock.classList.contains('on');
            btnShiftLock.classList.toggle('on', !isCurrentlyOn);
            btnShiftLock.innerText = !isCurrentlyOn ? 'On' : 'Off';
            this.engine.cameraController.shiftLockEnabled = !isCurrentlyOn;
            if (isCurrentlyOn && this.engine.cameraController.shiftLockActive) {
                this.toggleShiftLock();
            }
        });

        const btnInverted = document.getElementById('setting-camera-inverted');
        btnInverted?.addEventListener('click', () => {
            const isCurrentlyOn = btnInverted.classList.contains('on');
            btnInverted.classList.toggle('on', !isCurrentlyOn);
            btnInverted.innerText = !isCurrentlyOn ? 'On' : 'Off';
            this.engine.cameraController.inverted = !isCurrentlyOn;
        });

        const inputGfx = document.getElementById('setting-graphics-quality');
        inputGfx?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('setting-graphics-val').innerText = `${val}`;
            this.engine.setGraphicsQuality(val);
        });

        const selectFps = document.getElementById('setting-fps-limit');
        selectFps?.addEventListener('change', (e) => {
            this.engine.targetFps = parseInt(e.target.value);
        });
    }

    // DYNAMIC PLAYER LIST SYNC BASED ON game.Players SERVICE
    syncPlayerListUI() {
        const escCards = document.getElementById('esc-player-cards-container');
        const listItems = document.getElementById('player-list-items');
        const badge = document.getElementById('player-count-badge');

        if (!escCards || !listItems) return;

        escCards.innerHTML = '';
        listItems.innerHTML = '';

        const playersService = window.game ? window.game.children.find(c => c.ClassName === "Players" || c.Name === "Players") : null;
        const actualPlayers = playersService ? playersService.children.filter(c => c.ClassName === "Player") : [];

        if (badge) badge.innerText = `${actualPlayers.length}`;

        if (actualPlayers.length === 0) {
            listItems.innerHTML = '<div style="color: #888; font-size: 11px; padding: 4px; text-align: center;">No Players</div>';
            escCards.innerHTML = '<div style="color: #888; font-size: 13px; text-align: center; width: 100%;">No players in server</div>';
            return;
        }

        actualPlayers.forEach(p => {
            const displayName = p.DisplayName || p.Name;
            const username = `@${p.Name}`;
            const initial = (displayName[0] || "P").toUpperCase();

            // Esc Menu Card
            const card = document.createElement('div');
            card.className = 'esc-player-card';
            card.innerHTML = `
                <div class="esc-player-avatar">${initial}</div>
                <div class="esc-player-info">
                    <div class="esc-player-name">${displayName}</div>
                    <div class="esc-player-user">${username}</div>
                </div>
                <button class="esc-add-friend-btn" title="Add Friend">👤+</button>
            `;
            escCards.appendChild(card);

            // Top-right Leaderboard Item
            const item = document.createElement('div');
            item.className = 'player-list-item';
            item.innerHTML = `
                <div class="player-avatar-badge">${initial}</div>
                <span style="font-weight: 600; font-size: 11px;">${displayName}</span>
            `;
            listItems.appendChild(item);
        });
    }

    startPlaytest() {
        this.playtestSnapshot = this.engine.history.serializeInstance(window.game);
        this.engine.isPlaytesting = true;
        this.engine.isPaused = false;

        document.getElementById('btn-play').style.display = 'none';
        document.getElementById('btn-pause').style.display = 'block';
        document.getElementById('btn-stop').style.display = 'block';

        document.getElementById('roblox-top-bar').style.display = 'flex';
        document.getElementById('roblox-player-list').style.display = 'block';
        document.getElementById('roblox-chat-container').style.display = 'flex';

        this.engine.selection.transformControls.detach();
        this.engine.selection.transformControls.enabled = false;
        this.engine.selection.transformControls.visible = false;
        
        for (const helper of this.engine.selection.selectionHelpers) {
            this.engine.scene.remove(helper);
        }
        this.engine.selection.selectionHelpers = [];

        this.engine.keys.w = false; this.engine.keys.a = false; this.engine.keys.s = false; this.engine.keys.d = false;
        this.engine.keys.q = false; this.engine.keys.e = false; this.engine.keys.space = false;

        this.engine.cameraController.cameraYaw = 0;
        this.engine.cameraController.cameraPitch = 0.2;
        this.engine.cameraController.cameraDistance = 5;

        // Populate / Verify Players in DataModel
        const playersService = window.game.children.find(c => c.ClassName === "Players");
        const workspaceService = window.game.children.find(c => c.Name === "Workspace");

        if (playersService) {
            let player1 = playersService.children.find(c => c.Name === "Player1");
            if (!player1) {
                player1 = new Player("Player1");
                player1.Parent = playersService;
            }

            const backpack = player1.children.find(c => c.ClassName === "Backpack") || new Backpack();
            backpack.Parent = player1;

            if (backpack.children.length === 0) {
                const defaultTool = new Tool("Classic Sword");
                defaultTool.Parent = backpack;
            }

            const playerGui = player1.children.find(c => c.ClassName === "PlayerGui") || new PlayerGui();
            playerGui.Parent = player1;

            const playerScripts = player1.children.find(c => c.ClassName === "PlayerScripts") || new PlayerScripts();
            playerScripts.Parent = player1;
        }

        if (workspaceService) {
            const charModel = new Model();
            charModel.Name = "Player1";
            charModel.Parent = workspaceService;

            const humanoid = new Humanoid();
            humanoid.Parent = charModel;

            const sp = window.game.children.find(c => c.ClassName === "StarterPlayer");
            if (sp) {
                humanoid.WalkSpeed = sp.CharacterWalkSpeed || 16.0;
                humanoid.JumpPower = sp.CharacterJumpPower || 50.0;
            }

            this.engine.characterController.humanoidInstance = humanoid;
        }

        this.syncPlayerListUI();

        window.dispatchEvent(new CustomEvent('explorer-changed'));
        this.engine.guiService.sync();

        this.engine.characterController.load(() => {
            this.engine.addChatMessage("System", "Welcome to Roblox Playtest Session!", "#00a2ff");
            this.engine.addChatMessage("System", "Press '/' to chat or ESC to open Pause Menu!", "#a6e22e");
        });

        const sssFolder = window.game.children.find(c => c.Name === "ServerScriptService");
        if (sssFolder) {
            this.engine.scriptSystem.executeAll(sssFolder);
        }
    }

    togglePausePlaytest() {
        if (!this.engine.isPlaytesting) return;
        this.engine.isPaused = !this.engine.isPaused;

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.innerHTML = this.engine.isPaused ? '<span class="icon">▶</span>Resume' : '<span class="icon">⏸</span>Pause';
            btnPause.style.color = this.engine.isPaused ? '#28a745' : '#ffc107';
        }

        if (this.engine.isPaused) {
            document.exitPointerLock();
            this.engine.logToConsole("Playtest execution paused.", "warning");
        } else {
            this.engine.logToConsole("Playtest execution resumed.", "success");
        }
    }

    async stopPlaytest() {
        this.engine.isPlaytesting = false;
        this.engine.isPaused = false;

        document.getElementById('btn-play').style.display = 'block';
        document.getElementById('btn-pause').style.display = 'none';
        document.getElementById('btn-stop').style.display = 'none';
        document.getElementById('roblox-escape-menu').style.display = 'none';

        document.getElementById('roblox-top-bar').style.display = 'none';
        document.getElementById('roblox-player-list').style.display = 'none';
        document.getElementById('roblox-chat-container').style.display = 'none';

        if (this.engine.chatBubbleContainerObj && this.engine.characterController?.characterGroup) {
            this.engine.characterController.characterGroup.remove(this.engine.chatBubbleContainerObj);
            this.engine.chatBubbleContainerObj = null;
        }

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.innerHTML = '<span class="icon">⏸</span>Pause';
            btnPause.style.color = '#ffc107';
        }

        this.engine.scriptSystem.stopAll();
        this.engine.characterController.destroy();

        if (this.playtestSnapshot) {
            await this.engine.history.deserializeDataModel(this.playtestSnapshot);
            this.playtestSnapshot = null;
        }

        window.dispatchEvent(new CustomEvent('explorer-changed'));
        this.engine.guiService.sync();

        this.engine.selection.transformControls.enabled = true;
        this.engine.selection.transformControls.visible = true;
        this.engine.selection.refreshMultiSelection();

        this.engine.cameraController.shiftLockActive = false;
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'none';

        document.exitPointerLock();
    }

    toggleShiftLock() {
        if (this.engine.cameraController.isFirstPerson) return;
        if (!this.engine.cameraController.shiftLockEnabled) return;

        this.engine.cameraController.shiftLockActive = !this.engine.cameraController.shiftLockActive;
        const crosshair = document.getElementById('crosshair');

        if (this.engine.cameraController.shiftLockActive) {
            if (crosshair) crosshair.style.display = 'block';
            this.engine.renderer.domElement.requestPointerLock();
        } else {
            if (crosshair) crosshair.style.display = 'none';
            document.exitPointerLock();
        }
    }

    togglePauseMenu() {
        const menu = document.getElementById('roblox-escape-menu');
        if (!menu) return;
        const isVisible = menu.style.display === 'flex';

        if (isVisible) {
            menu.style.display = 'none';
            if (this.engine.cameraController.shiftLockActive || this.engine.cameraController.isFirstPerson) {
                this.engine.renderer.domElement.requestPointerLock();
            }
        } else {
            menu.style.display = 'flex';
            this.syncPlayerListUI();
            document.exitPointerLock(); 
        }
    }

    resetCharacter() {
        if (!this.engine.isPlaytesting || !this.engine.characterController) return;
        if (this.engine.characterController.isDead) return; 

        this.engine.characterController.die();
        this.engine.logToConsole("Oof! Character reset.", "warning");

        setTimeout(() => {
            if (this.engine.isPlaytesting) {
                this.respawnCharacter();
            }
        }, 3000);
    }

    respawnCharacter() {
        if (!this.engine.isPlaytesting) return;

        this.engine.characterController.isDead = false;
        this.engine.characterController.characterMesh.rotation.z = 0; 

        if (this.engine.characterController.humanoidInstance) {
            this.engine.characterController.humanoidInstance.Health = this.engine.characterController.humanoidInstance.MaxHealth;
        }

        if (this.engine.characterController.mixer) {
            this.engine.characterController.mixer.stopAllAction();
        }
        if (this.engine.characterController.actions['idle']) {
            this.engine.characterController.actions['idle'].play();
        }
        this.engine.characterController.activeActionName = 'idle';

        const findSpawnLocation = (root) => {
            if (root.ClassName === "SpawnLocation") return root;
            for (const child of root.children) {
                const found = findSpawnLocation(child);
                if (found) return found;
            }
            return null;
        };

        const spawn = findSpawnLocation(window.game);
        if (spawn) {
            this.engine.characterController.characterGroup.position.copy(spawn.Position).y += (spawn.Size.y / 2 + 0.1);
        } else {
            this.engine.characterController.characterGroup.position.set(0, 0.5, 0);
        }

        this.engine.logToConsole("Character respawned successfully.", "success");
    }

    teleportCharacterToSelected() {
        if (this.engine.characterController.characterGroup && this.engine.selection.selectedMeshes.length > 0) {
            const mesh = this.engine.selection.selectedMeshes[0];
            const activeBox = new THREE.Box3().setFromObject(mesh);
            this.engine.characterController.characterGroup.position.set(mesh.position.x, activeBox.max.y + 0.1, mesh.position.z);
            this.engine.logToConsole("Teleported character.", "success");
        }
    }
}