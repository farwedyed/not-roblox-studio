export class PanelManager {
    constructor(engine) {
        this.engine = engine;
        this.floatingZIndex = 10000;
    }

    setupPanelSplitters() {
        this.setupDockingSystem();
    }

    setupDockingSystem() {
        const workspaceArea = document.getElementById('workspace-area');
        const sidebarLeft = document.getElementById('sidebar-left');
        const sidebarRight = document.getElementById('sidebar-right');
        const bottomZone = document.getElementById('bottom-dock-zone');
        const bottomPanel = document.getElementById('bottom-panel');

        const splitterLeft = document.getElementById('splitter-left');
        const splitterRight = document.getElementById('splitter-right');
        const consoleSplitter = document.getElementById('console-splitter');

        // Splitter: Left Sidebar Width
        splitterLeft?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const onMouseMove = (moveEvent) => {
                const rect = workspaceArea.getBoundingClientRect();
                const width = moveEvent.clientX - rect.left;
                if (width > 150 && width < 500) {
                    sidebarLeft.style.width = `${width}px`;
                    this.engine.rendererService.onWindowResize();
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Splitter: Right Sidebar Width
        splitterRight?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const onMouseMove = (moveEvent) => {
                const rect = workspaceArea.getBoundingClientRect();
                const width = rect.right - moveEvent.clientX;
                if (width > 150 && width < 500) {
                    sidebarRight.style.width = `${width}px`;
                    this.engine.rendererService.onWindowResize();
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Splitter: Bottom Dock Console Height
        consoleSplitter?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const onMouseMove = (moveEvent) => {
                const rect = document.getElementById('center-viewport').getBoundingClientRect();
                const height = rect.bottom - moveEvent.clientY;
                if (height > 80 && height < 400) {
                    bottomPanel.style.height = `${height}px`;
                    this.engine.rendererService.onWindowResize();
                }
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Initialize Panel Draggability & Dock Controls
        const panels = document.querySelectorAll('.panel');
        panels.forEach(panel => {
            this.makePanelDockable(panel);
        });

        // Ribbon View Tab Toggles
        const tabHome = document.getElementById('ribbon-home');
        const tabModel = document.getElementById('ribbon-model');
        const tabView = document.getElementById('ribbon-view');

        const switchRibbonTab = (activeTab) => {
            [tabHome, tabModel, tabView].forEach(t => t?.classList.remove('selected'));
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

        if (tabHome) tabHome.addEventListener('click', () => switchRibbonTab(tabHome));
        if (tabModel) tabModel.addEventListener('click', () => switchRibbonTab(tabModel));
        if (tabView) tabView.addEventListener('click', () => switchRibbonTab(tabView));

        // Panel Toggle Buttons inside View Ribbon
        this.setupViewToggles();
    }

    makePanelDockable(panel) {
        const header = panel.querySelector('.panel-header');
        if (!header) return;

        // Ensure Panel Action Controls exist in header
        let actionsContainer = header.querySelector('.panel-header-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.className = 'panel-header-actions';
            actionsContainer.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            const floatBtn = document.createElement('button');
            floatBtn.className = 'panel-action-btn';
            floatBtn.innerText = '⧉';
            floatBtn.title = 'Float Window';
            floatBtn.style.cssText = 'background: none; border: none; color: #aaa; cursor: pointer; font-size: 11px; padding: 0 3px;';
            floatBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (panel.classList.contains('floating-panel')) {
                    this.dockPanel(panel, 'sidebar-right');
                } else {
                    this.floatPanel(panel, 100, 100);
                }
            });

            actionsContainer.appendChild(floatBtn);
            header.appendChild(actionsContainer);
        }

        // Header Dragging for Docking / Undocking
        header.style.cursor = 'grab';

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            e.preventDefault();

            this.floatingZIndex++;
            panel.style.zIndex = this.floatingZIndex;

            const startX = e.clientX;
            const startY = e.clientY;

            const isFloating = panel.classList.contains('floating-panel');
            const initialRect = panel.getBoundingClientRect();

            let hasMoved = false;

            const workspaceArea = document.getElementById('workspace-area');
            const indicatorLeft = document.getElementById('dock-indicator-left');
            const indicatorRight = document.getElementById('dock-indicator-right');
            const indicatorBottom = document.getElementById('dock-indicator-bottom');

            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    hasMoved = true;
                    if (!isFloating) {
                        this.floatPanel(panel, initialRect.left + dx, initialRect.top + dy, initialRect.width, initialRect.height);
                    }
                }

                if (hasMoved) {
                    panel.style.left = `${initialRect.left + dx}px`;
                    panel.style.top = `${initialRect.top + dy}px`;

                    const wsRect = workspaceArea.getBoundingClientRect();
                    const mx = moveEvent.clientX;
                    const my = moveEvent.clientY;

                    // Show drop target indicators
                    if (indicatorLeft) indicatorLeft.style.display = (mx >= wsRect.left && mx <= wsRect.left + 180) ? 'block' : 'none';
                    if (indicatorRight) indicatorRight.style.display = (mx <= wsRect.right && mx >= wsRect.right - 180) ? 'block' : 'none';
                    if (indicatorBottom) indicatorBottom.style.display = (my <= wsRect.bottom && my >= wsRect.bottom - 150 && mx > wsRect.left + 180 && mx < wsRect.right - 180) ? 'block' : 'none';
                }
            };

            const onMouseUp = (upEvent) => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);

                if (indicatorLeft) indicatorLeft.style.display = 'none';
                if (indicatorRight) indicatorRight.style.display = 'none';
                if (indicatorBottom) indicatorBottom.style.display = 'none';

                if (hasMoved) {
                    const wsRect = workspaceArea.getBoundingClientRect();
                    const mx = upEvent.clientX;
                    const my = upEvent.clientY;

                    if (mx >= wsRect.left && mx <= wsRect.left + 180) {
                        this.dockPanel(panel, 'sidebar-left');
                    } else if (mx <= wsRect.right && mx >= wsRect.right - 180) {
                        this.dockPanel(panel, 'sidebar-right');
                    } else if (my <= wsRect.bottom && my >= wsRect.bottom - 150 && mx > wsRect.left + 180 && mx < wsRect.right - 180) {
                        this.dockPanel(panel, 'bottom-dock-zone');
                    }
                }
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    floatPanel(panel, left, top, width = 300, height = 300) {
        panel.classList.add('floating-panel');
        panel.style.position = 'fixed';
        panel.style.left = `${Math.max(20, left)}px`;
        panel.style.top = `${Math.max(60, top)}px`;
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
        panel.style.zIndex = ++this.floatingZIndex;
        panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
        panel.style.border = '1px solid #007acc';
        panel.style.borderRadius = '6px';
        panel.style.backgroundColor = '#222';

        document.body.appendChild(panel);

        // Add Resizer handle for Floating Windows if not present
        if (!panel.querySelector('.panel-corner-resizer')) {
            const resizer = document.createElement('div');
            resizer.className = 'panel-corner-resizer';
            resizer.style.cssText = 'position: absolute; right: 0; bottom: 0; width: 12px; height: 12px; cursor: nwse-resize; z-index: 10;';
            
            resizer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const startW = panel.offsetWidth;
                const startH = panel.offsetHeight;
                const startX = e.clientX;
                const startY = e.clientY;

                const onMouseMove = (moveEvent) => {
                    panel.style.width = `${Math.max(200, startW + (moveEvent.clientX - startX))}px`;
                    panel.style.height = `${Math.max(150, startH + (moveEvent.clientY - startY))}px`;
                };
                const onMouseUp = () => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            panel.appendChild(resizer);
        }

        this.updateSidebarsVisibility();
        this.engine.rendererService.onWindowResize();
    }

    dockPanel(panel, targetDockId) {
        panel.classList.remove('floating-panel');
        panel.style.position = 'relative';
        panel.style.left = '0';
        panel.style.top = '0';
        panel.style.width = '100%';
        panel.style.height = 'auto';
        panel.style.boxShadow = 'none';
        panel.style.border = 'none';
        panel.style.borderRadius = '0';

        const cornerResizer = panel.querySelector('.panel-corner-resizer');
        if (cornerResizer) cornerResizer.remove();

        const targetDock = document.getElementById(targetDockId);
        if (targetDock) {
            targetDock.appendChild(panel);
        }

        this.updateSidebarsVisibility();
        this.engine.rendererService.onWindowResize();
    }

    updateSidebarsVisibility() {
        const sidebarLeft = document.getElementById('sidebar-left');
        const splitterLeft = document.getElementById('splitter-left');
        const sidebarRight = document.getElementById('sidebar-right');
        const splitterRight = document.getElementById('splitter-right');

        if (sidebarLeft && splitterLeft) {
            const hasChildren = sidebarLeft.children.length > 0;
            sidebarLeft.style.display = hasChildren ? 'flex' : 'none';
            splitterLeft.style.display = hasChildren ? 'block' : 'none';
        }

        if (sidebarRight && splitterRight) {
            const hasChildren = sidebarRight.children.length > 0;
            sidebarRight.style.display = hasChildren ? 'flex' : 'none';
            splitterRight.style.display = hasChildren ? 'block' : 'none';
        }
    }

    setupViewToggles() {
        const btnToggleExplorer = document.getElementById('btn-toggle-explorer');
        const btnToggleProperties = document.getElementById('btn-toggle-properties');
        const btnToggleViewModel = document.getElementById('btn-toggle-viewmodel');
        const btnToggleConsole = document.getElementById('btn-toggle-console');

        btnToggleExplorer?.addEventListener('click', () => {
            const panel = document.getElementById('panel-explorer');
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'flex';
            btnToggleExplorer.classList.toggle('active', !isVisible);
        });

        btnToggleViewModel?.addEventListener('click', () => {
            const panel = document.getElementById('panel-viewmodel');
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'flex';
            btnToggleViewModel.classList.toggle('active', !isVisible);
        });

        btnToggleProperties?.addEventListener('click', () => {
            const panel = document.getElementById('panel-properties');
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'flex';
            btnToggleProperties.classList.toggle('active', !isVisible);
        });

        btnToggleConsole?.addEventListener('click', () => {
            const consolePanel = document.getElementById('bottom-panel');
            const splitter = document.getElementById('console-splitter');
            const isVisible = consolePanel.style.display !== 'none';
            consolePanel.style.display = isVisible ? 'none' : 'flex';
            if (splitter) splitter.style.display = isVisible ? 'none' : 'block';
            btnToggleConsole.classList.toggle('active', !isVisible);
            this.engine.rendererService.onWindowResize();
        });
    }
}