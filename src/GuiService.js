/* --- START OF FILE GuiService.js (REVISED) --- */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'; // CSS2D Object

export class GuiService {
    constructor() {
        this.viewport = document.getElementById('gui-viewport');
    }

    sync() {
        this.viewport.innerHTML = ''; // Clear ScreenGuis

        const starterGui = window.game.children.find(c => c.Name === "StarterGui");
        if (starterGui) {
            for (const child of starterGui.children) {
                this.renderGuiNode(child, this.viewport);
            }
        }

        // Sync BillboardGuis and SurfaceGuis
        const traverseAndRenderInWorld = (instance) => {
            if (instance.ClassName === "BillboardGui") {
                this.syncBillboardGui(instance);
            } else if (instance.ClassName === "SurfaceGui") {
                this.syncSurfaceGui(instance);
            }
            for (const child of instance.children) {
                traverseAndRenderInWorld(child);
            }
        };
        traverseAndRenderInWorld(window.game);
    }

    // Renders BillboardGuis floating above parts [3]
    syncBillboardGui(billboardInstance) {
        const parentPart = billboardInstance.Parent;
        if (!parentPart || !parentPart.mesh) return;

        const prevObj = parentPart.mesh.children.find(c => c instanceof CSS2DObject);
        if (prevObj) parentPart.mesh.remove(prevObj);

        // Build HTML container
        const container = document.createElement('div');
        container.style.width = `${billboardInstance.Size.x}px`;
        container.style.height = `${billboardInstance.Size.y}px`;
        container.style.position = 'relative';
        container.style.pointerEvents = 'none';

        // Render nested UI children
        for (const child of billboardInstance.children) {
            this.renderGuiNode(child, container);
        }

        const css2dObject = new CSS2DObject(container);
        css2dObject.position.copy(billboardInstance.StudsOffset);
        
        parentPart.mesh.add(css2dObject);
    }

    // Projects SurfaceGuis flatly onto part faces using dynamic canvas textures [3]
    syncSurfaceGui(surfaceInstance) {
        const parentPart = surfaceInstance.Parent;
        if (!parentPart || !parentPart.mesh) return;

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Draw children onto canvas context
        const renderToCanvas = (uiInstance) => {
            if (uiInstance.ClassName === "Frame" || uiInstance.ClassName === "TextLabel" || uiInstance.ClassName === "TextButton") {
                // Convert percentage positions into 512px coordinates
                const x = (uiInstance.Position.x / 100) * 512;
                const y = (uiInstance.Position.y / 100) * 512;
                const w = (uiInstance.Size.x / 150) * 200; // Scaled comfortably
                const h = (uiInstance.Size.y / 100) * 150;

                ctx.fillStyle = `#${uiInstance.BackgroundColor.toString(16).padStart(6, '0')}`;
                ctx.fillRect(x, y, w, h);

                if (uiInstance.BorderSizePixel > 0) {
                    ctx.strokeStyle = `#${uiInstance.BorderColor.toString(16).padStart(6, '0')}`;
                    ctx.lineWidth = uiInstance.BorderSizePixel * 2;
                    ctx.strokeRect(x, y, w, h);
                }

                if (uiInstance.ClassName === "TextLabel" || uiInstance.ClassName === "TextButton") {
                    ctx.fillStyle = `#${uiInstance.TextColor.toString(16).padStart(6, '0')}`;
                    ctx.font = `bold ${uiInstance.TextSize * 2}px sans-serif`;
                    ctx.textAlign = uiInstance.TextXAlignment.toLowerCase();
                    ctx.textBaseline = uiInstance.TextYAlignment === "Center" ? "middle" : uiInstance.TextYAlignment.toLowerCase();
                    
                    let textX = x + w / 2;
                    if (ctx.textAlign === 'left') textX = x + 10;
                    if (ctx.textAlign === 'right') textX = x + w - 10;

                    let textY = y + h / 2;
                    if (uiInstance.TextYAlignment === "Top") textY = y + 20;
                    if (uiInstance.TextYAlignment === "Bottom") textY = y + h - 20;

                    ctx.fillText(uiInstance.Text, textX, textY);
                }
            }
            for (const child of uiInstance.children) {
                renderToCanvas(child);
            }
        };

        for (const child of surfaceInstance.children) {
            renderToCanvas(child);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const faceMaterials = [];
        const faces = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'];
        
        for (let i = 0; i < 6; i++) {
            if (faces[i] === surfaceInstance.Face) {
                faceMaterials.push(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
            } else {
                faceMaterials.push(parentPart.material);
            }
        }

        parentPart.mesh.material = faceMaterials;
        parentPart.mesh.material.needsUpdate = true;
    }

    renderGuiNode(instance, parentElement) {
        let el = null;

        if (instance.ClassName === "Frame" || instance.ClassName === "TextLabel" || instance.ClassName === "TextButton") {
            if (instance.ClassName === "TextButton") {
                el = document.createElement('button');
                el.innerText = instance.Text;
            } else if (instance.ClassName === "TextLabel") {
                el = document.createElement('div');
                el.innerText = instance.Text;
            } else {
                el = document.createElement('div');
            }

            // Store DOM element reference on the instance
            instance.domElement = el;

            el.style.position = 'absolute';
            el.style.left = `${instance.Position.x}%`;
            el.style.top = `${instance.Position.y}%`;
            el.style.width = `${instance.Size.x}px`;
            el.style.height = `${instance.Size.y}px`;
            el.style.backgroundColor = `#${instance.BackgroundColor.toString(16).padStart(6, '0')}`;
            el.style.boxSizing = 'border-box';

            el.style.display = instance.Visible !== false ? 'flex' : 'none';
            el.style.opacity = 1 - (instance.BackgroundTransparency || 0);

            if (instance.BorderSizePixel > 0) {
                el.style.border = `${instance.BorderSizePixel}px solid #${instance.BorderColor.toString(16).padStart(6, '0')}`;
            } else {
                el.style.border = 'none';
            }

            if (instance.ClassName === "TextLabel" || instance.ClassName === "TextButton") {
                el.style.color = `#${instance.TextColor.toString(16).padStart(6, '0')}`;
                el.style.fontSize = `${instance.TextSize}px`;
                el.style.fontWeight = 'bold';
                el.style.whiteSpace = instance.TextWrapped ? 'normal' : 'nowrap';
                el.style.wordBreak = instance.TextWrapped ? 'break-word' : 'normal';

                if (instance.TextXAlignment === "Left") el.style.justifyContent = 'flex-start';
                else if (instance.TextXAlignment === "Right") el.style.justifyContent = 'flex-end';
                else el.style.justifyContent = 'center';

                if (instance.TextYAlignment === "Top") el.style.alignItems = 'flex-start';
                else if (instance.TextYAlignment === "Bottom") el.style.alignItems = 'flex-end';
                else el.style.alignItems = 'center';
            }

            // --- FIXED: DRAG THE ENTIRE BODY OF THE UI ELEMENT DIRECTLY WITH MOUSE --- [3]
            if (window.engine && !window.engine.isPlaytesting) {
                el.style.pointerEvents = 'auto'; 
                el.style.cursor = 'move'; // Roblox movement cursor

                el.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // Select this UI node in the explorer [3]
                    window.engine.ui.selectInstance(instance);

                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startPos = instance.Position.clone();
                    const rect = this.viewport.getBoundingClientRect();

                    const onMouseMove = (moveEvent) => {
                        const dx = moveEvent.clientX - startX;
                        const dy = moveEvent.clientY - startY;

                        const dxPercent = (dx / rect.width) * 100;
                        const dyPercent = (dy / rect.height) * 100;

                        instance.Position.set(startPos.x + dxPercent, startPos.y + dyPercent);

                        // Direct CSS updates through instance references to maintain drag state
                        if (instance.domElement) {
                            instance.domElement.style.left = `${instance.Position.x}%`;
                            instance.domElement.style.top = `${instance.Position.y}%`;
                        }
                        
                        if (instance.outlineElement) {
                            instance.outlineElement.style.left = `${instance.Position.x}%`;
                            instance.outlineElement.style.top = `${instance.Position.y}%`;
                        }

                        if (window.engine.ui) {
                            window.engine.ui.refreshProperties();
                        }
                    };

                    const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                        
                        // Sync rebuild once upon release [3]
                        window.dispatchEvent(new CustomEvent('gui-changed'));

                        if (window.engine.history) {
                            window.engine.history.saveState();
                        }
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });
            }
        }

        const targetParent = el ? el : parentElement;

        for (const child of instance.children) {
            this.renderGuiNode(child, targetParent);
        }

        if (el) {
            parentElement.appendChild(el);
        }

        // Renders active selected outlines and resizes
        const isSelected = window.engine && window.engine.ui && instance === window.engine.ui.selectedInstance;
        if (isSelected && !window.engine.isPlaytesting) {
            if (instance.ClassName === "Frame" || instance.ClassName === "TextLabel" || instance.ClassName === "TextButton") {
                const outline = document.createElement('div');
                outline.className = 'ui-outline'; // Added class query identifier [3]
                outline.style.position = 'absolute';
                outline.style.left = `${instance.Position.x}%`;
                outline.style.top = `${instance.Position.y}%`;
                outline.style.width = `${instance.Size.x}px`;
                outline.style.height = `${instance.Size.y}px`;
                outline.style.border = '1.5px solid #0098ff'; 
                outline.style.boxSizing = 'border-box';
                outline.style.pointerEvents = 'none';

                // Store outline reference on the instance
                instance.outlineElement = outline;
                
                // Corner resizer coordinates [3]
                const handlePositions = [
                    { type: 'tl', cursor: 'nwse-resize', left: '-4px', top: '-4px' },
                    { type: 'tr', cursor: 'nesw-resize', right: '-4px', top: '-4px' },
                    { type: 'bl', cursor: 'nesw-resize', left: '-4px', bottom: '-4px' },
                    { type: 'br', cursor: 'nwse-resize', right: '-4px', bottom: '-4px' }
                ];

                handlePositions.forEach(h => {
                    const handle = document.createElement('div');
                    handle.style.position = 'absolute';
                    if (h.left) handle.style.left = h.left;
                    if (h.right) handle.style.right = h.right;
                    if (h.top) handle.style.top = h.top;
                    if (h.bottom) handle.style.bottom = h.bottom;
                    handle.style.width = '8px';
                    handle.style.height = '8px';
                    handle.style.backgroundColor = '#fff';
                    handle.style.border = '1px solid #0098ff';
                    handle.style.cursor = h.cursor;
                    handle.style.pointerEvents = 'auto';

                    handle.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startPos = instance.Position.clone();
                        const startSize = instance.Size.clone();
                        
                        const rect = this.viewport.getBoundingClientRect();

                        const onMouseMove = (moveEvent) => {
                            const dx = moveEvent.clientX - startX;
                            const dy = moveEvent.clientY - startY;

                            const dxPercent = (dx / rect.width) * 100;
                            const dyPercent = (dy / rect.height) * 100;

                            if (h.type === 'br') {
                                instance.Size.set(Math.max(10, startSize.x + dx), Math.max(10, startSize.y + dy));
                            } else if (h.type === 'bl') {
                                const newWidth = Math.max(10, startSize.x - dx);
                                const widthDiff = startSize.x - newWidth;
                                const widthDiffPercent = (widthDiff / rect.width) * 100;
                                instance.Size.set(newWidth, Math.max(10, startSize.y + dy));
                                instance.Position.set(startPos.x + widthDiffPercent, startPos.y);
                            } else if (h.type === 'tr') {
                                const newHeight = Math.max(10, startSize.y - dy);
                                const heightDiff = startSize.y - newHeight;
                                const heightDiffPercent = (heightDiff / rect.height) * 100;
                                instance.Size.set(Math.max(10, startSize.x + dx), newHeight);
                                instance.Position.set(startPos.x, startPos.y + heightDiffPercent);
                            } else if (h.type === 'tl') {
                                const newWidth = Math.max(10, startSize.x - dx);
                                const newHeight = Math.max(10, startSize.y - dy);
                                const widthDiff = startSize.x - newWidth;
                                const heightDiff = startSize.y - newHeight;
                                const widthDiffPercent = (widthDiff / rect.width) * 100;
                                const heightDiffPercent = (heightDiff / rect.height) * 100;
                                instance.Size.set(newWidth, newHeight);
                                instance.Position.set(startPos.x + widthDiffPercent, startPos.y + heightDiffPercent);
                            }

                            if (instance.domElement) {
                                instance.domElement.style.left = `${instance.Position.x}%`;
                                instance.domElement.style.top = `${instance.Position.y}%`;
                                instance.domElement.style.width = `${instance.Size.x}px`;
                                instance.domElement.style.height = `${instance.Size.y}px`;
                            }
                            if (instance.outlineElement) {
                                instance.outlineElement.style.left = `${instance.Position.x}%`;
                                instance.outlineElement.style.top = `${instance.Position.y}%`;
                                instance.outlineElement.style.width = `${instance.Size.x}px`;
                                instance.outlineElement.style.height = `${instance.Size.y}px`;
                            }

                            if (window.engine && window.engine.ui) {
                                window.engine.ui.refreshProperties();
                            }
                        };

                        const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                            window.dispatchEvent(new CustomEvent('gui-changed'));

                            if (window.engine && window.engine.history) {
                                window.engine.history.saveState();
                            }
                        };

                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                    });

                    outline.appendChild(handle);
                });
                
                // FIXED: Append outline relative to the local parentElement instead of viewport to support nested groups [3]
                parentElement.appendChild(outline);
            }
        } else {
            instance.outlineElement = null;
        }
    }
}