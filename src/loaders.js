import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state } from './state.js';
import { scene, camera } from './scene.js';
import { saveModelToDB, saveTextureToDB } from './db.js';
import { DUMMY_WHITE_PIXEL, materialTextureLibrary, fileBlobMap, fileToAssetIdMap, blobUrlToAssetIdMap, assetIdToDisplayNameMap } from './materials.js';
import { selectMultipleObjects } from './selection.js';
import { updateExplorer, showStatus, saveState } from './ui.js';

let sharedThumbRenderer = null;
const textureLoader = new THREE.TextureLoader();

// Helper to create or fetch a collapsible folder section in the Toolbox UI
export function getOrCreateToolboxFolderSection(folderName) {
    const toolboxList = document.getElementById('toolbox-list');
    if (!toolboxList) return null;

    const safeId = 'folder-section-' + folderName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    let sectionEl = document.getElementById(safeId);

    if (!sectionEl) {
        sectionEl = document.createElement('div');
        sectionEl.id = safeId;
        sectionEl.className = 'toolbox-folder-section';
        sectionEl.style.marginBottom = '8px';
        sectionEl.innerHTML = `
            <div class="folder-header" style="background:#2d2d2d; border:1px solid #3c3c3c; padding:6px 10px; color:#00a2ff; font-weight:bold; font-size:11px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-radius:4px;">
                <span>📁 ${folderName}</span>
                <span class="folder-toggle" style="font-size:10px; color:#888;">▼</span>
            </div>
            <div class="folder-content" style="padding:4px 0 0 4px; display:block;"></div>
        `;
        
        sectionEl.querySelector('.folder-header').onclick = () => {
            const content = sectionEl.querySelector('.folder-content');
            const toggle = sectionEl.querySelector('.folder-toggle');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggle.innerText = '▼';
            } else {
                content.style.display = 'none';
                toggle.innerText = '▶';
            }
        };
        toolboxList.appendChild(sectionEl);
    }
    return sectionEl.querySelector('.folder-content');
}

// Math-based relative path resolver that resolves relative directory pointers (e.g. "../" or "./")
export function resolveRelativePath(baseDir, relativePath) {
    const absoluteParts = baseDir.split('/').filter(Boolean);
    const relParts = relativePath.split('/');
    for (let part of relParts) {
        if (part === '..') {
            absoluteParts.pop();
        } else if (part !== '.' && part !== '') {
            absoluteParts.push(part);
        }
    }
    return absoluteParts.join('/');
}

// Deep clone materials so models do not share reference states
export function cloneModelWithMaterials(sourceModel) {
    const clone = sourceModel.clone();
    clone.traverse(c => {
        if (c.isMesh && c.material) {
            if (Array.isArray(c.material)) {
                c.material = c.material.map(mat => mat.clone());
            } else {
                c.material = c.material.clone();
            }
        }
    });
    return clone;
}

export function getSpawnPositionForNewObject(objectToSpawn) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const intersects = raycaster.intersectObjects(state.placedObjects, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const box = new THREE.Box3().setFromObject(objectToSpawn);
        const heightOffset = objectToSpawn.position.y - box.min.y;

        const moveVal = parseFloat(document.getElementById('snap-move-select')?.value) || 1;

        let posX = hit.point.x;
        let posZ = hit.point.z;
        let posY = hit.point.y + heightOffset;

        if (moveVal > 0) {
            posX = Math.round(posX / moveVal) * moveVal;
            posZ = Math.round(posZ / moveVal) * moveVal;
        }

        return new THREE.Vector3(posX, posY, posZ);
    } else {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const spawnPos = camera.position.clone().add(forward.multiplyScalar(15));

        const box = new THREE.Box3().setFromObject(objectToSpawn);
        const heightOffset = objectToSpawn.position.y - box.min.y;
        if (spawnPos.y < heightOffset) spawnPos.y = heightOffset;

        const moveVal = parseFloat(document.getElementById('snap-move-select')?.value) || 1;
        if (moveVal > 0) {
            spawnPos.x = Math.round(spawnPos.x / moveVal) * moveVal;
            spawnPos.z = Math.round(spawnPos.z / moveVal) * moveVal;
        }

        return spawnPos;
    }
}

export function generateModelThumbnail(model) {
    try {
        if (!sharedThumbRenderer) {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 96; thumbCanvas.height = 96;
            sharedThumbRenderer = new THREE.WebGLRenderer({ canvas: thumbCanvas, alpha: true, antialias: true });
            sharedThumbRenderer.setSize(96, 96);
        }

        const thumbScene = new THREE.Scene();
        thumbScene.add(new THREE.AmbientLight(0xffffff, 2.2));
        const light = new THREE.DirectionalLight(0xffffff, 2.0);
        light.position.set(5, 10, 7);
        thumbScene.add(light);

        const clone = cloneModelWithMaterials(model);
        thumbScene.add(clone);

        const box = new THREE.Box3().setFromObject(clone);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        const thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        thumbCamera.position.set(center.x + maxDim * 1.2, center.y + maxDim * 1.0, center.z + maxDim * 1.4);
        thumbCamera.lookAt(center);

        sharedThumbRenderer.render(thumbScene, thumbCamera);
        return sharedThumbRenderer.domElement.toDataURL();
    } catch(e) {
        return "";
    }
}

export function getBase64FromImage(image) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.width || image.naturalWidth || 256;
        canvas.height = image.height || image.naturalHeight || 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL('image/png');
    } catch(e) {
        console.warn("Base64 extraction failed:", e);
        return null;
    }
}

export function processImportedFiles(files) {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const glbFiles = [];
    const imageFiles = [];

    fileList.forEach(file => {
        const blobUrl = URL.createObjectURL(file);
        const nameLower = file.name.toLowerCase();

        fileBlobMap.set(nameLower, blobUrl);
        fileBlobMap.set(file.name, blobUrl);

        if (file.webkitRelativePath) {
            const relPath = file.webkitRelativePath.toLowerCase().replace(/\\/g, '/');
            fileBlobMap.set(relPath, blobUrl);
            
            const parts = relPath.split('/');
            if (parts.length > 1) {
                const subPath = parts.slice(1).join('/');
                fileBlobMap.set(subPath, blobUrl);
            }
        }

        if (nameLower.endsWith('.glb') || nameLower.endsWith('.gltf')) {
            glbFiles.push(file);
        } else if (nameLower.endsWith('.png') || nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
            imageFiles.push(file);
        }
    });

    let pendingImages = imageFiles.length;

    const proceedToGLBLoading = () => {
        let pendingModels = glbFiles.length;
        const checkFinished = () => {
            pendingModels--;
            if (pendingModels <= 0) {
                setTimeout(() => {
                    repairSceneTextures();
                }, 100);
            }
        };

        if (pendingModels === 0) {
            setTimeout(() => { repairSceneTextures(); }, 100);
            return;
        }

        glbFiles.forEach(file => {
            // FIX: Use full directory path context as key to isolate namespaces
            let fileRelPath = file.webkitRelativePath || file.name;
            fileRelPath = fileRelPath.replace(/\\/g, '/');
            const cleanPathId = fileRelPath.toLowerCase().replace(/\.(glb|gltf)$/i, '');
            const cleanDisplayName = file.name.replace(/\.(glb|gltf)$/i, '');

            const lastSlash = fileRelPath.lastIndexOf('/');
            const baseDir = lastSlash !== -1 ? fileRelPath.substring(0, lastSlash + 1) : "";

            const reader = new FileReader();

            reader.onload = function(e) {
                const arrayBuffer = e.target.result;

                // Save using the unique relative path as ID
                saveModelToDB(cleanPathId, arrayBuffer, baseDir);

                const localManager = new THREE.LoadingManager();
                localManager.setURLModifier((url) => {
                    if (!url) return url;
                    const cleanUrl = decodeURIComponent(url).replace(/\\/g, '/').toLowerCase();
                    const fileName = cleanUrl.split('/').pop().split('?')[0];

                    const localResolvedPath = resolveRelativePath(baseDir, cleanUrl).toLowerCase();
                    
                    if (fileToAssetIdMap.has(localResolvedPath)) {
                        const assetId = fileToAssetIdMap.get(localResolvedPath);
                        if (fileBlobMap.has(assetId)) {
                            const resolvedUrl = fileBlobMap.get(assetId);
                            blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                            return resolvedUrl;
                        }
                    }
                    if (fileToAssetIdMap.has(cleanUrl)) {
                        const assetId = fileToAssetIdMap.get(cleanUrl);
                        if (fileBlobMap.has(assetId)) {
                            const resolvedUrl = fileBlobMap.get(assetId);
                            blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                            return resolvedUrl;
                        }
                    }
                    if (fileToAssetIdMap.has(fileName)) {
                        const assetId = fileToAssetIdMap.get(fileName);
                        if (fileBlobMap.has(assetId)) {
                            const resolvedUrl = fileBlobMap.get(assetId);
                            blobUrlToAssetIdMap.set(resolvedUrl, assetId);
                            return resolvedUrl;
                        }
                    }

                    if (url.match(/\.(png|jpg|jpeg|webp)$/i) || url.includes('Textures/')) {
                        return DUMMY_WHITE_PIXEL;
                    }

                    return url;
                });

                const customGltfLoader = new GLTFLoader(localManager);

                customGltfLoader.parse(
                    arrayBuffer,
                    '/',
                    (gltf) => {
                        const model = gltf.scene;
                        model.name = cleanPathId;
                        state.loadedModels[cleanPathId] = model;

                        model.traverse(c => {
                            if (c.isMesh) {
                                c.castShadow = true;
                                c.receiveShadow = true;
                                if (c.material) {
                                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                                    mats.forEach(mat => {
                                        if (mat.map && mat.map.image) {
                                            const imgSrc = mat.map.image.src;
                                            let assetId;
                                            if (blobUrlToAssetIdMap.has(imgSrc)) {
                                                assetId = blobUrlToAssetIdMap.get(imgSrc);
                                            } else {
                                                assetId = "tex_" + THREE.MathUtils.generateUUID();
                                                fileToAssetIdMap.set(assetId, assetId);
                                                blobUrlToAssetIdMap.set(imgSrc, assetId);
                                            }

                                            mat.userData.textureAssetId = assetId;
                                            c.userData.textureAssetId = assetId;

                                            const img = mat.map.image;
                                            const handleImageExtraction = () => {
                                                const base64 = getBase64FromImage(img);
                                                if (base64) {
                                                    state.textureData[assetId] = base64;
                                                    saveTextureToDB(assetId, base64, "image/png", assetId);
                                                }
                                            };

                                            if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
                                                handleImageExtraction();
                                            } else if (img.complete && img.naturalWidth > 0) {
                                                handleImageExtraction();
                                            } else {
                                                img.addEventListener('load', handleImageExtraction);
                                            }
                                        }
                                    });
                                }
                            }
                        });

                        const thumbDataUrl = generateModelThumbnail(model);

                        // FIX: Generate the dynamic collapsible sections in the Toolbox UI
                        const parts = cleanPathId.split('/');
                        const folderName = parts.length > 1 ? parts.slice(0, -1).join('/') : "Loose Files";
                        const folderContent = getOrCreateToolboxFolderSection(folderName);

                        const item = document.createElement('div');
                        item.className = 'asset-item';
                        item.innerHTML = `
                            ${thumbDataUrl ? `<img class="asset-thumb" src="${thumbDataUrl}" alt="${cleanDisplayName}">` : `<div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>`}
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${cleanDisplayName}</div>
                                <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                            </div>
                            <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                        `;
                        item.onclick = () => spawnModel(cleanPathId);
                        if (folderContent) folderContent.appendChild(item);

                        showStatus("Loaded Model: " + cleanDisplayName);
                        checkFinished();
                    },
                    (err) => {
                        const fallbackLoader = new GLTFLoader(localManager);
                        fallbackLoader.parse(arrayBuffer, '', (gltf) => {
                            const model = gltf.scene;
                            model.name = cleanPathId;
                            state.loadedModels[cleanPathId] = model;
                            
                            model.traverse(c => {
                                if (c.isMesh) {
                                    c.castShadow = true;
                                    c.receiveShadow = true;
                                    if (c.material) {
                                        const mats = Array.isArray(c.material) ? c.material : [c.material];
                                        mats.forEach(mat => {
                                            if (mat.map && mat.map.image) {
                                                const imgSrc = mat.map.image.src;
                                                let assetId;
                                                if (blobUrlToAssetIdMap.has(imgSrc)) {
                                                    assetId = blobUrlToAssetIdMap.get(imgSrc);
                                                } else {
                                                    assetId = "tex_" + THREE.MathUtils.generateUUID();
                                                    fileToAssetIdMap.set(assetId, assetId);
                                                    blobUrlToAssetIdMap.set(imgSrc, assetId);
                                                }

                                                mat.userData.textureAssetId = assetId;
                                                c.userData.textureAssetId = assetId;

                                                const img = mat.map.image;
                                                const handleImageExtraction = () => {
                                                    const base64 = getBase64FromImage(img);
                                                    if (base64) {
                                                        state.textureData[assetId] = base64;
                                                        saveTextureToDB(assetId, base64, "image/png", assetId);
                                                    }
                                                };

                                                if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
                                                    handleImageExtraction();
                                                } else if (img.complete && img.naturalWidth > 0) {
                                                    handleImageExtraction();
                                                } else {
                                                    img.addEventListener('load', handleImageExtraction);
                                                }
                                            }
                                        });
                                    }
                                }
                            });

                            const parts = cleanPathId.split('/');
                            const folderName = parts.length > 1 ? parts.slice(0, -1).join('/') : "Loose Files";
                            const folderContent = getOrCreateToolboxFolderSection(folderName);

                            const item = document.createElement('div');
                            item.className = 'asset-item';
                            item.innerHTML = `
                                <div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>
                                <div style="flex:1; overflow:hidden;">
                                    <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${cleanDisplayName}</div>
                                    <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                                </div>
                                <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                            `;
                            item.onclick = () => spawnModel(cleanPathId);
                            if (folderContent) folderContent.appendChild(item);
                            checkFinished();
                        }, () => checkFinished());
                    }
                );
            };

            reader.readAsArrayBuffer(file);
        });
    };

    if (pendingImages === 0) {
        proceedToGLBLoading();
    } else {
        imageFiles.forEach(file => {
            const nameLower = file.name.toLowerCase();
            const reader = new FileReader();

            reader.onload = function(e) {
                const base64Data = e.target.result;
                
                let storageName = file.webkitRelativePath || file.name;
                storageName = storageName.replace(/\\/g, '/');

                const assetId = "tex_" + THREE.MathUtils.generateUUID();

                state.textureData[assetId] = base64Data;
                saveTextureToDB(assetId, base64Data, file.type, storageName);

                fileToAssetIdMap.set(storageName.toLowerCase(), assetId);
                
                if (!storageName.includes('/')) {
                    fileToAssetIdMap.set(nameLower, assetId);
                }
                
                assetIdToDisplayNameMap.set(assetId, storageName);

                fileBlobMap.set(assetId, base64Data);
                blobUrlToAssetIdMap.set(base64Data, assetId);

                textureLoader.load(base64Data, (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    state.loadedTextures[assetId] = texture;

                    if (storageName.toLowerCase().includes('skybox')) {
                        const toolboxList = document.getElementById('toolbox-list');
                        const item = document.createElement('div');
                        item.className = 'asset-item';
                        item.style.borderColor = '#28a745';
                        item.innerHTML = `
                            <img class="asset-thumb" src="${base64Data}" alt="${file.name}">
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${file.name}</div>
                                <div style="font-size:9px; color:#28a745;">Skybox Image</div>
                            </div>
                            <span style="color:#28a745; font-weight:bold;">Set Sky</span>
                        `;
                        item.onclick = () => { scene.background = texture; scene.environment = texture; };
                        if (toolboxList) toolboxList.appendChild(item);
                    }
                    pendingImages--;
                    if (pendingImages <= 0) {
                        proceedToGLBLoading();
                    }
                }, undefined, () => {
                    pendingImages--;
                    if (pendingImages <= 0) {
                        proceedToGLBLoading();
                    }
                });
            };

            reader.readAsDataURL(file);
        });
    }
}

export function handleFileSelect(event) {
    processImportedFiles(event.target.files);
}

export function spawnModel(modelName) {
    if (!state.loadedModels[modelName]) return;
    saveState();
    const model = cloneModelWithMaterials(state.loadedModels[modelName]);
    model.name = modelName + "_" + (state.placedObjects.length + 1);
    model.userData = { locked: false, anchored: true, canCollide: true, modelType: modelName };

    model.traverse(c => {
        if (c.isMesh) { 
            c.castShadow = true; 
            c.receiveShadow = true; 
            
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(mat => {
                    if (mat.userData && mat.userData.textureAssetId) {
                        c.userData.textureAssetId = mat.userData.textureAssetId;
                    }
                });
            }
        }
    });

    const spawnPos = getSpawnPositionForNewObject(model);
    model.position.copy(spawnPos);

    scene.add(model);
    state.placedObjects.push(model);

    selectMultipleObjects([model]);
    updateExplorer();
}

export function insertPrimitive(type) {
    saveState();
    let geo, mat = new THREE.MeshStandardMaterial({ color: 0xa3a2a5, roughness: 0.5 });
    if (type === 'Block') geo = new THREE.BoxGeometry(2, 2, 2);
    if (type === 'Sphere') geo = new THREE.SphereGeometry(1.5, 32, 32);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = type + "_" + (state.placedObjects.length + 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { locked: false, anchored: true, canCollide: true, isPrimitive: true, primitiveType: type };

    const spawnPos = getSpawnPositionForNewObject(mesh);
    mesh.position.copy(spawnPos);

    scene.add(mesh);
    state.placedObjects.push(mesh);

    selectMultipleObjects([mesh]);
    updateExplorer();
}

export function applyMaterialToSelected(matName) {
    if (state.selectedObjects.length === 0) return;

    state.selectedObjects.forEach(obj => {
        obj.userData.materialName = matName;
        obj.traverse(c => {
            if (c.isMesh) {
                if (matName === "Plastic") {
                    c.material.map = null;
                } else if (materialTextureLibrary[matName]) {
                    const tex = materialTextureLibrary[matName].clone();
                    tex.needsUpdate = true;
                    c.material.map = tex;
                }
                c.material.needsUpdate = true;
            }
        });
    });
    saveState();
    showStatus("Set Material: " + matName);
}

export function setTextureRepeatScale(scaleVal) {
    if (state.selectedObjects.length === 0) return;
    state.selectedObjects.forEach(obj => {
        obj.traverse(c => {
            if (c.isMesh && c.material.map) {
                c.material.map.repeat.set(scaleVal, scaleVal);
                c.material.map.needsUpdate = true;
            }
        });
    });
}

export function repairSceneTextures() {
    let repairedCount = 0;

    state.placedObjects.forEach(obj => {
        obj.traverse(activeChild => {
            if (!activeChild.isMesh) return;

            let ancestor = activeChild;
            let modelType = null;
            while (ancestor) {
                if (ancestor.userData && ancestor.userData.modelType) {
                    modelType = ancestor.userData.modelType;
                    break;
                }
                ancestor = ancestor.parent;
            }

            if (modelType && state.loadedModels[modelType]) {
                const template = state.loadedModels[modelType];
                let templateChild = null;

                template.traverse(tChild => {
                    if (tChild.isMesh && tChild.name === activeChild.name) {
                        templateChild = tChild;
                    }
                });

                if (!templateChild) {
                    let activeIndex = -1;
                    let idx = 0;
                    const activeAncestor = ancestor || activeChild;
                    activeAncestor.traverse(node => {
                        if (node === activeChild) activeIndex = idx;
                        if (node.isMesh) idx++;
                    });

                    idx = 0;
                    template.traverse(node => {
                        if (node.isMesh) {
                            if (idx === activeIndex) templateChild = node;
                            idx++;
                        }
                    });
                }

                if (templateChild && templateChild.isMesh) {
                    if (templateChild.material) {
                        if (Array.isArray(templateChild.material)) {
                            activeChild.material = templateChild.material.map(m => m.clone());
                        } else {
                            activeChild.material = templateChild.material.clone();
                        }
                        activeChild.material.needsUpdate = true;

                        if (templateChild.userData && templateChild.userData.textureAssetId) {
                            activeChild.userData.textureAssetId = templateChild.userData.textureAssetId;
                            
                            const activeMats = Array.isArray(activeChild.material) ? activeChild.material : [activeChild.material];
                            activeMats.forEach(m => {
                                m.userData.textureAssetId = templateChild.userData.textureAssetId;
                            });
                        }
                        repairedCount++;
                    }
                }
            }
        });
    });

    if (repairedCount > 0) {
        showStatus(`Repaired materials/textures for ${repairedCount} parts!`);
        saveState();
    } else {
        console.log("No repairable structures found in viewport.");
    }
}