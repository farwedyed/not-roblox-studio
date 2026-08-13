export class SaveService {
    constructor(engine) {
        this.engine = engine;
    }

    saveLocal(name) {
        const state = this.engine.history.serializeInstance(window.game);
        const localGames = this.getLocalGames();
        
        // Overwrite if same name exists, otherwise append
        const existingIdx = localGames.findIndex(g => g.name === name);
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
        this.engine.logToConsole(`Successfully saved experience [${name}] locally.`, 'success');
    }

    saveCloud(name, onComplete) {
        // Simulate network transmission latency
        this.engine.logToConsole("Connecting to Roblox secure cloud servers...", "info");
        
        setTimeout(() => {
            const state = this.engine.history.serializeInstance(window.game);
            const cloudGames = this.getCloudGames();
            
            const existingIdx = cloudGames.findIndex(g => g.name === name);
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
            this.engine.logToConsole(`Successfully published experience [${name}] to Roblox Cloud!`, 'success');
            if (onComplete) onComplete();
        }, 1500); // 1.5 second simulated latency
    }

    getLocalGames() {
        return JSON.parse(localStorage.getItem('STUDIO_LOCAL_GAMES')) || [];
    }

    getCloudGames() {
        return JSON.parse(localStorage.getItem('STUDIO_CLOUD_GAMES')) || [];
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