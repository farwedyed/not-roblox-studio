import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { saveAssetToDB } from './Instance.js';

export class AssetImportService {
    constructor(engine) {
        this.engine = engine;
    }

    setupImportActions() {
        const folderInput = document.getElementById('local-assets-folder-importer');
        const importBtn = document.getElementById('btn-import-assets');

        if (importBtn && folderInput) {
            importBtn.addEventListener('click', () => folderInput.click());
            folderInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                const gltfFiles = files.filter(f => f.name.endsWith('.glb') || f.name.endsWith('.gltf'));
                if (gltfFiles.length === 0) return;

                const samplePath = files[0].webkitRelativePath || "";
                const folderName = samplePath.split('/')[0] || "Uploaded Models";

                this.engine.logToConsole(`Importing folder "${folderName}" containing ${gltfFiles.length} 3D files...`, 'info');
                
                const fileURLs = {};
                const blobURLsToRevoke = [];
                
                for (const file of files) {
                    const blobURL = URL.createObjectURL(file);
                    blobURLsToRevoke.push(blobURL);
                    fileURLs[file.webkitRelativePath] = blobURL;
                    const parts = file.webkitRelativePath.split('/');
                    fileURLs[parts.slice(1).join('/')] = blobURL;
                    fileURLs[parts[parts.length - 1]] = blobURL;
                }

                const manager = new THREE.LoadingManager();
                manager.setURLModifier((url) => {
                    let cleanURL = url;
                    try {
                        const parsed = new URL(url, window.location.href);
                        if (parsed.origin === window.location.origin) cleanURL = parsed.pathname;
                    } catch (err) {}

                    cleanURL = cleanURL.replace(/^(\.?\/)/, '');
                    cleanURL = decodeURIComponent(cleanURL);
                    const parts = cleanURL.split('/');
                    return fileURLs[cleanURL] || fileURLs[parts[parts.length - 1]] || url;
                });

                const loader = new GLTFLoader(manager);
                window.importedFolderRegistry = window.importedFolderRegistry || {};
                window.importedFolderRegistry[folderName] = window.importedFolderRegistry[folderName] || [];

                let importedCount = 0;

                for (const file of gltfFiles) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        await new Promise((resolve) => {
                            loader.parse(arrayBuffer, '', (gltf) => {
                                const modelName = file.name.replace(/\.[^/.]+$/, "");
                                const thumbUrl = this.engine.ui ? this.engine.ui.generateThumbnail(gltf.scene) : "";

                                let assetCounter = window.importedAssetCounter || 0;
                                const meshEntries = [];

                                gltf.scene.traverse((child) => {
                                    if (child.isMesh) {
                                        assetCounter++;
                                        const assetId = `rbxasset://imported-${assetCounter}-${Date.now()}`;
                                        window.importedAssets = window.importedAssets || new Map();
                                        window.importedAssets.set(assetId, {
                                            geometry: child.geometry.clone(),
                                            material: child.material.clone()
                                        });

                                        saveAssetToDB(assetId, child.geometry, child.material);

                                        const worldPos = new THREE.Vector3();
                                        child.getWorldPosition(worldPos);

                                        meshEntries.push({
                                            name: child.name || "MeshPart",
                                            assetId: assetId,
                                            relativePos: worldPos.clone()
                                        });
                                    }
                                });
                                window.importedAssetCounter = assetCounter;

                                window.importedFolderRegistry[folderName].push({
                                    name: modelName,
                                    thumbUrl: thumbUrl,
                                    meshEntries: meshEntries
                                });

                                importedCount++;
                                resolve();
                            });
                        });
                    } catch (err) {
                        this.engine.logToConsole(`Error reading ${file.name}: ${err.message}`, 'error');
                    }
                }

                setTimeout(() => {
                    blobURLsToRevoke.forEach(url => URL.revokeObjectURL(url));
                }, 10000); 

                window.dispatchEvent(new CustomEvent('viewmodel-changed'));
                this.engine.logToConsole(`Successfully imported folder "${folderName}" with ${importedCount} models! Check "View Model" panel to insert them.`, 'success');
            });
        }

        document.getElementById('btn-export-project')?.addEventListener('click', () => {
            const state = this.engine.history.serializeInstance(window.game);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `${this.engine.activeProjectName || "WorkspaceExperience"}.webxl`);
            dlAnchor.click();
        });

        const fileImporter = document.getElementById('local-project-file-importer');
        document.getElementById('btn-import-project')?.addEventListener('click', () => fileImporter.click());
        fileImporter?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (event) => {
                const state = JSON.parse(event.target.result);
                await this.engine.history.deserializeDataModel(state);
                const loadedName = file.name.replace(/\.[^/.]+$/, "");
                this.engine.saveService.updateTitleBar(loadedName);
            };
            reader.readAsText(file);
        });

        document.getElementById('btn-clear-console')?.addEventListener('click', () => {
            document.getElementById('console-output').innerHTML = '';
        });
    }
}