import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state } from './state.js';
import { scene, camera } from './scene.js';
import { saveModelToDB, saveTextureToDB } from './db.js';
import { DUMMY_WHITE_PIXEL, materialTextureLibrary, fileBlobMap } from './materials.js';
import { selectMultipleObjects } from './selection.js';
import { updateExplorer, showStatus, saveState } from './ui.js';

let sharedThumbRenderer = null;
const textureLoader = new THREE.TextureLoader();

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

        const clone = model.clone();
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

export function processImportedFiles(files) {
    if (!files || files.length === 0) return;

    const toolboxList = document.getElementById('toolbox-list');
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

    glbFiles.forEach(file => {
        const cleanName = file.name.replace(/\.(glb|gltf)$/i, '');
        const reader = new FileReader();

        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            saveModelToDB(cleanName, arrayBuffer);

            const customGltfLoader = new GLTFLoader();

            customGltfLoader.parse(
                arrayBuffer,
                '/',
                (gltf) => {
                    const model = gltf.scene;
                    model.name = cleanName;
                    state.loadedModels[model.name] = model;

                    const thumbDataUrl = generateModelThumbnail(model);

                    const item = document.createElement('div');
                    item.className = 'asset-item';
                    item.innerHTML = `
                        ${thumbDataUrl ? `<img class="asset-thumb" src="${thumbDataUrl}" alt="${model.name}">` : `<div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>`}
                        <div style="flex:1; overflow:hidden;">
                            <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${model.name}</div>
                            <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                        </div>
                        <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                    `;
                    item.onclick = () => spawnModel(model.name);
                    toolboxList.appendChild(item);
                    showStatus("Loaded Model: " + model.name);
                },
                (err) => {
                    const fallbackLoader = new GLTFLoader();
                    fallbackLoader.parse(arrayBuffer, '', (gltf) => {
                        const model = gltf.scene;
                        model.name = cleanName;
                        state.loadedModels[model.name] = model;
                        const item = document.createElement('div');
                        item.className = 'asset-item';
                        item.innerHTML = `
                            <div class="asset-thumb" style="display:flex;align-items:center;justify-content:center;color:#00a2ff;font-size:18px;">📦</div>
                            <div style="flex:1; overflow:hidden;">
                                <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${model.name}</div>
                                <div style="font-size:9px; color:#aaa;">3D Model (.glb)</div>
                            </div>
                            <span style="color:#00a2ff; font-weight:bold;">+ Add</span>
                        `;
                        item.onclick = () => spawnModel(model.name);
                        toolboxList.appendChild(item);
                    });
                }
            );
        };

        reader.readAsArrayBuffer(file);
    });

    imageFiles.forEach(file => {
        const nameLower = file.name.toLowerCase();
        const reader = new FileReader();

        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            saveTextureToDB(file.name, arrayBuffer, file.type);

            const blob = new Blob([arrayBuffer], { type: file.type });
            const fileURL = URL.createObjectURL(blob);

            fileBlobMap.set(nameLower, fileURL);
            fileBlobMap.set(file.name, fileURL);

            textureLoader.load(fileURL, (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                state.loadedTextures[file.name] = texture;

                if (nameLower.includes('skybox')) {
                    const item = document.createElement('div');
                    item.className = 'asset-item';
                    item.style.borderColor = '#28a745';
                    item.innerHTML = `
                        <img class="asset-thumb" src="${fileURL}" alt="${file.name}">
                        <div style="flex:1; overflow:hidden;">
                            <div style="font-weight:bold; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${file.name}</div>
                            <div style="font-size:9px; color:#28a745;">Skybox Image</div>
                        </div>
                        <span style="color:#28a745; font-weight:bold;">Set Sky</span>
                    `;
                    item.onclick = () => { scene.background = texture; scene.environment = texture; };
                    toolboxList.appendChild(item);
                }
            });
        };

        reader.readAsArrayBuffer(file);
    });
}

export function handleFileSelect(event) {
    processImportedFiles(event.target.files);
}

export function spawnModel(modelName) {
    if (!state.loadedModels[modelName]) return;
    const model = state.loadedModels[modelName].clone();
    model.name = modelName + "_" + (state.placedObjects.length + 1);
    model.userData = { locked: false, anchored: true, canCollide: true, modelType: modelName };

    model.traverse(c => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });

    const spawnPos = getSpawnPositionForNewObject(model);
    model.position.copy(spawnPos);

    scene.add(model);
    state.placedObjects.push(model);

    selectMultipleObjects([model]);
    updateExplorer();
    saveState();
}

export function insertPrimitive(type) {
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
    saveState();
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