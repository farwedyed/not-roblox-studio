import { Instance, Lighting, StarterPlayer } from './Instance.js';

export class Folder extends Instance {
    constructor(name) {
        super("Folder", name);
    }
}

export function createDataModel() {
    const game = new Folder("game");

    const Workspace = new Folder("Workspace");
    const ReplicatedStorage = new Folder("ReplicatedStorage");
    const ServerScriptService = new Folder("ServerScriptService");
    const StarterPlayerService = new StarterPlayer(); 
    const StarterGui = new Folder("StarterGui"); 
    
    // Core Services
    const LightingService = new Lighting();
    LightingService.Name = "Lighting";

    // FIXED: Removed the redundant .push() call which was creating duplicate folders in the Explorer [3]
    const StarterCharacterScripts = new Folder("StarterCharacterScripts");
    StarterCharacterScripts.Parent = StarterPlayerService;

    Workspace.Parent = game;
    ReplicatedStorage.Parent = game;
    ServerScriptService.Parent = game;
    StarterPlayerService.Parent = game;
    StarterGui.Parent = game;
    LightingService.Parent = game;

    return game;
}