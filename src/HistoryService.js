import { Part, LightBlock, SpawnLocation, Script, LocalScript, ScreenGui, Frame, TextLabel, TextButton, Model, PointLight, SpotLight, Lighting, MeshPart, StarterPlayer, BillboardGui, SurfaceGui, Water, Terrain, loadAssetFromDB, Player } from './Instance.js';
import { Folder } from './Explorer.js';

export class HistoryService {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
    }

    saveState() {
        const state = this.serializeInstance(window.game);
        this.undoStack.push(state);
        this.redoStack = []; 
        if (this.undoStack.length > 50) this.undoStack.shift();
    }

    async undo() {
        if (this.undoStack.length <= 1) return; 
        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);

        const previousState = this.undoStack[this.undoStack.length - 1];
        await this.deserializeDataModel(previousState);
    }

    async redo() {
        if (this.redoStack.length === 0) return;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);
        await this.deserializeDataModel(nextState);
    }

    serializeInstance(instance) {
        const data = {
            ClassName: instance.ClassName,
            Name: instance.Name,
            children: []
        };

        if (instance.ClassName === "Player") {
            data.UserId = instance.UserId;
            data.DisplayName = instance.DisplayName;
        } else if (instance.ClassName === "LightBlock") {
            data.Shape = instance.Shape;
            data.Size = { x: instance.Size.x, y: instance.Size.y, z: instance.Size.z };
            data.Position = { x: instance.Position.x, y: instance.Position.y, z: instance.Position.z };
            data.Color = instance.Color;
            data.Brightness = instance.Brightness;
            data.Range = instance.Range;
            data.Anchored = instance.Anchored;
            data.CanCollide = instance.CanCollide;
            data.Locked = instance.Locked;
        } else if (instance.ClassName === "Part" || instance.ClassName === "SpawnLocation" || instance.ClassName === "MeshPart") {
            data.Shape = instance.Shape;
            data.Size = { x: instance.Size.x, y: instance.Size.y, z: instance.Size.z };
            data.Position = { x: instance.Position.x, y: instance.Position.y, z: instance.Position.z };
            data.Color = instance.Color;
            data.Anchored = instance.Anchored;
            data.CanCollide = instance.CanCollide;
            data.Locked = instance.Locked;
            
            if (instance.isImportedMesh) {
                data.isImportedMesh = true;
                data.importedAssetId = instance.importedAssetId;
            }

            if (instance.ClassName === "MeshPart") {
                data.AssetId = instance.AssetId;
                data.customTextureUrl = instance.customTextureUrl; 
            }
        } else if (instance.ClassName === "Water") {
            data.Size = { x: instance.Size.x, y: instance.Size.y, z: instance.Size.z };
            data.Position = { x: instance.Position.x, y: instance.Position.y, z: instance.Position.z };
            data.Color = instance.Color;
            data.Transparency = instance.Transparency;
            data.WaveSpeed = instance.WaveSpeed;
            data.Anchored = instance.Anchored;
            data.CanCollide = instance.CanCollide;
            data.Locked = instance.Locked;
        } else if (instance.ClassName === "Terrain") {
            data.Size = { x: instance.Size.x, y: instance.Size.y, z: instance.Size.z };
            data.Position = { x: instance.Position.x, y: instance.Position.y, z: instance.Position.z };
            data.MaterialType = instance.MaterialType;
            data.Anchored = instance.Anchored;
            data.CanCollide = instance.CanCollide;
            data.Locked = instance.Locked;

            if (instance.geometry && instance.geometry.attributes.position) {
                data.heightBuffer = Array.from(instance.geometry.attributes.position.array);
            }
        } else if (instance.ClassName === "Script") {
            data.Source = instance.Source;
        } else if (instance.ClassName === "LocalScript") {
            data.Source = instance.Source;
        } else if (instance.ClassName === "PointLight" || instance.ClassName === "SpotLight") {
            data.Color = instance.Color;
            data.Intensity = instance.Intensity;
            data.Range = instance.Range;
            data.Shadows = instance.Shadows;
            if (instance.ClassName === "SpotLight") data.Angle = instance.Angle;
        } else if (instance.ClassName === "Lighting") {
            data.ClockTime = instance.ClockTime;
            data.Brightness = instance.Brightness;
            data.BloomStrength = instance.BloomStrength;
            data.MotionBlur = instance.MotionBlur;
            data.Exposure = instance.Exposure;
            data.Rayleigh = instance.Rayleigh;
            data.Turbidity = instance.Turbidity;
            data.Ambient = instance.Ambient;
        } else if (instance.ClassName === "StarterPlayer") {
            data.CharacterWalkSpeed = instance.CharacterWalkSpeed;
            data.CharacterJumpPower = instance.CharacterJumpPower;
        } else if (instance.ClassName === "BillboardGui") {
            data.Size = { x: instance.Size.x, y: instance.Size.y };
            data.StudsOffset = { x: instance.StudsOffset.x, y: instance.StudsOffset.y, z: instance.StudsOffset.z };
        } else if (instance.ClassName === "SurfaceGui") {
            data.Face = instance.Face;
        } else if (instance.ClassName === "Frame" || instance.ClassName === "TextLabel" || instance.ClassName === "TextButton") {
            data.Position = { x: instance.Position.x, y: instance.Position.y };
            data.Size = { x: instance.Size.x, y: instance.Size.y };
            data.BackgroundColor = instance.BackgroundColor;
            data.BorderSizePixel = instance.BorderSizePixel;
            data.BorderColor = instance.BorderColor;
            data.Visible = instance.Visible;
            data.BackgroundTransparency = instance.BackgroundTransparency;

            if (instance.ClassName === "TextLabel" || instance.ClassName === "TextButton") {
                data.Text = instance.Text;
                data.TextColor = instance.TextColor;
                data.TextSize = instance.TextSize;
                data.TextWrapped = instance.TextWrapped;
                data.TextXAlignment = instance.TextXAlignment;
                data.TextYAlignment = instance.TextYAlignment;
            }
        }

        for (const child of instance.children) {
            data.children.push(this.serializeInstance(child));
        }
        return data;
    }

    async deserializeDataModel(state) {
        const assetIds = new Set();
        const gatherIds = (node) => {
            if (node.isImportedMesh && node.importedAssetId) {
                assetIds.add(node.importedAssetId);
            }
            if (node.children) {
                for (const child of node.children) gatherIds(child);
            }
        };
        gatherIds(state);

        window.importedAssets = window.importedAssets || new Map();
        for (const id of assetIds) {
            if (!window.importedAssets.has(id)) {
                try {
                    const loaded = await loadAssetFromDB(id);
                    if (loaded) {
                        window.importedAssets.set(id, loaded);
                    }
                } catch (e) {
                    console.warn("Failed loading asset from DB inside deserializer:", e);
                }
            }
        }

        const clearFolder = (name) => {
            const folder = window.game.children.find(c => c.Name === name);
            if (folder) {
                for (const child of [...folder.children]) child.Destroy();
            }
        };
        clearFolder("Workspace");
        clearFolder("Players");
        clearFolder("ServerScriptService");
        clearFolder("StarterGui");

        const loadFolderState = (name) => {
            const folderState = state.children.find(c => c.Name === name);
            const folderInstance = window.game.children.find(c => c.Name === name);
            if (folderState && folderInstance) {
                this.loadStateIntoFolder(folderState, folderInstance);
            }
        };
        loadFolderState("Workspace");
        loadFolderState("Players");
        loadFolderState("ServerScriptService");
        loadFolderState("StarterGui");

        const lightingState = state.children.find(c => c.ClassName === "Lighting");
        const lightingInstance = window.game.children.find(c => c.ClassName === "Lighting");
        if (lightingState && lightingInstance) {
            lightingInstance.ClockTime = lightingState.ClockTime !== undefined ? lightingState.ClockTime : 12.0;
            lightingInstance.Brightness = lightingState.Brightness !== undefined ? lightingState.Brightness : 1.0;
            lightingInstance.BloomStrength = lightingState.BloomStrength !== undefined ? lightingState.BloomStrength : 0.85;
            lightingInstance.MotionBlur = lightingState.MotionBlur !== undefined ? lightingState.MotionBlur : 1.0;
            lightingInstance.Exposure = lightingState.Exposure !== undefined ? lightingState.Exposure : 1.0;
            lightingInstance.Rayleigh = lightingState.Rayleigh !== undefined ? lightingState.Rayleigh : 1.0;
            lightingInstance.Turbidity = lightingState.Turbidity !== undefined ? lightingState.Turbidity : 1.0;
            lightingInstance.Ambient = lightingState.Ambient;
        }

        const spState = state.children.find(c => c.ClassName === "StarterPlayer");
        const spInstance = window.game.children.find(c => c.ClassName === "StarterPlayer");
        if (spState && spInstance) {
            spInstance.CharacterWalkSpeed = spState.CharacterWalkSpeed;
            spInstance.CharacterJumpPower = spState.CharacterJumpPower;
            
            const scsFolder = spInstance.children.find(c => c.Name === "StarterCharacterScripts");
            if (scsFolder) {
                for (const child of [...scsFolder.children]) child.Destroy();
            }
            
            const scsState = spState.children.find(c => c.Name === "StarterCharacterScripts");
            if (scsState && scsFolder) {
                this.loadStateIntoFolder(scsState, scsFolder);
            }
        }

        window.dispatchEvent(new CustomEvent('explorer-changed'));
        window.dispatchEvent(new CustomEvent('gui-changed')); 
        window.dispatchEvent(new CustomEvent('lighting-changed')); 
    }

    loadStateIntoFolder(folderState, folderInstance) {
        for (const childData of folderState.children) {
            let inst;
            if (childData.ClassName === "Player") {
                inst = new Player(childData.Name);
                if (childData.UserId) inst.UserId = childData.UserId;
                if (childData.DisplayName) inst.DisplayName = childData.DisplayName;
            } else if (childData.ClassName === "LightBlock") {
                inst = new LightBlock(childData.Shape || "Block");
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.Color = childData.Color;
                inst.Brightness = childData.Brightness;
                inst.Range = childData.Range;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;
                inst.updateTransform();
            } else if (childData.ClassName === "Part") {
                inst = new Part(childData.Shape);
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.Color = childData.Color;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;
                
                if (childData.isImportedMesh) {
                    inst.isImportedMesh = true;
                    inst.importedAssetId = childData.importedAssetId;
                    
                    window.importedAssets = window.importedAssets || new Map();
                    const cached = window.importedAssets.get(childData.importedAssetId);
                    if (cached) {
                        inst.geometry = cached.geometry;
                        inst.material = cached.material;
                        if (inst.mesh) {
                            inst.mesh.geometry = inst.geometry;
                            inst.mesh.material = inst.material;
                        }
                    }
                }
                
                inst.updateTransform();
            } else if (childData.ClassName === "Water") {
                inst = new Water();
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.Color = childData.Color;
                inst.Transparency = childData.Transparency;
                inst.WaveSpeed = childData.WaveSpeed;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;
                inst.updateTransform();
            } else if (childData.ClassName === "Terrain") {
                inst = new Terrain();
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.MaterialType = childData.MaterialType;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;

                if (childData.heightBuffer && inst.geometry) {
                    const posAttr = inst.geometry.attributes.position;
                    for (let i = 0; i < childData.heightBuffer.length; i++) {
                        posAttr.array[i] = childData.heightBuffer[i];
                    }
                    posAttr.needsUpdate = true;
                    inst.geometry.computeVertexNormals();
                }

                inst.updateTransform();
            } else if (childData.ClassName === "MeshPart") {
                inst = new MeshPart();
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.Color = childData.Color;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;
                inst.AssetId = childData.AssetId; 
                inst.customTextureUrl = childData.customTextureUrl; 
                
                if (childData.isImportedMesh) {
                    inst.isImportedMesh = true;
                    inst.importedAssetId = childData.importedAssetId;
                    
                    window.importedAssets = window.importedAssets || new Map();
                    const cached = window.importedAssets.get(childData.importedAssetId);
                    if (cached) {
                        inst.geometry = cached.geometry;
                        inst.material = cached.material;
                        if (inst.mesh) {
                            inst.mesh.geometry = inst.geometry;
                            inst.mesh.material = inst.material;
                        }
                    }
                } else {
                    inst.recreateGeometry();
                }
                
                inst.updateTransform();
            } else if (childData.ClassName === "SpawnLocation") {
                inst = new SpawnLocation();
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y, childData.Size.z);
                inst.Position.set(childData.Position.x, childData.Position.y, childData.Position.z);
                inst.Color = childData.Color;
                inst.Anchored = childData.Anchored;
                inst.CanCollide = childData.CanCollide;
                inst.Locked = childData.Locked !== undefined ? childData.Locked : false;
                inst.updateTransform();
            } else if (childData.ClassName === "Script") {
                inst = new Script();
                inst.Name = childData.Name;
                inst.Source = childData.Source;
            } else if (childData.ClassName === "LocalScript") {
                inst = new LocalScript();
                inst.Name = childData.Name;
                inst.Source = childData.Source;
            } else if (childData.ClassName === "Model") {
                inst = new Model();
                inst.Name = childData.Name;
            } else if (childData.ClassName === "PointLight") {
                inst = new PointLight();
                inst.Name = childData.Name;
                inst.Color = childData.Color;
                inst.Intensity = childData.Intensity;
                inst.Range = childData.Range;
                inst.Shadows = childData.Shadows;
            } else if (childData.ClassName === "SpotLight") {
                inst = new SpotLight();
                inst.Name = childData.Name;
                inst.Color = childData.Color;
                inst.Intensity = childData.Intensity;
                inst.Range = childData.Range;
                inst.Angle = childData.Angle;
                inst.Shadows = childData.Shadows;
            } else if (childData.ClassName === "BillboardGui") {
                inst = new BillboardGui();
                inst.Name = childData.Name;
                inst.Size.set(childData.Size.x, childData.Size.y);
                inst.StudsOffset.set(childData.StudsOffset.x, childData.StudsOffset.y, childData.StudsOffset.z);
            } else if (childData.ClassName === "SurfaceGui") {
                inst = new SurfaceGui();
                inst.Name = childData.Name;
                inst.Face = childData.Face;
            } else if (childData.ClassName === "ScreenGui") {
                inst = new ScreenGui();
                inst.Name = childData.Name;
            } else if (childData.ClassName === "Frame") {
                inst = new Frame();
                inst.Name = childData.Name;
                inst.Position.set(childData.Position.x, childData.Position.y);
                inst.Size.set(childData.Size.x, childData.Size.y);
                this.copyGuiProps(childData, inst);
            } else if (childData.ClassName === "TextLabel") {
                inst = new TextLabel();
                inst.Name = childData.Name;
                inst.Position.set(childData.Position.x, childData.Position.y);
                inst.Size.set(childData.Size.x, childData.Size.y);
                this.copyGuiProps(childData, inst);
                inst.Text = childData.Text;
                inst.TextColor = childData.TextColor;
                inst.TextSize = childData.TextSize;
                inst.TextWrapped = childData.TextWrapped;
                inst.TextXAlignment = childData.TextXAlignment;
                inst.TextYAlignment = childData.TextYAlignment;
            } else if (childData.ClassName === "TextButton") {
                inst = new TextButton();
                inst.Name = childData.Name;
                inst.Position.set(childData.Position.x, childData.Position.y);
                inst.Size.set(childData.Size.x, childData.Size.y);
                this.copyGuiProps(childData, inst);
                inst.Text = childData.Text;
                inst.TextColor = childData.TextColor;
                inst.TextSize = childData.TextSize;
                inst.TextWrapped = childData.TextWrapped;
                inst.TextXAlignment = childData.TextXAlignment;
                inst.TextYAlignment = childData.TextYAlignment;
            } else if (childData.ClassName === "Folder") {
                inst = new Folder(childData.Name);
            }

            if (inst) {
                inst.Parent = folderInstance;
                if (childData.children && childData.children.length > 0) {
                    this.loadStateIntoFolder(childData, inst);
                }
            }
        }
    }

    copyGuiProps(src, dest) {
        dest.BackgroundColor = src.BackgroundColor;
        dest.BorderSizePixel = src.BorderSizePixel;
        dest.BorderColor = src.BorderColor;
        dest.Visible = src.Visible;
        dest.BackgroundTransparency = src.BackgroundTransparency;
    }
}