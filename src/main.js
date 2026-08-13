/* --- START OF FILE main.js (REVISED) --- */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'; // CSS2D Object Renderer
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js'; // Lens flares helper
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDataModel } from './Explorer.js';
import { StudioUI } from './StudioUI.js';
import { ScriptSystem } from './ScriptSystem.js';
import { CameraController } from './CameraController.js';
import { CharacterController } from './CharacterController.js';
import { HistoryService } from './HistoryService.js';
import { GuiService } from './GuiService.js';
import { SaveService } from './SaveService.js';
import { Part, SpawnLocation, Script, LocalScript, Model, PointLight, SpotLight, MeshPart, BillboardGui, SurfaceGui, Sound, Decal, saveAssetToDB, loadAssetFromDB } from './Instance.js';

class StudioEngine {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cssRenderer = null; // Binds floating billboard UI elements
        this.clock = null;
        this.sunLight = null; 
        this.ambientLight = null;
        this.audioListener = null; // Binds spatial positional sounds

        this.cameraController = null;
        this.characterController = null;
        this.transformControls = null;
        this.selectionHelpers = []; 
        this.scriptSystem = new ScriptSystem();
        this.history = new HistoryService();
        this.guiService = new GuiService(); 
        this.saveService = new SaveService(this); 

        this.collidableMeshes = []; 
        this.isPlaytesting = false;
        
        this.keys = { w: false, a: false, s: false, d: false, q: false, e: false, space: false, shift: false };
        
        this.raycaster = new THREE.Raycaster();
        this.selectedMeshes = []; 
        this.currentTool = 'select';
        this.blockNextClick = false; 

        this.isDraggingMesh = false;
        this.draggedMesh = null;
        this.clipboard = null; 
        this.playtestSnapshot = null; 
        this.activeProjectName = "Untitled Game"; 

        // Dynamic Sky Interpolation keyframes
        this.skyKeys = [
            { time: 0,   sky: 0x04040a, ambient: 0x0b0d18, sun: 0x6688aa, fog: 0x04040a, sunIntensity: 0.25, ambientIntensity: 0.15 }, // Midnight
            { time: 5,   sky: 0x220c38, ambient: 0x181022, sun: 0x884488, fog: 0x1e0b30, sunIntensity: 0.20, ambientIntensity: 0.15 }, // Pre-dawn
            { time: 6,   sky: 0x9e4334, ambient: 0x5a2d48, sun: 0xffaa44, fog: 0x873229, sunIntensity: 0.60, ambientIntensity: 0.45 }, // Sunrise
            { time: 8,   sky: 0x4879cc, ambient: 0x85a2db, sun: 0xfff4df, fog: 0x6c9be8, sunIntensity: 1.05, ambientIntensity: 0.70 }, // Morning
            { time: 12,  sky: 0x5fa0e6, ambient: 0xa9c3f5, sun: 0xffffff, fog: 0x82b1fa, sunIntensity: 1.20, ambientIntensity: 0.80 }, // Noon
            { time: 16,  sky: 0xc44f2b, ambient: 0x5a2542, sun: 0xff7722, fog: 0xaa3a22, sunIntensity: 0.90, ambientIntensity: 0.50 }, // Sunset
            { time: 18,  sky: 0x241142, ambient: 0x161026, sun: 0x503377, fog: 0x1a0d36, sunIntensity: 0.35, ambientIntensity: 0.30 }, // Dusk
            { time: 20,  sky: 0x04040a, ambient: 0x0b0d18, sun: 0x6688aa, fog: 0x04040a, sunIntensity: 0.25, ambientIntensity: 0.15 }, // Early Night
            { time: 24,  sky: 0x04040a, ambient: 0x0b0d18, sun: 0x6688aa, fog: 0x04040a, sunIntensity: 0.25, ambientIntensity: 0.15 }  // End cycle
        ];

        this.init();
    }

    createSunFlareTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.08, 'rgba(255, 245, 210, 0.9)');
        gradient.addColorStop(0.20, 'rgba(255, 190, 80, 0.35)');
        gradient.addColorStop(0.50, 'rgba(255, 110, 30, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(canvas);
    }

    createGhostFlareTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(64, 64, 45, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.5, 'rgba(100, 220, 255, 0.04)');
        gradient.addColorStop(0.8, 'rgba(255, 140, 80, 0.07)');
        gradient.addColorStop(0.95, 'rgba(255, 250, 180, 0.12)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    lerpColor(color1, color2, t) {
        const r1 = (color1 >> 16) & 255;
        const g1 = (color1 >> 8) & 255;
        const b1 = color1 & 255;

        const r2 = (color2 >> 16) & 255;
        const g2 = (color2 >> 8) & 255;
        const b2 = color2 & 255;

        const r = Math.round(r1 + t * (r2 - r1));
        const g = Math.round(g1 + t * (g2 - g1));
        const b = Math.round(b1 + t * (b2 - b1));

        return new THREE.Color(r / 255, g / 255, b / 255);
    }

    updateLighting() {
        const lighting = window.game.children.find(c => c.ClassName === "Lighting");
        if (!lighting) return;

        const clockTime = lighting.ClockTime;
        let lower = this.skyKeys[0];
        let upper = this.skyKeys[this.skyKeys.length - 1];

        for (let i = 0; i < this.skyKeys.length - 1; i++) {
            if (clockTime >= this.skyKeys[i].time && clockTime <= this.skyKeys[i+1].time) {
                lower = this.skyKeys[i];
                upper = this.skyKeys[i+1];
                break;
            }
        }

        const segmentTime = upper.time - lower.time;
        const t = segmentTime === 0 ? 0 : (clockTime - lower.time) / segmentTime;

        const skyColor = this.lerpColor(lower.sky, upper.sky, t);
        const ambientColor = this.lerpColor(lower.ambient, upper.ambient, t);
        const sunColor = this.lerpColor(lower.sun, upper.sun, t);
        const fogColor = this.lerpColor(lower.fog, upper.fog, t);

        const sunIntensity = lower.sunIntensity + t * (upper.sunIntensity - lower.sunIntensity);
        const ambientIntensity = lower.ambientIntensity + t * (upper.ambientIntensity - lower.ambientIntensity);

        this.scene.background.copy(skyColor);
        this.scene.fog.color.copy(fogColor);

        if (this.ambientLight) {
            this.ambientLight.color.copy(ambientColor);
            this.ambientLight.intensity = ambientIntensity * lighting.Brightness; 
        }

        if (this.sunLight) {
            this.sunLight.color.copy(sunColor);
            this.sunLight.intensity = sunIntensity * lighting.Brightness;

            const rad = (clockTime / 24) * Math.PI * 2;
            const sunX = Math.sin(rad) * 150;
            const sunY = -Math.cos(rad) * 150;
            const sunZ = -Math.cos(rad * 0.5) * 50;

            if (sunY > 0) {
                this.sunLight.position.set(sunX, sunY, sunZ);
            } else {
                this.sunLight.position.set(-sunX, -sunY, -sunZ);
            }
        }

        if (this.starMaterial) {
            let starOpacity = 0.0;
            if (clockTime >= 18.5 || clockTime <= 5.5) {
                if (clockTime >= 18.5 && clockTime <= 20) {
                    starOpacity = (clockTime - 18.5) / 1.5; 
                } else if (clockTime >= 4 && clockTime <= 5.5) {
                    starOpacity = 1.0 - (clockTime - 4) / 1.5; 
                } else {
                    starOpacity = 1.0;
                }
            }
            this.starMaterial.opacity = starOpacity;
        }
    }

    init() {
        window.game = createDataModel();

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        this.scene.background = new THREE.Color(0xa0a0a0);
        this.scene.fog = new THREE.FogExp2(0xa0a0a0, 0.012);

        this.camera = new THREE.PerspectiveCamera(60, (window.innerWidth - 290) / (window.innerHeight - 240), 0.1, 1000); 
        this.camera.position.set(0, 10, 15); 

        // Setup Spatial Audio Tracking Listener
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth - 290, window.innerHeight - 240);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '1';

        const container = document.getElementById('canvas-container');
        container.appendChild(this.renderer.domElement);

        // CSS 2D Billboarding Renderer
        this.cssRenderer = new CSS2DRenderer();
        this.cssRenderer.setSize(window.innerWidth - 290, window.innerHeight - 240);
        this.cssRenderer.domElement.style.position = 'absolute';
        this.cssRenderer.domElement.style.top = '0';
        this.cssRenderer.domElement.style.left = '0';
        this.cssRenderer.domElement.style.pointerEvents = 'none'; 
        this.cssRenderer.domElement.style.zIndex = '2'; 
        
        container.appendChild(this.cssRenderer.domElement);

        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.characterController = new CharacterController(this.scene);
        this.characterController.keys = this.keys;

        // Setup Transform Gizmos
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.setTranslationSnap(1.0);
        this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
        this.scene.add(this.transformControls);

        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (event.value) {
                this.blockNextClick = true;
            } else {
                setTimeout(() => {
                    this.blockNextClick = false;
                }, 50);
            }
        });

        this.transformControls.addEventListener('objectChange', () => {
            const activeObj = this.transformControls.object;
            if (activeObj && activeObj.userData.instance) {
                const instance = activeObj.userData.instance;
                this.resolvePartStacking(activeObj);

                instance.Position.copy(activeObj.position);
                instance.Size.copy(activeObj.scale);
                instance.updateTransform();

                this.updateSelectionOutlines();
                this.ui.refreshProperties();
            }
        });

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 300;
        
        const d = 100;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.bias = -0.0005;

        this.sunLight.target.position.set(0, 0, 0);
        this.scene.add(this.sunLight.target);
        this.scene.add(this.sunLight);

        // Sun Flare configurations
        const sunTex = this.createSunFlareTexture();
        const ghostTex = this.createGhostFlareTexture();
        
        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(sunTex, 380, 0, new THREE.Color(0xffffff)));
        lensflare.addElement(new LensflareElement(ghostTex, 70, 0.55));
        lensflare.addElement(new LensflareElement(ghostTex, 110, 0.7));
        lensflare.addElement(new LensflareElement(ghostTex, 140, 0.85));
        lensflare.addElement(new LensflareElement(ghostTex, 85, 1.0));
        this.sunLight.add(lensflare);

        // Star-Field creation
        const starGeom = new THREE.BufferGeometry();
        const starCount = 650;
        const starPositions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 280; 
            
            starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)); 
            starPositions[i * 3 + 2] = r * Math.cos(phi);
        }
        
        starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        this.starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.3,
            transparent: true,
            opacity: 0.0,
            sizeAttenuation: false
        });
        
        this.stars = new THREE.Points(starGeom, this.starMaterial);
        this.scene.add(this.stars);

        const grid = new THREE.GridHelper(200, 100, 0x000000, 0x444444);
        grid.position.y = -0.01;
        this.scene.add(grid);

        this.ui = new StudioUI(window.game);

        this.setupControlEvents();
        this.setupHub(); 
        this.setupPanelSplitters(); 
        this.setupImportActions();

        window.addEventListener('gui-changed', () => {
            this.guiService.sync();
        });
        window.addEventListener('explorer-changed', () => {
            this.guiService.sync();
        });
        window.addEventListener('lighting-changed', () => {
            this.updateLighting();
        });

        this.updateLighting();
        this.guiService.sync();
    }

    setupPanelSplitters() {
        const sidebar = document.getElementById('sidebar');
        const bottomPanel = document.getElementById('bottom-panel');
        const sidebarSplitter = document.getElementById('sidebar-splitter');
        const consoleSplitter = document.getElementById('console-splitter');

        sidebarSplitter.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const onMouseMove = (moveEvent) => {
                const width = window.innerWidth - moveEvent.clientX;
                if (width > 150 && width < 500) {
                    sidebar.style.width = `${width}px`;
                    this.onWindowResize();
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        consoleSplitter.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const onMouseMove = (moveEvent) => {
                const height = window.innerHeight - moveEvent.clientY;
                if (height > 80 && height < 400) {
                    bottomPanel.style.height = `${height}px`;
                    this.onWindowResize();
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        const tabHome = document.getElementById('ribbon-home');
        const tabModel = document.getElementById('ribbon-model');
        const tabView = document.getElementById('ribbon-view');

        const switchRibbonTab = (activeTab) => {
            [tabHome, tabModel, tabView].forEach(t => t.classList.remove('selected'));
            activeTab.classList.add('selected');

            const editGroup = document.getElementById('tools-edit-group');
            const viewGroup = document.getElementById('tools-view-group');

            if (activeTab === tabView) {
                if (editGroup) editGroup.style.display = 'none';
                if (viewGroup) viewGroup.style.display = 'flex';
            } else {
                if (editGroup) editGroup.style.display = 'flex';
                if (viewGroup) viewGroup.style.display = 'none';
            }
        };

        tabHome.addEventListener('click', () => switchRibbonTab(tabHome));
        tabModel.addEventListener('click', () => switchRibbonTab(tabModel));
        tabView.addEventListener('click', () => switchRibbonTab(tabView));

        const btnToggleExplorer = document.getElementById('btn-toggle-explorer');
        const btnToggleProperties = document.getElementById('btn-toggle-properties');
        const btnToggleConsole = document.getElementById('btn-toggle-console');

        if (btnToggleExplorer) {
            btnToggleExplorer.addEventListener('click', () => {
                const explorer = document.getElementById('explorer-tree').parentNode;
                const isVisible = explorer.style.display !== 'none';
                explorer.style.display = isVisible ? 'none' : 'flex';
                btnToggleExplorer.classList.toggle('active', !isVisible);
            });
        }

        if (btnToggleProperties) {
            btnToggleProperties.addEventListener('click', () => {
                const props = document.getElementById('properties-grid').parentNode;
                const isVisible = props.style.display !== 'none';
                props.style.display = isVisible ? 'none' : 'flex';
                btnToggleProperties.classList.toggle('active', !isVisible);
            });
        }

        if (btnToggleConsole) {
            btnToggleConsole.addEventListener('click', () => {
                const consolePanel = document.getElementById('bottom-panel');
                const splitter = document.getElementById('console-splitter');
                const isVisible = consolePanel.style.display !== 'none';
                consolePanel.style.display = isVisible ? 'none' : 'flex';
                splitter.style.display = isVisible ? 'none' : 'block';
                btnToggleConsole.classList.toggle('active', !isVisible);
                this.onWindowResize();
            });
        }
    }

    setupHub() {
        const hub = document.getElementById('studio-hub');
        const container = document.getElementById('studio-container');

        const btnNew = document.getElementById('tab-new');
        const btnLocal = document.getElementById('tab-local');
        const btnCloud = document.getElementById('tab-cloud');

        const gridTemplates = document.getElementById('templates-grid');
        const gridLocal = document.getElementById('local-saves-grid');
        const gridCloud = document.getElementById('cloud-saves-grid');

        const hubTitle = document.getElementById('hub-title');

        const switchTab = (tabId) => {
            [btnNew, btnLocal, btnCloud].forEach(btn => btn.classList.remove('selected'));
            [gridTemplates, gridLocal, gridCloud].forEach(grid => grid.style.display = 'none');

            if (tabId === 'new') {
                btnNew.classList.add('selected');
                gridTemplates.style.display = 'grid';
                hubTitle.innerText = "Create New Experience";
            } else if (tabId === 'local') {
                btnLocal.classList.add('selected');
                gridLocal.style.display = 'grid';
                hubTitle.innerText = "My Local Saves";
                this.renderLocalSaves();
            } else if (tabId === 'cloud') {
                btnCloud.classList.add('selected');
                gridCloud.style.display = 'grid';
                hubTitle.innerText = "My Cloud Saves";
                this.renderCloudSaves();
            }
        };

        btnNew.addEventListener('click', () => switchTab('new'));
        btnLocal.addEventListener('click', () => switchTab('local'));
        btnCloud.addEventListener('click', () => switchTab('cloud'));

        document.getElementById('card-baseplate').addEventListener('click', async () => {
            const baseplateState = {
                ClassName: "Folder",
                Name: "Workspace",
                children: [
                    {
                        ClassName: "Part",
                        Name: "Baseplate",
                        Shape: "Block",
                        Size: { x: 200, y: 10, z: 200 },
                        Position: { x: 0, y: -5, z: 0 }, 
                        Color: 0x3a3a3a, 
                        Anchored: true,
                        CanCollide: true,
                        Locked: true 
                    }
                ]
            };

            await this.history.deserializeDataModel({ children: [
                baseplateState,
                { ClassName: "Folder", Name: "ServerScriptService", children: [] },
                { ClassName: "Folder", Name: "StarterGui", children: [] }
            ]});
            this.activeProjectName = "Untitled Game";
            
            hub.style.display = 'none';
            container.style.display = 'flex';
            this.onWindowResize();
        });
    }

    renderLocalSaves() {
        const grid = document.getElementById('local-saves-grid');
        grid.innerHTML = '';
        const games = this.saveService.getLocalGames();

        if (games.length === 0) {
            grid.innerHTML = '<p style="color: #666; font-size: 14px;">No local saves found. Go to "New Template" and create a game!</p>';
            return;
        }

        games.forEach(g => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.style.cssText = 'background-color: #2d2d2d; border: 1px solid #444; border-radius: 6px; padding: 15px; display: flex; flex-direction: column; gap: 10px; cursor: pointer;';
            card.innerHTML = `
                <div style="background-color: #0d47a1; height: 120px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 32px;">💾</div>
                <div style="font-weight: bold; color: white; font-size: 14px;">${g.name}</div>
                <div style="color: #aaa; font-size: 11px;">Last Saved: ${g.lastSaved}</div>
                <div style="display: flex; gap: 8px; margin-top: auto;">
                    <button class="tool-btn edit-btn" style="background-color: #007acc; padding: 6px; font-size: 12px; flex: 1; justify-content: center;">Edit</button>
                    <button class="tool-btn delete-btn" style="background-color: #dc3545; padding: 6px; font-size: 12px; border: none; flex: 1; justify-content: center;">Delete</button>
                </div>
            `;

            card.querySelector('.edit-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.history.deserializeDataModel(g.state);
                this.activeProjectName = g.name;
                document.getElementById('studio-hub').style.display = 'none';
                document.getElementById('studio-container').style.display = 'flex';
                this.onWindowResize();
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${g.name}?`)) {
                    this.saveService.deleteLocalGame(g.id);
                    this.renderLocalSaves();
                }
            });

            grid.appendChild(card);
        });
    }

    renderCloudSaves() {
        const grid = document.getElementById('cloud-saves-grid');
        grid.innerHTML = '';
        const games = this.saveService.getCloudGames();

        if (games.length === 0) {
            grid.innerHTML = '<p style="color: #666; font-size: 14px;">No cloud saves found. Connect your browser and publish online!</p>';
            return;
        }

        games.forEach(g => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.style.cssText = 'background-color: #2d2d2d; border: 1px solid #444; border-radius: 6px; padding: 15px; display: flex; flex-direction: column; gap: 10px; cursor: pointer;';
            card.innerHTML = `
                <div style="background-color: #4a148c; height: 120px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 32px;">☁️</div>
                <div style="font-weight: bold; color: white; font-size: 14px;">${g.name}</div>
                <div style="color: #aaa; font-size: 11px;">Last Saved: ${g.lastSaved}</div>
                <div style="display: flex; gap: 8px; margin-top: auto;">
                    <button class="tool-btn edit-btn" style="background-color: #007acc; padding: 6px; font-size: 12px; flex: 1; justify-content: center;">Edit</button>
                    <button class="tool-btn delete-btn" style="background-color: #dc3545; padding: 6px; font-size: 12px; border: none; flex: 1; justify-content: center;">Delete</button>
                </div>
            `;

            card.querySelector('.edit-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.history.deserializeDataModel(g.state);
                this.activeProjectName = g.name;
                document.getElementById('studio-hub').style.display = 'none';
                document.getElementById('studio-container').style.display = 'flex';
                this.onWindowResize();
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${g.name}?`)) {
                    this.saveService.deleteCloudGame(g.id);
                    this.renderCloudSaves();
                }
            });

            grid.appendChild(card);
        });
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

    resolvePartStacking(activeObj) {
        const activeBox = new THREE.Box3().setFromObject(activeObj);
        const yOffset = activeObj.position.y - activeBox.min.y;

        if (activeBox.min.y < 0) {
            activeObj.position.y = 0 + yOffset;
            activeBox.setFromObject(activeObj); 
        }

        for (const mesh of this.collidableMeshes) {
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

    updatePhysicsParts(delta) {
        const gravity = -32;

        for (const mesh of this.collidableMeshes) {
            const instance = mesh.userData.instance;
            if (!instance || instance.Anchored) continue; 

            if (!instance.velocity) {
                instance.velocity = new THREE.Vector3(0, 0, 0);
            }

            instance.velocity.y += gravity * delta;

            const nextPos = instance.Position.clone().addScaledVector(instance.velocity, delta);
            const halfHeight = instance.Size.y / 2;

            if (nextPos.y - halfHeight <= 0) {
                nextPos.y = halfHeight;
                instance.velocity.y = 0;
                instance.velocity.x *= 0.8; 
                instance.velocity.z *= 0.8;
            }

            const partBox = new THREE.Box3().setFromObject(mesh);
            partBox.min.y += 0.05; 

            for (const otherMesh of this.collidableMeshes) {
                if (otherMesh === mesh) continue;

                const otherInstance = otherMesh.userData.instance;
                if (otherInstance && otherInstance.CanCollide === false) continue;

                const otherBox = new THREE.Box3().setFromObject(otherMesh);
                const overlapX = nextPos.x - instance.Size.x / 2 < otherBox.max.x && nextPos.x + instance.Size.x / 2 > otherBox.min.x;
                const overlapZ = nextPos.z - instance.Size.z / 2 < otherBox.max.z && nextPos.z + instance.Size.z / 2 > otherBox.min.z;

                if (overlapX && overlapZ) {
                    const topOfOther = otherBox.max.y;
                    const bottomOfSelf = nextPos.y - halfHeight;

                    if (bottomOfSelf < topOfOther && instance.Position.y > otherInstance.Position.y) {
                        nextPos.y = topOfOther + halfHeight;
                        instance.velocity.y = 0;
                    }
                }
            }

            instance.Position.copy(nextPos);
            instance.updateTransform();
        }
    }

    groupSelected() {
        if (this.selectedMeshes.length === 0) return;
        this.history.saveState();

        const model = new Model();
        model.Name = "Model";

        const workspace = window.game.children.find(c => c.Name === "Workspace");
        model.Parent = workspace;

        for (const mesh of [...this.selectedMeshes]) {
            const inst = mesh.userData.instance;
            inst.Parent = model; 
        }

        this.ui.selectInstance(model);
        this.logToConsole("Grouped selections into Model", "success");
    }

    ungroupSelected() {
        const inst = this.ui.selectedInstance;
        if (inst && inst.ClassName === "Model") {
            this.history.saveState();
            const parent = inst.Parent;

            for (const child of [...inst.children]) {
                child.Parent = parent; 
            }

            inst.Destroy();
            this.ui.selectInstance(null);
            this.logToConsole("Ungrouped model", "warning");
        }
    }

    // Spawns parts precisely relative to camera's forward gaze raycast
    positionSpawnedPart(instance) {
        const center = new THREE.Vector2(0, 0); 
        this.raycaster.setFromCamera(center, this.camera);
        const intersects = this.raycaster.intersectObjects(this.collidableMeshes);
        
        let spawnPos = new THREE.Vector3();
        if (intersects.length > 0) {
            spawnPos.copy(intersects[0].point);
            spawnPos.y += (instance.Size.y / 2);
        } else {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            spawnPos.copy(this.camera.position).addScaledVector(direction, 12);
        }
        
        instance.Position.copy(spawnPos);
        instance.updateTransform();
    }

    // Focuses the camera onto the selected part over a smooth camera translation curve
    smoothFocus(targetPos) {
        const duration = 500;
        const startPos = this.camera.position.clone();
        const endPos = targetPos.clone().add(new THREE.Vector3(0, 5, 10));
        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const ease = progress * progress * (3 - 2 * progress); // smoothstep
            this.camera.position.lerpVectors(startPos, endPos, ease);
            this.camera.lookAt(targetPos);
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    setupImportActions() {
        // Multi-mesh folder importer with auto physical stacking
        const folderInput = document.getElementById('local-assets-folder-importer');
        const importBtn = document.getElementById('btn-import-assets');

        if (importBtn && folderInput) {
            importBtn.addEventListener('click', () => folderInput.click());
            folderInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                const gltfFiles = files.filter(f => f.name.endsWith('.glb') || f.name.endsWith('.gltf'));
                if (gltfFiles.length === 0) return;

                this.logToConsole(`Importing Folder: Found ${gltfFiles.length} files. Loading...`, 'info');
                
                const fileURLs = {};
                const blobURLsToRevoke = [];
                
                for (const file of files) {
                    const blobURL = URL.createObjectURL(file);
                    blobURLsToRevoke.push(blobURL);
                    fileURLs[file.webkitRelativePath] = blobURL;
                    const parts = file.webkitRelativePath.split('/');
                    const folderRelativePath = parts.slice(1).join('/'); 
                    fileURLs[folderRelativePath] = blobURL;
                    const simpleName = parts[parts.length - 1];
                    fileURLs[simpleName] = blobURL;
                }

                const manager = new THREE.LoadingManager();
                manager.setURLModifier((url) => {
                    let cleanURL = url;
                    try {
                        const parsed = new URL(url, window.location.href);
                        if (parsed.origin === window.location.origin) {
                            cleanURL = parsed.pathname;
                        }
                    } catch (e) {}

                    cleanURL = cleanURL.replace(/^(\.?\/)/, '');
                    cleanURL = decodeURIComponent(cleanURL);
                    const parts = cleanURL.split('/');
                    const simpleName = parts[parts.length - 1];
                    const resolved = fileURLs[cleanURL] || fileURLs[simpleName];
                    if (resolved) {
                        return resolved;
                    }
                    return url;
                });

                const loader = new GLTFLoader(manager);
                let stackHeight = 0.5;

                for (const file of gltfFiles) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        loader.parse(arrayBuffer, '', (gltf) => {
                            const model = new Model();
                            model.Name = file.name.replace(/\.[^/.]+$/, "");
                            model.Parent = window.game.children.find(c => c.Name === "Workspace");

                            const tempObj = gltf.scene.clone();
                            this.scene.add(tempObj);
                            const bbox = new THREE.Box3().setFromObject(tempObj);
                            this.scene.remove(tempObj);

                            const size = new THREE.Vector3();
                            bbox.getSize(size);
                            const center = new THREE.Vector3();
                            bbox.getCenter(center);

                            const offsetPos = new THREE.Vector3(0, stackHeight + size.y / 2, 0);
                            gltf.scene.position.copy(offsetPos).sub(center);

                            let assetCounter = window.importedAssetCounter || 0;
                            gltf.scene.traverse((child) => {
                                if (child.isMesh) {
                                    assetCounter++;
                                    const assetId = `rbxasset://imported-${assetCounter}-${Date.now()}`;
                                    window.importedAssets = window.importedAssets || new Map();
                                    window.importedAssets.set(assetId, {
                                        geometry: child.geometry.clone(),
                                        material: child.material.clone()
                                    });

                                    // Persist structure securely in browser database
                                    saveAssetToDB(assetId, child.geometry, child.material);

                                    const part = new Part();
                                    part.isImportedMesh = true; // Preserve textures
                                    part.importedAssetId = assetId;
                                    part.Name = child.name || "MeshPart";
                                    
                                    const cached = window.importedAssets.get(assetId);
                                    part.geometry = cached.geometry;
                                    part.material = cached.material;
                                    part.mesh.geometry = part.geometry;
                                    part.mesh.material = part.material;
                                    part.Parent = model;

                                    const worldPos = new THREE.Vector3();
                                    child.getWorldPosition(worldPos);
                                    part.Position.copy(worldPos);
                                    part.updateTransform();
                                }
                            });
                            window.importedAssetCounter = assetCounter;

                            this.ui.refreshExplorer();
                            stackHeight += (size.y + 0.5);
                        });
                    } catch (err) {
                        this.logToConsole(`Error reading ${file.name}: ${err.message}`, 'error');
                    }
                }
                
                setTimeout(() => {
                    blobURLsToRevoke.forEach(url => URL.revokeObjectURL(url));
                }, 10000); 
            });
        }

        // Custom Save and Export state files
        document.getElementById('btn-export-project').addEventListener('click', () => {
            const state = this.history.serializeInstance(window.game);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", "WorkspaceExperience.webxl");
            dlAnchor.click();
        });

        const fileImporter = document.getElementById('local-project-file-importer');
        document.getElementById('btn-import-project').addEventListener('click', () => fileImporter.click());
        fileImporter.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (event) => {
                const state = JSON.parse(event.target.result);
                await this.history.deserializeDataModel(state);
            };
            reader.readAsText(file);
        });

        // Console screen cleaner
        document.getElementById('btn-clear-console').addEventListener('click', () => {
            document.getElementById('console-output').innerHTML = '';
        });
    }

    setupControlEvents() {
        window.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });
        this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault(), { capture: true });

        document.addEventListener('click', () => {
            document.getElementById('context-menu').style.display = 'none';
        });

        // Command Bar input executor
        const cmdBar = document.getElementById('command-bar');
        cmdBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = cmdBar.value;
                cmdBar.value = '';
                this.logToConsole(`> ${cmd}`, 'info');

                try {
                    const context = {
                        game: window.game,
                        Instance: {
                            new: (className) => {
                                let inst;
                                if (className === "Part") inst = new Part();
                                else if (className === "SpawnLocation") inst = new SpawnLocation();
                                else if (className === "Script") inst = new Script();
                                else if (className === "LocalScript") inst = new LocalScript();
                                else if (className === "Model") inst = new Model();
                                else if (className === "PointLight") inst = new PointLight();
                                else if (className === "SpotLight") inst = new SpotLight();
                                
                                if (inst) {
                                    const workspace = window.game.children.find(c => c.Name === "Workspace");
                                    inst.Parent = workspace;
                                    this.logToConsole(`Instance: Created new ${className}.`, 'success');
                                    return inst;
                                }
                                return null;
                            }
                        },
                        print: (...args) => this.logToConsole(args.join(' '), 'info'),
                        clear: () => { document.getElementById('console-output').innerHTML = ''; }
                    };

                    const keys = Object.keys(context);
                    const values = Object.values(context);
                    const F = new Function(...keys, cmd);
                    F(...values);
                } catch (err) {
                    this.logToConsole(err.message, 'error');
                }
            }
        });

        // Snap input triggers
        document.getElementById('input-snap-studs').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value) || 0;
            this.transformControls.setTranslationSnap(val);
        });

        document.getElementById('input-snap-deg').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value) || 0;
            this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(val));
        });

        // Context Menu commands
        document.getElementById('menu-copy').addEventListener('click', () => {
            const inst = this.ui.selectedInstances[0];
            if (inst) {
                this.clipboard = this.history.serializeInstance(inst);
                this.logToConsole(`Copied: ${inst.Name} to clipboard.`, 'info');
            }
        });

        document.getElementById('menu-paste').addEventListener('click', () => {
            if (this.clipboard) {
                this.history.saveState();
                const parent = this.ui.selectedInstances[0] || window.game.children.find(c => c.Name === "Workspace");
                const newPartData = JSON.parse(JSON.stringify(this.clipboard)); 
                if (newPartData.ClassName === "Part" || newPartData.ClassName === "SpawnLocation") {
                    newPartData.Position.x += 4; 
                }
                this.history.loadStateIntoFolder({ children: [newPartData] }, parent);
                this.logToConsole(`Pasted: ${newPartData.Name} under ${parent.Name}.`, 'success');
            }
        });

        document.getElementById('menu-duplicate').addEventListener('click', () => {
            const inst = this.ui.selectedInstances[0];
            if (inst && inst.Parent) {
                this.history.saveState();
                const serialized = this.history.serializeInstance(inst);
                serialized.Name += "_Copy";
                if (serialized.ClassName === "Part" || serialized.ClassName === "SpawnLocation") {
                    serialized.Position.x += 4;
                }
                this.history.loadStateIntoFolder({ children: [serialized] }, inst.Parent);
                this.logToConsole(`Duplicated: ${inst.Name}`, 'success');
            }
        });

        document.getElementById('menu-delete').addEventListener('click', () => {
            this.ui.selectedInstances.forEach(inst => {
                this.logToConsole(`Deleted: ${inst.Name}`, 'warning');
                inst.Destroy();
            });
            this.history.saveState();
            this.ui.selectInstance(null);
        });

        document.getElementById('menu-rename').addEventListener('click', () => {
            const inst = this.ui.selectedInstances[0];
            if (inst) {
                const newName = prompt("Rename:", inst.Name);
                if (newName) {
                    this.history.saveState();
                    inst.Name = newName;
                    window.dispatchEvent(new CustomEvent('explorer-changed'));
                    this.ui.refreshProperties();
                }
            }
        });

        // Top locking and anchoring actions
        const btnLock = document.getElementById('btn-tool-lock');
        if (btnLock) {
            btnLock.addEventListener('click', () => {
                this.ui.selectedInstances.forEach(inst => {
                    if (inst.ClassName === "Part" || inst.ClassName === "SpawnLocation") {
                        inst.Locked = !inst.Locked;
                    }
                });
                this.ui.refreshExplorer();
                this.ui.refreshProperties();
            });
        }

        const btnAnchor = document.getElementById('btn-tool-anchor');
        if (btnAnchor) {
            btnAnchor.addEventListener('click', () => {
                this.ui.selectedInstances.forEach(inst => {
                    if (inst.ClassName === "Part" || inst.ClassName === "SpawnLocation") {
                        inst.Anchored = !inst.Anchored;
                    }
                });
                this.ui.refreshExplorer();
                this.ui.refreshProperties();
            });
        }

        // Play and Stop test buttons
        document.getElementById('btn-play').addEventListener('click', () => this.startPlaytest());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopPlaytest());

        // Escape Menu
        document.getElementById('menu-btn-resume').addEventListener('click', () => this.togglePauseMenu());
        document.getElementById('menu-btn-reset').addEventListener('click', () => {
            this.togglePauseMenu();
            this.resetCharacter();
        });
        document.getElementById('menu-btn-leave').addEventListener('click', () => {
            this.togglePauseMenu();
            this.stopPlaytest();
        });

        // project saves
        document.getElementById('btn-save').addEventListener('click', () => {
            const name = prompt("Enter experience name to save locally:", this.activeProjectName || "My Awesome Game");
            if (name) {
                this.saveService.saveLocal(name);
                this.activeProjectName = name;
            }
        });

        document.getElementById('btn-publish').addEventListener('click', () => {
            const name = prompt("Enter experience name to upload to Cloud:", this.activeProjectName || "My Awesome Game");
            if (name) {
                this.saveService.saveCloud(name, () => {
                    this.activeProjectName = name;
                });
            }
        });

        document.getElementById('btn-close-project').addEventListener('click', () => {
            if (confirm("Are you sure you want to close this project and return to Studio Hub? Unsaved progress will be lost.")) {
                document.getElementById('studio-hub').style.display = 'flex';
                document.getElementById('studio-container').style.display = 'none';
                this.ui.selectInstance(null);
                this.stopPlaytest();
            }
        });

        // Setup Selection Tool Buttons
        const btnSelect = document.getElementById('btn-tool-select');
        const btnMove = document.getElementById('btn-tool-move');
        const btnScale = document.getElementById('btn-tool-scale');
        const btnRotate = document.getElementById('btn-tool-rotate');

        const setActiveToolBtn = (activeBtn) => {
            [btnSelect, btnMove, btnScale, btnRotate].forEach(btn => btn.classList.remove('active'));
            activeBtn.classList.add('active');
        };

        btnSelect.addEventListener('click', () => {
            setActiveToolBtn(btnSelect);
            this.currentTool = 'select';
            this.transformControls.detach(); 
        });

        btnMove.addEventListener('click', () => {
            setActiveToolBtn(btnMove);
            this.currentTool = 'move';
            this.transformControls.setMode('translate');
            if (this.selectedMeshes.length > 0) this.transformControls.attach(this.selectedMeshes[0]);
        });

        btnScale.addEventListener('click', () => {
            setActiveToolBtn(btnScale);
            this.currentTool = 'scale';
            this.transformControls.setMode('scale');
            if (this.selectedMeshes.length > 0) this.transformControls.attach(this.selectedMeshes[0]);
        });

        btnRotate.addEventListener('click', () => {
            setActiveToolBtn(btnRotate);
            this.currentTool = 'rotate';
            this.transformControls.setMode('rotate');
            if (this.selectedMeshes.length > 0) this.transformControls.attach(this.selectedMeshes[0]);
        });

        const onKeyDown = (e) => {
            if (document.activeElement === cmdBar || document.activeElement === document.getElementById('code-area')) return;

            // Roblox Escape Pause Menu toggle 
            if (e.code === 'Escape') {
                e.preventDefault();
                if (this.isPlaytesting) {
                    this.togglePauseMenu();
                }
                return;
            }

            if (e.ctrlKey && e.code === 'KeyZ') {
                e.preventDefault();
                this.history.undo();
                this.ui.selectInstance(null);
                this.logToConsole("Executed Undo", "info");
                return;
            }
            if (e.ctrlKey && e.code === 'KeyY') {
                e.preventDefault();
                this.history.redo();
                this.ui.selectInstance(null);
                this.logToConsole("Executed Redo", "info");
                return;
            }

            // Keyboard Hotkeys
            if (e.ctrlKey && e.code === 'KeyG') {
                e.preventDefault();
                this.groupSelected(); 
                return;
            }
            if (e.ctrlKey && e.code === 'KeyU') {
                e.preventDefault();
                this.ungroupSelected(); 
                return;
            }
            if (e.ctrlKey && e.code === 'KeyL') {
                e.preventDefault();
                const isLocal = this.transformControls.space === 'local';
                this.transformControls.setSpace(isLocal ? 'world' : 'local');
                this.logToConsole(`Transformed coordinate space changed to: ${this.transformControls.space.toUpperCase()}`, 'info');
                return;
            }

            // Focus Key (F)
            if (e.code === 'KeyF') {
                e.preventDefault();
                if (this.isPlaytesting) {
                    this.teleportCharacterToSelected();
                } else {
                    if (this.selectedMeshes.length > 0) {
                        this.smoothFocus(this.selectedMeshes[0].position);
                    }
                }
            }

            switch(e.code) {
                case 'KeyW': case 'ArrowUp': this.keys.w = true; break;
                case 'KeyA': case 'ArrowLeft': this.keys.a = true; break;
                case 'KeyS': case 'ArrowDown': this.keys.s = true; break;
                case 'KeyD': case 'ArrowRight': this.keys.d = true; break;
                case 'KeyQ': this.keys.q = true; break; 
                case 'KeyE': this.keys.e = true; break; 
                case 'Space': this.keys.space = true; break;
                case 'ShiftLeft': case 'ShiftRight':
                    if (this.isPlaytesting) {
                        this.toggleShiftLock();
                    } else {
                        this.keys.shift = true;
                    }
                    break;
            }
        };

        const onKeyUp = (e) => {
            switch(e.code) {
                case 'KeyW': case 'ArrowUp': this.keys.w = false; break;
                case 'KeyA': case 'ArrowLeft': this.keys.a = false; break;
                case 'KeyS': case 'ArrowDown': this.keys.s = false; break;
                case 'KeyD': case 'ArrowRight': this.keys.d = false; break;
                case 'KeyQ': this.keys.q = false; break;
                case 'KeyE': this.keys.e = false; break;
                case 'Space': this.keys.space = false; break; 
                case 'ShiftLeft': case 'ShiftRight': this.keys.shift = false; break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // Click-to-lock mouse checking
        this.renderer.domElement.addEventListener('click', (e) => {
            if (this.isPlaytesting) {
                if (document.getElementById('roblox-escape-menu').style.display === 'flex') return;

                if (this.cameraController.shiftLockActive || this.cameraController.isFirstPerson) {
                    this.renderer.domElement.requestPointerLock();
                }
            } else {
                if (this.blockNextClick || this.transformControls.dragging) return;

                const mouse = new THREE.Vector2();
                const rect = this.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.collidableMeshes);

                if (intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const instance = hitMesh.userData.instance;
                    
                    if (instance && instance.Locked) {
                        if (!e.ctrlKey) this.ui.selectInstance(null);
                    } else {
                        if (e.ctrlKey) {
                            this.ui.selectInstance(instance, true);
                        } else {
                            this.ui.selectInstance(instance); 
                        }
                    }
                } else {
                    if (!e.ctrlKey) {
                        this.ui.selectInstance(null); 
                    }
                }
            }
        });

        // Mouse down control bindings
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                const mouse = new THREE.Vector2();
                const rect = this.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.collidableMeshes);

                if (intersects.length > 0 && !this.isPlaytesting) {
                    this.cameraController.rightMouseDown = false;
                    const hitMesh = intersects[0].object;
                    const instance = hitMesh.userData.instance;
                    
                    if (instance && instance.Locked) {
                        this.cameraController.rightMouseDown = true; 
                    } else {
                        this.ui.selectInstance(instance);
                        this.showContextMenu(e.clientX, e.clientY);
                    }
                } else {
                    this.cameraController.rightMouseDown = true;
                }
            } else if (e.button === 0 && !this.isPlaytesting && this.currentTool === 'select') {
                const mouse = new THREE.Vector2();
                const rect = this.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.collidableMeshes);

                if (intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const instance = hitMesh.userData.instance;

                    if (instance && instance.Locked) {
                        this.isDraggingMesh = false;
                        this.draggedMesh = null;
                    } else {
                        this.isDraggingMesh = true;
                        this.draggedMesh = hitMesh;
                        this.ui.selectInstance(instance);
                        this.history.saveState(); 
                    }
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) this.cameraController.rightMouseDown = false;
            if (e.button === 0) {
                this.isDraggingMesh = false;
                this.draggedMesh = null;
            }
        });

        // Mouse rotation & direct dragging execution
        document.addEventListener('mousemove', (e) => {
            const isLocked = document.pointerLockElement === this.renderer.domElement;
            
            if (this.isDraggingMesh && this.draggedMesh && !this.isPlaytesting) {
                const mouse = new THREE.Vector2();
                const rect = this.renderer.domElement.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(mouse, this.camera);
                
                const targets = this.collidableMeshes.filter(t => t && t !== this.draggedMesh);
                const intersects = this.raycaster.intersectObjects(targets);

                let hitPoint = new THREE.Vector3();

                if (intersects.length > 0) {
                    hitPoint.copy(intersects[0].point);
                } else {
                    const planeXZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                    this.raycaster.ray.intersectPlane(planeXZ, hitPoint);
                }

                const snappedX = Math.round(hitPoint.x);
                const snappedZ = Math.round(hitPoint.z);

                const activeBox = new THREE.Box3().setFromObject(this.draggedMesh);
                const yOffset = this.draggedMesh.position.y - activeBox.min.y;

                this.draggedMesh.position.set(snappedX, hitPoint.y + yOffset, snappedZ);
                this.resolvePartStacking(this.draggedMesh);

                const instance = this.draggedMesh.userData.instance;
                instance.Position.copy(this.draggedMesh.position);
                instance.updateTransform();

                this.updateSelectionOutlines();
                this.ui.refreshProperties();
            } else if (isLocked || this.cameraController.rightMouseDown) {
                const sensitivity = 0.0025;
                this.cameraController.cameraYaw -= e.movementX * sensitivity;
                this.cameraController.cameraPitch += e.movementY * sensitivity;

                if (this.isPlaytesting) {
                    this.cameraController.cameraPitch = Math.max(-0.25, Math.min(Math.PI / 2 - 0.05, this.cameraController.cameraPitch));
                } else {
                    this.cameraController.cameraPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.cameraController.cameraPitch));
                }
            }
        });

        // Pointer Lock state updates
        document.addEventListener('pointerlockchange', () => {
            const isLocked = document.pointerLockElement === this.renderer.domElement;
            const crosshair = document.getElementById('crosshair');
            if (isLocked) {
                crosshair.style.display = 'block';
            } else {
                if (!this.cameraController.shiftLockActive && !this.cameraController.isFirstPerson) {
                    crosshair.style.display = 'none';
                }
            }
        });

        // Zoom functionality mapping directly into cameraController's tracker
        window.addEventListener('wheel', (e) => {
            if (!this.isPlaytesting) return; 

            this.cameraController.cameraDistance += e.deltaY * 0.01;
            this.cameraController.cameraDistance = Math.max(0.2, Math.min(this.cameraController.cameraDistance, 25));

            if (this.cameraController.cameraDistance < 0.8) {
                if (!this.cameraController.isFirstPerson) {
                    this.cameraController.isFirstPerson = true;
                    this.renderer.domElement.requestPointerLock();
                }
            } else {
                if (this.cameraController.isFirstPerson) {
                    this.cameraController.isFirstPerson = false;
                    if (!this.cameraController.shiftLockActive) {
                        document.exitPointerLock();
                    }
                }
            }
        });
    }

    toggleShiftLock() {
        if (this.cameraController.isFirstPerson) return;
        this.cameraController.shiftLockActive = !this.cameraController.shiftLockActive;
        const crosshair = document.getElementById('crosshair');

        if (this.cameraController.shiftLockActive) {
            crosshair.style.display = 'block';
            this.renderer.domElement.requestPointerLock();
        } else {
            crosshair.style.display = 'none';
            document.exitPointerLock();
        }
    }

    togglePauseMenu() {
        const menu = document.getElementById('roblox-escape-menu');
        const isVisible = menu.style.display === 'flex';

        if (isVisible) {
            menu.style.display = 'none';
            if (this.cameraController.shiftLockActive || this.cameraController.isFirstPerson) {
                this.renderer.domElement.requestPointerLock();
            }
        } else {
            menu.style.display = 'flex';
            document.exitPointerLock(); 
        }
    }

    resetCharacter() {
        if (!this.isPlaytesting || !this.characterController) return;
        
        if (this.characterController.isDead) return; 

        this.characterController.die();
        this.logToConsole("Oof! Character reset.", "warning");

        setTimeout(() => {
            if (this.isPlaytesting) {
                this.respawnCharacter();
            }
        }, 3000);
    }

    respawnCharacter() {
        if (!this.isPlaytesting) return;

        this.characterController.isDead = false;
        this.characterController.characterMesh.rotation.z = 0; 

        if (this.characterController.mixer) {
            this.characterController.mixer.stopAllAction();
        }
        if (this.characterController.actions['idle']) {
            this.characterController.actions['idle'].play();
        }
        this.characterController.activeActionName = 'idle';

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
            this.characterController.characterGroup.position.copy(spawn.Position).y += (spawn.Size.y / 2 + 0.1);
        } else {
            this.characterController.characterGroup.position.set(0, 0.5, 0);
        }

        this.logToConsole("Character respawned successfully.", "success");
    }

    focusCameraOnSelected() {
        if (this.selectedMeshes.length > 0) {
            const targetPos = this.selectedMeshes[0].position;
            this.cameraController.cameraYaw = 0;
            this.cameraController.cameraPitch = 0.45;
            this.camera.position.set(targetPos.x, targetPos.y + 4, targetPos.z + 8);
            this.logToConsole(`Camera focused on: ${this.selectedMeshes[0].userData.instance.Name}`, 'info');
        }
    }

    teleportCharacterToSelected() {
        if (this.characterController.characterGroup && this.selectedMeshes.length > 0) {
            const mesh = this.selectedMeshes[0];
            const activeBox = new THREE.Box3().setFromObject(mesh);

            this.characterController.characterGroup.position.set(mesh.position.x, activeBox.max.y + 0.1, mesh.position.z);
            this.logToConsole("Teleported character.", "success");
        }
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        
        const menuWidth = 150;
        let menuX = x;
        if (x + menuWidth > window.innerWidth) {
            menuX = window.innerWidth - menuWidth - 10;
        }

        menu.style.left = `${menuX}px`;
        menu.style.top = `${y}px`;
    }

    updateSelectionOutlines() {
        for (const helper of this.selectionHelpers) {
            this.scene.remove(helper);
        }
        this.selectionHelpers = [];

        for (const mesh of this.selectedMeshes) {
            const helper = new THREE.BoxHelper(mesh, 0x00ff00);
            this.scene.add(helper);
            this.selectionHelpers.push(helper);
        }
    }

    refreshMultiSelection() {
        this.updateSelectionOutlines();

        if (this.selectedMeshes.length > 0) {
            const primaryMesh = this.selectedMeshes[this.selectedMeshes.length - 1];
            if (this.currentTool !== 'select') {
                this.transformControls.attach(primaryMesh);
            } else {
                this.transformControls.detach();
            }
        } else {
            this.transformControls.detach();
        }
    }

    selectPart(instance) {
        if (instance && (instance.ClassName === "Part" || instance.ClassName === "SpawnLocation")) {
            this.selectedMeshes = [instance.mesh];
            this.refreshMultiSelection();
        } else {
            this.selectedMeshes = [];
            this.refreshMultiSelection();
        }
    }

    startPlaytest() {
        this.playtestSnapshot = this.history.serializeInstance(window.game);

        this.isPlaytesting = true;

        document.getElementById('btn-play').style.display = 'none';
        document.getElementById('btn-pause').style.display = 'block';
        document.getElementById('btn-stop').style.display = 'block';

        this.transformControls.detach();
        this.transformControls.enabled = false;
        this.transformControls.visible = false;
        
        for (const helper of this.selectionHelpers) {
            this.scene.remove(helper);
        }
        this.selectionHelpers = [];

        this.keys.w = false; this.keys.a = false; this.keys.s = false; this.keys.d = false;
        this.keys.q = false; this.keys.e = false; this.keys.space = false;

        this.cameraController.cameraYaw = 0;
        this.cameraController.cameraPitch = 0.2;
        this.cameraController.cameraDistance = 5;

        this.guiService.sync();

        this.characterController.load(() => {
            // Callback placeholder
        });

        const sssFolder = window.game.children.find(c => c.Name === "ServerScriptService");
        if (sssFolder) {
            this.scriptSystem.executeAll(sssFolder);
        }
    }

    async stopPlaytest() {
        this.isPlaytesting = false;

        document.getElementById('btn-play').style.display = 'block';
        document.getElementById('btn-pause').style.display = 'none';
        document.getElementById('btn-stop').style.display = 'none';

        document.getElementById('roblox-escape-menu').style.display = 'none';

        this.scriptSystem.stopAll();

        this.characterController.destroy();

        if (this.playtestSnapshot) {
            await this.history.deserializeDataModel(this.playtestSnapshot);
            this.playtestSnapshot = null;
        }

        this.guiService.sync();

        this.transformControls.enabled = true;
        this.transformControls.visible = true;
        this.refreshMultiSelection();

        this.cameraController.shiftLockActive = false;
        document.getElementById('crosshair').style.display = 'none';

        document.exitPointerLock();
    }

    onWindowResize() {
        this.camera.aspect = (window.innerWidth - 290) / (window.innerHeight - 240); 
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(window.innerWidth - 290, window.innerHeight - 240);
        this.cssRenderer.setSize(window.innerWidth - 290, window.innerHeight - 240);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        if (delta > 0.1) return;

        // Camera move velocity tracking when holding Shift
        const cameraSpeedMultiplier = this.keys.shift ? 0.25 : 1.0;

        if (this.isPlaytesting && this.characterController.characterGroup) {
            this.updatePhysicsParts(delta);

            this.characterController.update(
                delta, 
                this.camera, 
                this.cameraController.shiftLockActive, 
                this.cameraController.isFirstPerson,
                this.cameraController.cameraYaw,
                this.collidableMeshes
            );
            this.cameraController.update(this.characterController.characterGroup);
            
            this.cssRenderer.render(this.scene, this.camera);
        } else {
            if ((this.transformControls && this.transformControls.dragging) || this.isDraggingMesh) {
                this.cameraController.updateEditMode(delta * cameraSpeedMultiplier, { w: false, a: false, s: false, d: false, q: false, e: false });
            } else {
                this.cameraController.updateEditMode(delta * cameraSpeedMultiplier, this.keys);
            }
            
            this.cssRenderer.render(this.scene, this.camera);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.engine = new StudioEngine();
window.engine.animate();