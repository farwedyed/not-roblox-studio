import * as THREE from 'three';
import { Part, LightBlock, SpawnLocation, Water, Terrain, Script, LocalScript, Decal, Sound, ScreenGui, Frame, TextLabel, TextButton, Model, PointLight, SpotLight, BillboardGui, SurfaceGui, Humanoid, Tool, Player } from './Instance.js';

export class StudioUI {
    constructor(explorerRoot) {
        this.gameRoot = explorerRoot;
        this.explorerTree = document.getElementById('explorer-tree');
        this.propertiesGrid = document.getElementById('properties-grid');
        this.viewModelContainer = document.getElementById('viewmodel-container');
        this.selectedInstances = []; 
        this.expandedNodes = new Set(); 
        this.searchQuery = "";
        this._offscreenRenderer = null;

        window.terrainSculptMode = "raise";
        window.terrainBrushRadius = 15;
        window.terrainBrushStrength = 0.4;

        this.setupEditorModal();
        this.setupButtonEvents();
        this.setupSearch();

        window.addEventListener('explorer-changed', () => this.refreshExplorer());
        window.addEventListener('viewmodel-changed', () => this.refreshViewModelPanel());
        
        this.refreshExplorer();
        this.refreshViewModelPanel();
    }

    get selectedInstance() {
        return this.selectedInstances[0] || null;
    }

    getOffscreenRenderer() {
        if (!this._offscreenRenderer) {
            const canvas = document.createElement('canvas');
            canvas.width = 120;
            canvas.height = 120;
            this._offscreenRenderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true
            });
            this._offscreenRenderer.setSize(120, 120);
        }
        return this._offscreenRenderer;
    }

    setupSearch() {
        const searchInput = document.getElementById('explorer-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.refreshExplorer();
            });
        }
    }

    setupButtonEvents() {
        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const shape = e.target.getAttribute('data-shape');
                if (shape) {
                    this.spawnInstanceBySelection(shape);
                    document.getElementById('part-dropdown-menu').style.display = 'none';
                }
            });
        });

        const partTrigger = document.getElementById('btn-part-trigger');
        if (partTrigger) {
            partTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = document.getElementById('part-dropdown-menu');
                menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
            });
        }

        document.getElementById('btn-tool-script')?.addEventListener('click', () => {
            const script = new Script();
            script.Parent = this.selectedInstance || this.gameRoot.children.find(c => c.Name === "Workspace");
            this.selectInstance(script);
        });

        document.getElementById('btn-tool-localscript')?.addEventListener('click', () => {
            const script = new LocalScript();
            script.Parent = this.selectedInstance || this.gameRoot.children.find(c => c.Name === "StarterGui");
            this.selectInstance(script);
        });

        document.addEventListener('click', () => {
            const menu = document.getElementById('part-dropdown-menu');
            if (menu) menu.style.display = 'none';
        });
    }

    spawnInstanceBySelection(shape) {
        let instance;
        const workspace = this.gameRoot.children.find(c => c.Name === "Workspace");
        
        if (shape === "SpawnLocation") {
            instance = new SpawnLocation();
        } else if (shape === "Water") {
            instance = new Water();
        } else if (shape === "Terrain") {
            instance = new Terrain();
        } else if (shape === "LightBlock" || shape === "Light") {
            instance = new LightBlock("Block");
        } else {
            instance = new Part(shape);
        }

        instance.Parent = workspace;

        if (window.engine) {
            window.engine.positionSpawnedPart(instance);
        }
        this.selectInstance(instance);
    }

    setupEditorModal() {
        this.modal = document.getElementById('script-editor-modal');
        this.codeArea = document.getElementById('code-area');
        this.saveBtn = document.getElementById('btn-save-script');
        this.editingScript = null;

        this.saveBtn?.addEventListener('click', () => {
            if (this.editingScript) {
                if (window.engine && window.engine.history) window.engine.history.saveState();
                this.editingScript.Source = this.codeArea.value;
            }
            this.modal.style.display = 'none';
            this.editingScript = null;
            this.refreshProperties();
        });
    }

    openScriptEditor(scriptInstance) {
        this.editingScript = scriptInstance;
        this.codeArea.value = scriptInstance.Source;
        document.getElementById('editor-title').innerText = `Script Editor - ${scriptInstance.Name}`;
        this.modal.style.display = 'flex';
    }

    refreshViewModelPanel() {
        if (!this.viewModelContainer) return;
        this.viewModelContainer.innerHTML = '';

        const folders = window.importedFolderRegistry || {};
        const folderNames = Object.keys(folders);

        const badge = document.getElementById('viewmodel-count-badge');
        if (badge) badge.innerText = `${folderNames.length} Folders`;

        if (folderNames.length === 0) {
            this.viewModelContainer.innerHTML = `
                <p style="color: #666; font-size: 11px; text-align: center; margin-top: 20px;">
                    Upload a 3D assets folder via the "Import Folder" button to view and place models here!
                </p>`;
            return;
        }

        folderNames.forEach(folderName => {
            const modelsList = folders[folderName];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'folder-group';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'folder-header';
            headerDiv.innerHTML = `<span>📁 ${folderName}</span> <span style="margin-left: auto; color: #888; font-size: 10px;">(${modelsList.length} items)</span>`;
            groupDiv.appendChild(headerDiv);

            const gridDiv = document.createElement('div');
            gridDiv.className = 'model-cards-grid';

            modelsList.forEach((modelData, idx) => {
                const card = document.createElement('div');
                card.className = 'model-card';

                const img = document.createElement('img');
                img.className = 'model-thumb';
                img.src = modelData.thumbUrl || '';
                img.alt = modelData.name;

                const title = document.createElement('div');
                title.className = 'model-card-title';
                title.innerText = modelData.name;
                title.title = modelData.name;

                const btn = document.createElement('button');
                btn.className = 'model-insert-btn';
                btn.innerText = '➕ Insert';

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.spawnViewModel(folderName, idx);
                });

                card.appendChild(img);
                card.appendChild(title);
                card.appendChild(btn);
                gridDiv.appendChild(card);
            });

            groupDiv.appendChild(gridDiv);
            this.viewModelContainer.appendChild(groupDiv);
        });
    }

    spawnViewModel(folderName, index) {
        const folder = window.importedFolderRegistry?.[folderName];
        if (!folder || !folder[index]) return;

        const modelEntry = folder[index];
        if (window.engine && window.engine.history) window.engine.history.saveState();

        const workspace = this.gameRoot.children.find(c => c.Name === "Workspace");
        const modelInstance = new Model();
        modelInstance.Name = modelEntry.name;
        modelInstance.Parent = workspace;

        modelEntry.meshEntries.forEach(meshData => {
            const part = new Part();
            part.isImportedMesh = true;
            part.importedAssetId = meshData.assetId;
            part.Name = meshData.name;

            window.importedAssets = window.importedAssets || new Map();
            const cached = window.importedAssets.get(meshData.assetId);

            if (cached) {
                part.geometry = cached.geometry.clone();
                part.material = cached.material.clone();
                part.mesh.geometry = part.geometry;
                part.mesh.material = part.material;
            }

            part.Position.copy(meshData.relativePos);
            part.Parent = modelInstance;
            part.updateTransform();
        });

        if (window.engine) {
            window.engine.positionSpawnedPart(modelInstance);
            window.engine.logToConsole(`Inserted model "${modelEntry.name}" from folder "${folderName}" into Workspace.`, 'success');
        }

        this.selectInstance(modelInstance);
        window.dispatchEvent(new CustomEvent('explorer-changed'));
    }

    updateToolbarStates() {
        const btnAnchor = document.getElementById('btn-tool-anchor');
        const btnLock = document.getElementById('btn-tool-lock');

        if (btnAnchor) {
            const isAnchored = this.selectedInstances.length > 0 && 
                this.selectedInstances.every(inst => inst.Anchored === true);
            btnAnchor.classList.toggle('active', isAnchored);
        }

        if (btnLock) {
            const isLocked = this.selectedInstances.length > 0 && 
                this.selectedInstances.every(inst => inst.Locked === true);
            btnLock.classList.toggle('active', isLocked);
        }
    }

    selectInstance(instance, addToSelection = false) {
        if (addToSelection) {
            if (instance) {
                const idx = this.selectedInstances.indexOf(instance);
                if (idx > -1) {
                    this.selectedInstances.splice(idx, 1);
                } else {
                    this.selectedInstances.push(instance);
                }
            }
        } else {
            this.selectedInstances = instance ? [instance] : [];
        }

        this.refreshExplorer();
        this.refreshProperties();
        this.updateToolbarStates();

        if (window.engine) {
            if (typeof window.engine.selectMultipleParts === 'function') {
                window.engine.selectMultipleParts(this.selectedInstances);
            } else if (typeof window.engine.selectPart === 'function') {
                window.engine.selectPart(instance);
            }
        }

        window.dispatchEvent(new CustomEvent('gui-changed'));
    }

    showInsertMenu(x, y, parentInstance) {
        const oldMenu = document.getElementById('explorer-insert-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'explorer-insert-menu';
        menu.style.position = 'absolute';
        
        const menuWidth = 160;
        let menuX = x;
        if (x + menuWidth > window.innerWidth) {
            menuX = window.innerWidth - menuWidth - 10;
        }

        menu.style.left = `${menuX}px`;
        menu.style.top = `${y}px`;
        menu.style.backgroundColor = '#2c2c2c';
        menu.style.border = '1px solid #444';
        menu.style.borderRadius = '4px';
        menu.style.zIndex = '100000';
        menu.style.width = `${menuWidth}px`;
        menu.style.padding = '4px 0';
        menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

        let options = [];
        if (parentInstance.Name === "Players" || parentInstance.ClassName === "Players") {
            options = ["Player"];
        } else if (parentInstance.Name === "Workspace" || parentInstance.ClassName === "Part" || parentInstance.ClassName === "LightBlock" || parentInstance.ClassName === "SpawnLocation" || parentInstance.ClassName === "Model") {
            options = ["Block", "Sphere", "Cylinder", "Wedge", "LightBlock", "SpawnLocation", "Terrain", "Water", "Model", "Humanoid", "Tool", "PointLight", "SpotLight", "Script", "LocalScript", "BillboardGui", "SurfaceGui", "Decal", "Sound"];
        } else if (parentInstance.Name === "StarterGui" || parentInstance.ClassName === "ScreenGui" || parentInstance.ClassName === "Frame" || parentInstance.ClassName === "TextLabel" || parentInstance.ClassName === "TextButton" || parentInstance.ClassName === "BillboardGui" || parentInstance.ClassName === "SurfaceGui") {
            options = ["ScreenGui", "Frame", "TextLabel", "TextButton"];
        } else if (parentInstance.Name === "ServerScriptService" || parentInstance.Name === "StarterCharacterScripts") {
            options = ["Script", "LocalScript"];
        } else {
            options = ["Block", "Sphere", "Cylinder", "Wedge", "LightBlock", "SpawnLocation", "Terrain", "Water", "Model", "Humanoid", "Tool", "PointLight", "SpotLight", "Script", "LocalScript", "BillboardGui", "SurfaceGui", "ScreenGui", "Frame", "TextLabel", "TextButton", "Decal", "Sound", "Player"];
        }

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'context-item';
            item.style.padding = '6px 12px';
            item.style.fontSize = '12px';
            item.style.cursor = 'pointer';
            item.style.color = 'white';
            
            let icon = "📁";
            if (opt === "Block") icon = "🧱";
            else if (opt === "Sphere") icon = "🟡";
            else if (opt === "Cylinder") icon = "🧪";
            else if (opt === "Wedge") icon = "📐";
            else if (opt === "LightBlock") icon = "🌟";
            else if (opt === "SpawnLocation") icon = "🏁";
            else if (opt === "Terrain") icon = "⛰️";
            else if (opt === "Water") icon = "🌊";
            else if (opt === "Humanoid") icon = "🏃";
            else if (opt === "Player") icon = "👤";
            else if (opt === "Tool") icon = "🗡️";
            else if (opt === "Script") icon = "📜";
            else if (opt === "LocalScript") icon = "💻";
            else if (opt === "Model") icon = "📦";
            else if (opt === "PointLight") icon = "💡";
            else if (opt === "SpotLight") icon = "🔦";
            else if (opt === "BillboardGui") icon = "💬";
            else if (opt === "SurfaceGui") icon = "📐";
            else if (opt === "ScreenGui") icon = "🖼️";
            else if (opt === "Frame") icon = "⬜";
            else if (opt === "TextLabel") icon = "🔤";
            else if (opt === "TextButton") icon = "🔘";
            else if (opt === "Decal") icon = "🖼️";
            else if (opt === "Sound") icon = "🔊";

            item.innerHTML = `${icon} Insert ${opt}`;

            item.addEventListener('click', () => {
                if (window.engine && window.engine.history) window.engine.history.saveState();
                
                let child;
                if (opt === "SpawnLocation") child = new SpawnLocation();
                else if (opt === "Humanoid") child = new Humanoid();
                else if (opt === "Player") child = new Player(`Player${parentInstance.children.length + 1}`);
                else if (opt === "Tool") child = new Tool();
                else if (opt === "LightBlock") child = new LightBlock();
                else if (opt === "Terrain") child = new Terrain();
                else if (opt === "Water") child = new Water();
                else if (opt === "Script") child = new Script();
                else if (opt === "LocalScript") child = new LocalScript();
                else if (opt === "Model") child = new Model();
                else if (opt === "PointLight") child = new PointLight();
                else if (opt === "SpotLight") child = new SpotLight();
                else if (opt === "BillboardGui") child = new BillboardGui();
                else if (opt === "SurfaceGui") child = new SurfaceGui();
                else if (opt === "ScreenGui") child = new ScreenGui();
                else if (opt === "Frame") child = new Frame();
                else if (opt === "TextLabel") child = new TextLabel();
                else if (opt === "TextButton") child = new TextButton();
                else if (opt === "Decal") child = new Decal();
                else if (opt === "Sound") child = new Sound();
                else child = new Part(opt);

                child.Parent = parentInstance;
                this.selectInstance(child);
                menu.remove();
            });

            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        const dismiss = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', dismiss, { capture: true });
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', dismiss, { capture: true });
        }, 10);
    }

    refreshExplorer() {
        this.explorerTree.innerHTML = '';
        
        const isDescendantOf = (target, parent) => {
            if (!target) return false;
            if (target === parent) return true;
            return isDescendantOf(target.Parent, parent);
        };

        const renderNode = (instance, container, indent = 0) => {
            const matchesSearch = instance.Name.toLowerCase().includes(this.searchQuery);
            if (this.searchQuery && !matchesSearch) {
                for (const child of instance.children) {
                    renderNode(child, container, indent);
                }
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';

            const el = document.createElement('div');
            el.className = `explorer-item`;
            if (this.selectedInstances.includes(instance)) el.classList.add('selected');
            el.style.paddingLeft = `${indent * 12 + 6}px`;
            
            let icon = "📁";
            if (instance.ClassName === "Part") {
                if (instance.Shape === "Sphere") icon = "🟡";
                else if (instance.Shape === "Cylinder") icon = "🧪";
                else if (instance.Shape === "Wedge") icon = "📐";
                else icon = "🧱";
            }
            if (instance.ClassName === "Humanoid") icon = "🏃";
            if (instance.ClassName === "Players") icon = "👥";
            if (instance.ClassName === "Player") icon = "👤";
            if (instance.ClassName === "Backpack") icon = "🎒";
            if (instance.ClassName === "PlayerGui") icon = "🖥️";
            if (instance.ClassName === "PlayerScripts") icon = "📜";
            if (instance.ClassName === "Tool") icon = "🗡️";
            if (instance.ClassName === "LightBlock") icon = "🌟";
            if (instance.ClassName === "SpawnLocation") icon = "🏁";
            if (instance.ClassName === "Terrain") icon = "⛰️";
            if (instance.ClassName === "Water") icon = "🌊";
            if (instance.ClassName === "Script") icon = "📜";
            if (instance.ClassName === "LocalScript") icon = "💻";
            if (instance.ClassName === "Model") icon = "📦";
            if (instance.ClassName === "PointLight") icon = "💡";
            if (instance.ClassName === "SpotLight") icon = "🔦";
            if (instance.ClassName === "Lighting") icon = "☀️";
            if (instance.ClassName === "StarterPlayer") icon = "👤"; 
            if (instance.ClassName === "BillboardGui") icon = "💬";
            if (instance.ClassName === "SurfaceGui") icon = "📐";
            if (instance.ClassName === "ScreenGui") icon = "🖼️";
            if (instance.ClassName === "Frame") icon = "⬜";
            if (instance.ClassName === "TextLabel") icon = "🔤";
            if (instance.ClassName === "TextButton") icon = "🔘";
            if (instance.ClassName === "Decal") icon = "🖼️";
            if (instance.ClassName === "Sound") icon = "🔊";

            const hasChildren = instance.children.length > 0;
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'arrow-collapse';
            if (hasChildren) {
                const isExpanded = this.expandedNodes.has(instance);
                arrowSpan.innerHTML = isExpanded ? '▼' : '▶';
                arrowSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isExpanded) this.expandedNodes.delete(instance);
                    else this.expandedNodes.add(instance);
                    this.refreshExplorer();
                });
            } else {
                arrowSpan.style.visibility = 'hidden';
            }

            el.appendChild(arrowSpan);

            const label = document.createElement('span');
            label.innerHTML = `${icon} ${instance.Name}`;
            el.appendChild(label);

            const addBtn = document.createElement('button');
            addBtn.className = 'explorer-add-btn';
            addBtn.innerText = '+';
            addBtn.title = `Insert object into ${instance.Name}`;
            el.appendChild(addBtn);

            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectInstance(instance);
                this.showInsertMenu(e.clientX, e.clientY, instance);
            });

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'explorer-actions';
            
            if (instance.ClassName === "Part" || instance.ClassName === "LightBlock" || instance.ClassName === "SpawnLocation" || instance.ClassName === "Terrain" || instance.ClassName === "Water") {
                const lockBtn = document.createElement('button');
                lockBtn.className = 'explorer-action-btn';
                lockBtn.innerText = instance.Locked ? '🔒' : '🔓';
                lockBtn.title = "Toggle Lock State";
                lockBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    instance.Locked = !instance.Locked;
                    this.refreshExplorer();
                    this.refreshProperties();
                    this.updateToolbarStates();
                });
                actionsDiv.appendChild(lockBtn);

                const eyeBtn = document.createElement('button');
                eyeBtn.className = 'explorer-action-btn';
                eyeBtn.innerText = instance.CanCollide ? '👁️' : '🕶️';
                eyeBtn.title = "Toggle Collision State";
                eyeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    instance.CanCollide = !instance.CanCollide;
                    this.refreshExplorer();
                    this.refreshProperties();
                });
                actionsDiv.appendChild(eyeBtn);
            }

            el.appendChild(actionsDiv);
            wrapper.appendChild(el);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectInstance(instance, e.ctrlKey);
            });

            el.addEventListener('dblclick', () => {
                if (instance.ClassName === "Script" || instance.ClassName === "LocalScript") {
                    this.openScriptEditor(instance);
                }
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectInstance(instance);
                if (window.engine) {
                    window.engine.showContextMenu(e.clientX, e.clientY);
                }
            });

            el.setAttribute('draggable', 'true');
            
            el.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                window.draggedInstance = instance;
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (window.draggedInstance && window.draggedInstance !== instance) {
                    if (!isDescendantOf(instance, window.draggedInstance)) {
                        if (window.engine && window.engine.history) {
                            window.engine.history.saveState();
                        }
                        window.draggedInstance.Parent = instance;
                    }
                    window.draggedInstance = null;
                }
            });

            container.appendChild(wrapper);

            if (!hasChildren || this.expandedNodes.has(instance) || this.searchQuery) {
                const childrenContainer = document.createElement('div');
                wrapper.appendChild(childrenContainer);
                for (const child of instance.children) {
                    renderNode(child, childrenContainer, indent + 1);
                }
            }
        };

        for (const child of this.gameRoot.children) {
            renderNode(child, this.explorerTree, 0);
        }
    }

    refreshProperties() {
        this.propertiesGrid.innerHTML = '';
        const header = document.getElementById('properties-panel-header');

        this.updateToolbarStates();

        if (this.selectedInstances.length === 0) {
            header.innerText = "Properties";
            this.propertiesGrid.innerHTML = '<p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">Select an item to view properties</p>';
            return;
        }

        if (this.selectedInstances.length > 1) {
            header.innerText = `Properties - ${this.selectedInstances.length} items`;
            this.propertiesGrid.innerHTML = '<p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">Multi-edit common properties below</p>';
        } else {
            header.innerText = `Properties - ${this.selectedInstances[0].Name}`;
        }

        const addProperty = (label, value, onChange) => {
            const row = document.createElement('div');
            row.className = 'property-row';
            row.innerHTML = `<span class="property-label">${label}</span>`;
            
            const input = document.createElement('input');
            input.className = 'property-value';
            input.value = value;
            input.addEventListener('change', (e) => {
                if (window.engine && window.engine.history) window.engine.history.saveState();
                this.selectedInstances.forEach(inst => onChange(inst, e.target.value));
            });
            
            row.appendChild(input);
            this.propertiesGrid.appendChild(row);
        };

        const addDropdownProperty = (label, value, options, onChange) => {
            const row = document.createElement('div');
            row.className = 'property-row';
            row.innerHTML = `<span class="property-label">${label}</span>`;
            
            const select = document.createElement('select');
            select.className = 'property-value';
            
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.innerText = opt;
                if (opt === value.toString()) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            select.addEventListener('change', (e) => {
                if (window.engine && window.engine.history) window.engine.history.saveState();
                this.selectedInstances.forEach(inst => onChange(inst, e.target.value));
                this.updateToolbarStates();
            });
            
            row.appendChild(select);
            this.propertiesGrid.appendChild(row);
        };

        const addColorProperty = (label, hexValue, onChange) => {
            const row = document.createElement('div');
            row.className = 'property-row';
            row.innerHTML = `<span class="property-label">${label}</span>`;
            
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'property-value';
            colorInput.style.padding = '0';
            colorInput.style.cursor = 'pointer';
            
            const hexString = "#" + hexValue.toString(16).padStart(6, '0');
            colorInput.value = hexString;
            
            colorInput.addEventListener('input', (e) => {
                if (window.engine && window.engine.history) window.engine.history.saveState();
                const cleanHex = parseInt(e.target.value.replace('#', ''), 16);
                this.selectedInstances.forEach(inst => onChange(inst, cleanHex));
            });
            
            row.appendChild(colorInput);
            this.propertiesGrid.appendChild(row);
        };

        const addBrickColorProperty = (label, currentColorHex, onChange) => {
            const row = document.createElement('div');
            row.className = 'property-row';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'stretch';
            row.innerHTML = `<span class="property-label" style="margin-bottom: 6px;">${label}</span>`;

            const colors = [
                0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff,
                0xffffff, 0x808080, 0x1b2a35, 0x000000, 0xffaa00, 0x7c5c43,
                0x4b974b, 0xa3a2a5, 0xe29b40, 0xe1a27e, 0xb4e17e, 0xa2c972
            ];

            const grid = document.createElement('div');
            grid.className = 'palette-grid';
            colors.forEach(col => {
                const cell = document.createElement('div');
                cell.className = 'palette-color';
                cell.style.backgroundColor = `#${col.toString(16).padStart(6, '0')}`;
                cell.addEventListener('click', () => {
                    if (window.engine && window.engine.history) window.engine.history.saveState();
                    this.selectedInstances.forEach(inst => onChange(inst, col));
                });
                grid.appendChild(cell);
            });

            row.appendChild(grid);
            this.propertiesGrid.appendChild(row);
        };

        const primary = this.selectedInstances[0];

        addProperty("Name", primary.Name, (inst, val) => {
            inst.Name = val;
            window.dispatchEvent(new CustomEvent('explorer-changed'));
        });
        addProperty("ClassName", primary.ClassName, () => {});

        // --- PLAYER PROPERTIES ---
        if (primary.ClassName === "Player") {
            addProperty("DisplayName", primary.DisplayName || primary.Name, (inst, val) => {
                inst.DisplayName = val;
                window.dispatchEvent(new CustomEvent('explorer-changed'));
            });
            addProperty("UserId", primary.UserId !== undefined ? primary.UserId : 1, (inst, val) => {
                inst.UserId = parseInt(val) || 1;
                window.dispatchEvent(new CustomEvent('explorer-changed'));
            });
        }

        // --- HUMANOID PROPERTIES ---
        if (primary.ClassName === "Humanoid") {
            addProperty("HipHeight (Height Adjuster)", primary.HipHeight !== undefined ? primary.HipHeight : 2.0, (inst, val) => {
                inst.HipHeight = Math.max(0.2, parseFloat(val) || 2.0);
            });
            addProperty("Health", primary.Health !== undefined ? primary.Health : 100, (inst, val) => {
                inst.Health = Math.max(0, parseFloat(val) || 0);
            });
            addProperty("MaxHealth", primary.MaxHealth !== undefined ? primary.MaxHealth : 100, (inst, val) => {
                inst.MaxHealth = Math.max(1, parseFloat(val) || 100);
            });
            addProperty("WalkSpeed", primary.WalkSpeed !== undefined ? primary.WalkSpeed : 16.0, (inst, val) => {
                inst.WalkSpeed = Math.max(0, parseFloat(val) || 16.0);
            });
            addProperty("JumpPower", primary.JumpPower !== undefined ? primary.JumpPower : 50.0, (inst, val) => {
                inst.JumpPower = Math.max(0, parseFloat(val) || 50.0);
            });
            addProperty("DisplayName", primary.DisplayName || "Player1", (inst, val) => {
                inst.DisplayName = val;
            });
        }

        if (primary.ClassName === "LightBlock") {
            addDropdownProperty("Shape", primary.Shape, ['Block', 'Sphere', 'Cylinder', 'Wedge'], (inst, val) => {
                inst.Shape = val;
                inst.recreateGeometry();
                this.refreshExplorer();
            });

            addBrickColorProperty("Glow Color Swatches", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateTransform();
            });

            addColorProperty("Light Color", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateTransform();
            });

            addProperty("Brightness", primary.Brightness, (inst, val) => {
                inst.Brightness = Math.max(0, parseFloat(val) || 5.0);
                inst.updateTransform();
            });

            addProperty("Light Range", primary.Range, (inst, val) => {
                inst.Range = Math.max(1, parseFloat(val) || 30);
                inst.updateTransform();
            });

            addDropdownProperty("Anchored", primary.Anchored ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Anchored = (val === "true");
                this.updateToolbarStates();
            });
            addDropdownProperty("CanCollide", primary.CanCollide ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.CanCollide = (val === "true");
            });
            addDropdownProperty("Locked", primary.Locked ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Locked = (val === "true");
                this.updateToolbarStates();
            });

            addProperty("Size (X,Y,Z)", `${primary.Size.x}, ${primary.Size.y}, ${primary.Size.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Size.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
            addProperty("Pos (X,Y,Z)", `${primary.Position.x}, ${primary.Position.y}, ${primary.Position.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Position.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
        }

        if (primary.ClassName === "Part" || primary.ClassName === "SpawnLocation") {
            addDropdownProperty("Shape", primary.Shape, ['Block', 'Sphere', 'Cylinder', 'Wedge'], (inst, val) => {
                inst.Shape = val;
                inst.recreateGeometry();
                this.refreshExplorer();
            });

            addBrickColorProperty("BrickColor Swatches", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateTransform();
            });

            addColorProperty("Color", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateTransform();
            });

            addDropdownProperty("Material", primary.MaterialType, ['Plastic', 'Wood', 'Slate', 'Concrete', 'Grass', 'Neon'], (inst, val) => {
                inst.MaterialType = val;
                inst.updateTransform();
            });
            
            addDropdownProperty("Anchored", primary.Anchored ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Anchored = (val === "true");
                this.updateToolbarStates();
            });
            addDropdownProperty("CanCollide", primary.CanCollide ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.CanCollide = (val === "true");
            });
            addDropdownProperty("Locked", primary.Locked ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Locked = (val === "true");
                this.updateToolbarStates();
            });

            addProperty("Size (X,Y,Z)", `${primary.Size.x}, ${primary.Size.y}, ${primary.Size.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Size.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
            addProperty("Pos (X,Y,Z)", `${primary.Position.x}, ${primary.Position.y}, ${primary.Position.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Position.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
        }

        if (primary.ClassName === "Water") {
            addColorProperty("Color", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateTransform();
            });
            addProperty("Transparency (0-1)", primary.Transparency, (inst, val) => {
                inst.Transparency = Math.max(0, Math.min(1, parseFloat(val) || 0));
                inst.updateTransform();
            });
            addProperty("WaveSpeed", primary.WaveSpeed, (inst, val) => {
                inst.WaveSpeed = parseFloat(val) || 0.8;
            });
            addProperty("Size (X,Y,Z)", `${primary.Size.x}, ${primary.Size.y}, ${primary.Size.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Size.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
            addProperty("Pos (X,Y,Z)", `${primary.Position.x}, ${primary.Position.y}, ${primary.Position.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.Position.set(parts[0], parts[1], parts[2]);
                    inst.updateTransform();
                }
            });
        }

        if (primary.ClassName === "Terrain") {
            addDropdownProperty("Sculpt Mode", window.terrainSculptMode || "raise", ["raise", "lower", "smooth"], (inst, val) => {
                window.terrainSculptMode = val;
            });
            addProperty("Brush Radius", window.terrainBrushRadius || 15, (inst, val) => {
                window.terrainBrushRadius = Math.max(2, parseFloat(val) || 15);
            });
            addProperty("Brush Strength", window.terrainBrushStrength || 0.4, (inst, val) => {
                window.terrainBrushStrength = Math.max(0.05, parseFloat(val) || 0.4);
            });
            addDropdownProperty("Material", primary.MaterialType, ["Grass", "Rock"], (inst, val) => {
                inst.MaterialType = val;
                inst.recreateTerrain();
            });
            addProperty("Size (X,Y,Z)", `${primary.Size.x}, ${primary.Size.y}, ${primary.Size.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    primary.Size.set(parts[0], parts[1], parts[2]);
                    primary.updateTransform();
                }
            });
            addProperty("Pos (X,Y,Z)", `${primary.Position.x}, ${primary.Position.y}, ${primary.Position.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    primary.Position.set(parts[0], parts[1], parts[2]);
                    primary.updateTransform();
                }
            });
        }

        if (primary.ClassName === "Decal") {
            addProperty("Texture URL", primary.TextureId, (inst, val) => {
                inst.TextureId = val;
                inst.onParentChanged(inst.Parent);
            });
            addDropdownProperty("Face", primary.Face, ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right'], (inst, val) => {
                inst.Face = val;
                inst.onParentChanged(inst.Parent);
            });
        }

        if (primary.ClassName === "Sound") {
            addProperty("Sound ID (URL)", primary.SoundId, (inst, val) => {
                inst.SoundId = val;
                inst.onParentChanged(inst.Parent);
            });
            addDropdownProperty("Looped", primary.Looped ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Looped = (val === "true");
                inst.onParentChanged(inst.Parent);
            });
        }

        if (primary.ClassName === "Lighting") {
            addProperty("Time of Day (ClockTime 0-24)", primary.ClockTime !== undefined ? primary.ClockTime : 12.0, (inst, val) => {
                inst.ClockTime = Math.max(0, Math.min(24, parseFloat(val) || 12.0));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Sun Brightness (0-5)", primary.Brightness !== undefined ? primary.Brightness : 1.0, (inst, val) => {
                inst.Brightness = Math.max(0, parseFloat(val) || 1.0);
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Bloom Glow Strength (0-3)", primary.BloomStrength !== undefined ? primary.BloomStrength : 0.85, (inst, val) => {
                inst.BloomStrength = Math.max(0, Math.min(3, parseFloat(val) || 0.85));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Motion Blur Intensity (0-3)", primary.MotionBlur !== undefined ? primary.MotionBlur : 1.0, (inst, val) => {
                inst.MotionBlur = Math.max(0, Math.min(3, parseFloat(val) || 1.0));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Tone Mapping Exposure (0.1-3)", primary.Exposure !== undefined ? primary.Exposure : 1.0, (inst, val) => {
                inst.Exposure = Math.max(0.1, Math.min(3, parseFloat(val) || 1.0));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Sky Rayleigh Scattering (0-5)", primary.Rayleigh !== undefined ? primary.Rayleigh : 1.0, (inst, val) => {
                inst.Rayleigh = Math.max(0, Math.min(5, parseFloat(val) || 1.0));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Atmospheric Turbidity (0-5)", primary.Turbidity !== undefined ? primary.Turbidity : 1.0, (inst, val) => {
                inst.Turbidity = Math.max(0, Math.min(5, parseFloat(val) || 1.0));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
        }

        if (primary.ClassName === "PointLight" || primary.ClassName === "SpotLight") {
            addColorProperty("Color", primary.Color, (inst, val) => {
                inst.Color = val;
                inst.updateLight();
            });
            addProperty("Intensity", primary.Intensity, (inst, val) => {
                inst.Intensity = Math.max(0, parseFloat(val) || 5);
                inst.updateLight();
            });
            addProperty("Range", primary.Range, (inst, val) => {
                inst.Range = Math.max(1, parseInt(val) || 15);
                inst.updateLight();
            });
            addDropdownProperty("Shadows", primary.Shadows ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Shadows = (val === "true");
                inst.updateLight();
            });
            if (primary.ClassName === "SpotLight") {
                addProperty("Angle (Deg)", primary.Angle, (inst, val) => {
                    inst.Angle = Math.max(5, Math.min(90, parseInt(val) || 45));
                    inst.updateLight();
                });
            }
        }

        if (primary.ClassName === "BillboardGui") {
            addProperty("Size (W,H) px", `${primary.Size.x}, ${primary.Size.y}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 2 && !parts.some(isNaN)) {
                    inst.Size.set(parts[0], parts[1]);
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                }
            });
            addProperty("StudsOffset (X,Y,Z)", `${primary.StudsOffset.x}, ${primary.StudsOffset.y}, ${primary.StudsOffset.z}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                    inst.StudsOffset.set(parts[0], parts[1], parts[2]);
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                }
            });
        }

        if (primary.ClassName === "SurfaceGui") {
            addDropdownProperty("Face", primary.Face, ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right'], (inst, val) => {
                inst.Face = val;
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });
        }

        if (primary.ClassName === "Frame" || primary.ClassName === "TextLabel" || primary.ClassName === "TextButton") {
            addColorProperty("BackgroundColor", primary.BackgroundColor, (inst, val) => {
                inst.BackgroundColor = val;
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });
            
            addProperty("BorderSizePixel", primary.BorderSizePixel, (inst, val) => {
                inst.BorderSizePixel = parseInt(val) || 0;
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });
            addColorProperty("BorderColor", primary.BorderColor, (inst, val) => {
                inst.BorderColor = val;
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });

            addDropdownProperty("Visible", primary.Visible ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.Visible = (val === "true");
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });
            addProperty("BackgroundTransparency (0-1)", primary.BackgroundTransparency, (inst, val) => {
                inst.BackgroundTransparency = Math.max(0, Math.min(1, parseFloat(val) || 0));
                window.dispatchEvent(new CustomEvent('gui-changed'));
            });

            addProperty("Position (X,Y) %", `${primary.Position.x}, ${primary.Position.y}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 2 && !parts.some(isNaN)) {
                    inst.Position.set(parts[0], parts[1]);
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                }
            });
            addProperty("Size (W,H) px", `${primary.Size.x}, ${primary.Size.y}`, (inst, val) => {
                const parts = val.split(',').map(Number);
                if (parts.length === 2 && !parts.some(isNaN)) {
                    inst.Size.set(parts[0], parts[1]);
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                }
            });

            if (primary.ClassName === "TextLabel" || primary.ClassName === "TextButton") {
                addProperty("Text", primary.Text, (inst, val) => {
                    inst.Text = val;
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });
                addColorProperty("TextColor", primary.TextColor, (inst, val) => {
                    inst.TextColor = val;
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });
                addProperty("TextSize", primary.TextSize, (inst, val) => {
                    inst.TextSize = parseInt(val) || 12;
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });

                addDropdownProperty("TextWrapped", primary.TextWrapped ? "true" : "false", ["true", "false"], (inst, val) => {
                    inst.TextWrapped = (val === "true");
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });
                addDropdownProperty("TextXAlignment", primary.TextXAlignment || "Center", ["Left", "Center", "Right"], (inst, val) => {
                    inst.TextXAlignment = val;
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });
                addDropdownProperty("TextYAlignment", primary.TextYAlignment || "Center", ["Top", "Center", "Bottom"], (inst, val) => {
                    inst.TextYAlignment = val;
                    window.dispatchEvent(new CustomEvent('gui-changed'));
                });
            }
        }
    }
}