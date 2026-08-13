/* --- START OF FILE StudioUI.js (REVISED) --- */

import { Part, SpawnLocation, Script, LocalScript, Decal, Sound, ScreenGui, Frame, TextLabel, TextButton, Model, PointLight, SpotLight, BillboardGui, SurfaceGui } from './Instance.js';

export class StudioUI {
    constructor(explorerRoot) {
        this.gameRoot = explorerRoot;
        this.explorerTree = document.getElementById('explorer-tree');
        this.propertiesGrid = document.getElementById('properties-grid');
        this.selectedInstances = []; // Holds multiple selected objects
        this.expandedNodes = new Set(); // Tracks expanded node folders
        this.searchQuery = "";

        this.setupEditorModal();
        this.setupButtonEvents();
        this.setupSearch();

        window.addEventListener('explorer-changed', () => this.refreshExplorer());
        this.refreshExplorer();
    }

    get selectedInstance() {
        return this.selectedInstances[0] || null;
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
                this.spawnInstanceBySelection(shape);
                document.getElementById('part-dropdown-menu').style.display = 'none';
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

        document.getElementById('btn-tool-script').addEventListener('click', () => {
            const script = new Script();
            script.Parent = this.selectedInstance || this.gameRoot.children.find(c => c.Name === "Workspace");
            this.selectInstance(script);
        });

        document.getElementById('btn-tool-localscript').addEventListener('click', () => {
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
            instance.Parent = workspace;
        } else {
            instance = new Part(shape);
            instance.Parent = workspace;
        }

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

        this.saveBtn.addEventListener('click', () => {
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

        // Defensive checks to handle browser caching mismatches gracefully
        if (window.engine) {
            if (typeof window.engine.selectMultipleParts === 'function') {
                window.engine.selectMultipleParts(this.selectedInstances);
            } else if (typeof window.engine.selectPart === 'function') {
                // Fallback to older cached selectPart method if main.js hasn't reloaded
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
        if (parentInstance.Name === "Workspace" || parentInstance.ClassName === "Part" || parentInstance.ClassName === "SpawnLocation" || parentInstance.ClassName === "Model") {
            options = ["Block", "Sphere", "Cylinder", "Wedge", "SpawnLocation", "Model", "PointLight", "SpotLight", "Script", "LocalScript", "BillboardGui", "SurfaceGui", "Decal", "Sound"];
        } else if (parentInstance.Name === "StarterGui" || parentInstance.ClassName === "ScreenGui" || parentInstance.ClassName === "Frame" || parentInstance.ClassName === "TextLabel" || parentInstance.ClassName === "TextButton" || parentInstance.ClassName === "BillboardGui" || parentInstance.ClassName === "SurfaceGui") {
            options = ["ScreenGui", "Frame", "TextLabel", "TextButton"];
        } else if (parentInstance.Name === "ServerScriptService" || parentInstance.Name === "StarterCharacterScripts") {
            options = ["Script", "LocalScript"];
        } else {
            options = ["Block", "Sphere", "Cylinder", "Wedge", "SpawnLocation", "Model", "PointLight", "SpotLight", "Script", "LocalScript", "BillboardGui", "SurfaceGui", "ScreenGui", "Frame", "TextLabel", "TextButton", "Decal", "Sound"];
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
            else if (opt === "SpawnLocation") icon = "🏁";
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
            if (instance.ClassName === "SpawnLocation") icon = "🏁";
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

            // Lock & Collision direct Explorer toggle buttons
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'explorer-actions';
            
            if (instance.ClassName === "Part" || instance.ClassName === "SpawnLocation") {
                const lockBtn = document.createElement('button');
                lockBtn.className = 'explorer-action-btn';
                lockBtn.innerText = instance.Locked ? '🔒' : '🔓';
                lockBtn.title = "Toggle Lock State";
                lockBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    instance.Locked = !instance.Locked;
                    this.refreshExplorer();
                    this.refreshProperties();
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

        if (this.selectedInstances.length === 0) {
            header.innerText = "Properties";
            this.propertiesGrid.innerHTML = '<p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">Select an item to view properties</p>';
            return;
        }

        // Multi-Selection Header details
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

        // Roblox BrickColor grid panel presets
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
            this.refreshExplorer();
        });
        addProperty("ClassName", primary.ClassName, () => {});

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
            });
            addDropdownProperty("CanCollide", primary.CanCollide ? "true" : "false", ["true", "false"], (inst, val) => {
                inst.CanCollide = (val === "true");
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
            addProperty("ClockTime (0-24)", primary.ClockTime, (inst, val) => {
                inst.ClockTime = Math.max(0, Math.min(24, parseFloat(val) || 12));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addProperty("Brightness (0-2)", primary.Brightness, (inst, val) => {
                inst.Brightness = Math.max(0, Math.min(2, parseFloat(val) || 1));
                window.dispatchEvent(new CustomEvent('lighting-changed'));
            });
            addColorProperty("Ambient", primary.Ambient, (inst, val) => {
                inst.Ambient = val;
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