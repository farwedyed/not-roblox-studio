export class HubService {
    constructor(engine) {
        this.engine = engine;
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
            [btnNew, btnLocal, btnCloud].forEach(btn => btn?.classList.remove('selected'));
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

        if (btnNew) btnNew.addEventListener('click', () => switchTab('new'));
        if (btnLocal) btnLocal.addEventListener('click', () => switchTab('local'));
        if (btnCloud) btnCloud.addEventListener('click', () => switchTab('cloud'));

        document.getElementById('card-baseplate')?.addEventListener('click', async () => {
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

            await this.engine.history.deserializeDataModel({ children: [
                baseplateState,
                { ClassName: "Folder", Name: "ServerScriptService", children: [] },
                { ClassName: "Folder", Name: "StarterGui", children: [] }
            ]});
            
            this.engine.saveService.updateTitleBar("Untitled Place");
            
            hub.style.display = 'none';
            container.style.display = 'flex';
            this.engine.rendererService.onWindowResize();
        });
    }

    renderLocalSaves() {
        const grid = document.getElementById('local-saves-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const games = this.engine.saveService.getLocalGames();

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
                await this.engine.history.deserializeDataModel(g.state);
                this.engine.saveService.updateTitleBar(g.name);
                document.getElementById('studio-hub').style.display = 'none';
                document.getElementById('studio-container').style.display = 'flex';
                this.engine.rendererService.onWindowResize();
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${g.name}?`)) {
                    this.engine.saveService.deleteLocalGame(g.id);
                    this.renderLocalSaves();
                }
            });

            grid.appendChild(card);
        });
    }

    renderCloudSaves() {
        const grid = document.getElementById('cloud-saves-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const games = this.engine.saveService.getCloudGames();

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
                await this.engine.history.deserializeDataModel(g.state);
                this.engine.saveService.updateTitleBar(g.name);
                document.getElementById('studio-hub').style.display = 'none';
                document.getElementById('studio-container').style.display = 'flex';
                this.engine.rendererService.onWindowResize();
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${g.name}?`)) {
                    this.engine.saveService.deleteCloudGame(g.id);
                    this.renderCloudSaves();
                }
            });

            grid.appendChild(card);
        });
    }
}