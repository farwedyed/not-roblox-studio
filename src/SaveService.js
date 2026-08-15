export class SaveService {
    constructor(engine) {
        this.engine = engine;
    }

    updateTitleBar(name) {
        const titleEl = document.getElementById('project-title-display');
        if (titleEl) {
            titleEl.innerText = `${name} - Roblox Studio`;
        }
        if (this.engine) {
            this.engine.activeProjectName = name;
        }
    }

    quickSave() {
        const currentName = this.engine.activeProjectName;
        const isUntitled = !currentName || 
                            currentName === "Untitled Experience" || 
                            currentName === "Untitled Place" || 
                            currentName === "Untitled Game";

        if (!isUntitled) {
            this.saveLocal(currentName);
        } else {
            this.saveAs();
        }
    }

    saveAs() {
        const defaultName = (this.engine.activeProjectName && 
                             this.engine.activeProjectName !== "Untitled Experience" && 
                             this.engine.activeProjectName !== "Untitled Place") 
            ? this.engine.activeProjectName 
            : "My Roblox Place";

        const name = prompt("Enter experience name to save locally:", defaultName);
        if (name && name.trim() !== "") {
            const cleanName = name.trim();
            this.saveLocal(cleanName);
        }
    }

    saveLocal(name) {
        const state = this.engine.history.serializeInstance(window.game);
        const localGames = this.getLocalGames();

        const existingIdx = localGames.findIndex(g => g.name.toLowerCase() === name.toLowerCase());
        const saveObject = {
            id: existingIdx > -1 ? localGames[existingIdx].id : Date.now().toString(),
            name: name,
            lastSaved: new Date().toLocaleString(),
            state: state
        };

        if (existingIdx > -1) {
            localGames[existingIdx] = saveObject;
        } else {
            localGames.push(saveObject);
        }

        localStorage.setItem('STUDIO_LOCAL_GAMES', JSON.stringify(localGames));
        this.updateTitleBar(name);
        this.engine.logToConsole(`Successfully saved place [${name}] locally.`, 'success');
    }

    saveCloud(name, onComplete) {
        this.engine.logToConsole("Connecting to Roblox secure cloud servers...", "info");

        setTimeout(() => {
            const state = this.engine.history.serializeInstance(window.game);
            const cloudGames = this.getCloudGames();

            const existingIdx = cloudGames.findIndex(g => g.name.toLowerCase() === name.toLowerCase());
            const saveObject = {
                id: existingIdx > -1 ? cloudGames[existingIdx].id : Date.now().toString(),
                name: name,
                lastSaved: new Date().toLocaleString(),
                state: state
            };

            if (existingIdx > -1) {
                cloudGames[existingIdx] = saveObject;
            } else {
                cloudGames.push(saveObject);
            }

            localStorage.setItem('STUDIO_CLOUD_GAMES', JSON.stringify(cloudGames));
            this.updateTitleBar(name);
            this.engine.logToConsole(`Successfully published place [${name}] to Roblox Cloud!`, 'success');
            if (onComplete) onComplete();
        }, 1200);
    }

    getLocalGames() {
        try {
            return JSON.parse(localStorage.getItem('STUDIO_LOCAL_GAMES')) || [];
        } catch (e) {
            return [];
        }
    }

    getCloudGames() {
        try {
            return JSON.parse(localStorage.getItem('STUDIO_CLOUD_GAMES')) || [];
        } catch (e) {
            return [];
        }
    }

    deleteLocalGame(id) {
        const games = this.getLocalGames().filter(g => g.id !== id);
        localStorage.setItem('STUDIO_LOCAL_GAMES', JSON.stringify(games));
    }

    deleteCloudGame(id) {
        const games = this.getCloudGames().filter(g => g.id !== id);
        localStorage.setItem('STUDIO_CLOUD_GAMES', JSON.stringify(games));
    }
}