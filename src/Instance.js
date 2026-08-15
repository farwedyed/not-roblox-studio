import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water as ThreeWater } from 'three/addons/objects/Water.js';

const DB_NAME = "RobloxSandboxDB";
const STORE_NAME = "importedAssets";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function serializeTexture(texture) {
    if (!texture || !texture.image) return null;
    const image = texture.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width || image.videoWidth || 256;
    canvas.height = image.height || image.videoHeight || 256;
    const ctx = canvas.getContext('2d');
    try {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.warn("Failed to serialize texture image:", e);
        return null;
    }
}

function deserializeTexture(dataUrl) {
    if (!dataUrl) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    return tex;
}

function serializeGeometry(geometry) {
    if (!geometry) return null;
    return {
        position: geometry.attributes.position ? Array.from(geometry.attributes.position.array) : null,
        normal: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : null,
        uv: geometry.attributes.uv ? Array.from(geometry.attributes.uv.array) : null,
        index: geometry.index ? Array.from(geometry.index.array) : null
    };
}

function deserializeGeometry(data) {
    if (!data) return null;
    const geometry = new THREE.BufferGeometry();
    if (data.position) {
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
    }
    if (data.normal) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal), 3));
    }
    if (data.uv) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv), 2));
    }
    if (data.index) {
        geometry.setIndex(data.index);
    }
    geometry.computeVertexNormals();
    return geometry;
}

function serializeMaterial(material) {
    if (!material) return null;
    return {
        color: material.color ? material.color.getHex() : 0xffffff,
        roughness: material.roughness !== undefined ? material.roughness : 0.8,
        metalness: material.metalness !== undefined ? material.metalness : 0.0,
        mapDataUrl: material.map ? serializeTexture(material.map) : null
    };
}

function deserializeMaterial(data) {
    if (!data) return null;
    const material = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: data.roughness,
        metalness: data.metalness
    });
    if (data.mapDataUrl) {
        material.map = deserializeTexture(data.mapDataUrl);
    }
    return material;
}

export async function saveAssetToDB(id, geometry, material) {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        
        const geoData = serializeGeometry(geometry);
        const matData = serializeMaterial(material);
        
        store.put({ id, geometry: geoData, material: matData });
    } catch (err) {
        console.error("Failed to save asset to IndexedDB:", err);
    }
}

export async function loadAssetFromDB(id) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => {
                const record = request.result;
                if (record) {
                    const geometry = deserializeGeometry(record.geometry);
                    const material = deserializeMaterial(record.material);
                    resolve({ geometry, material });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error("Failed to load asset from IndexedDB:", err);
        return null;
    }
}

class RbxSignal {
    constructor() {
        this.listeners = [];
    }
    Connect(callback) {
        this.listeners.push(callback);
    }
    Fire(...args) {
        for (const cb of this.listeners) cb(...args);
    }
}

const MaterialLibrary = {
    cache: {},
    get(materialName, colorHex) {
        const cacheKey = `${materialName}_${colorHex}`;
        if (this.cache[cacheKey]) return this.cache[cacheKey];

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, 128, 128);

        if (materialName === 'Wood') {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 3;
            for (let i = 0; i < 128; i += 16) {
                ctx.beginPath();
                ctx.moveTo(i, 0); ctx.lineTo(i + (Math.random() - 0.5) * 8, 128);
                ctx.stroke();
            }
        } else if (materialName === 'Slate') {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            for (let i = 0; i < 300; i++) {
                ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
            }
        } else if (materialName === 'Concrete') {
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            for (let i = 0; i < 400; i++) {
                ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
            }
        } else if (materialName === 'Grass') {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            for (let i = 0; i < 128; i += 4) {
                ctx.fillRect(Math.random() * 128, Math.random() * 128, 4, 8);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        this.cache[cacheKey] = texture;
        return texture;
    }
};

export class Instance {
    constructor(className, name) {
        this.ClassName = className;
        this.Name = name || className;
        this._parent = null;
        this.children = [];
    }

    get Parent() {
        return this._parent;
    }

    set Parent(newParent) {
        if (this._parent === newParent) return;

        if (this._parent) {
            const index = this._parent.children.indexOf(this);
            if (index > -1) this._parent.children.splice(index, 1);
        }

        this._parent = newParent;

        if (newParent) {
            newParent.children.push(this);
        }

        this.onParentChanged(newParent);
        window.dispatchEvent(new CustomEvent('explorer-changed'));
    }

    onParentChanged(newParent) {}

    Destroy() {
        this.Parent = null;
        for (const child of [...this.children]) {
            child.Destroy();
        }
    }
}

function isChildOfWorkspace(parentInstance) {
    if (!parentInstance) return false;
    if (parentInstance.Name === "Workspace") return true;
    return isChildOfWorkspace(parentInstance.Parent);
}

function createWedgeGeometry() {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -0.5, -0.5, -0.5, 
         0.5, -0.5, -0.5, 
         0.5, -0.5,  0.5, 
        -0.5, -0.5,  0.5, 
        -0.5,  0.5, -0.5, 
         0.5,  0.5, -0.5  
    ]);

    const indices = [
        4, 3, 2,  4, 2, 5, 
        0, 1, 5,  0, 5, 4, 
        0, 3, 2,  0, 2, 1, 
        0, 4, 3,           
        1, 2, 5            
    ];

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

export class Part extends Instance {
    constructor(shape = 'Block') {
        super("Part");
        this.Shape = shape; 
        this.Size = new THREE.Vector3(3, 3, 3);
        this.Position = new THREE.Vector3(
            (Math.random() - 0.5) * 30,
            1.5,
            (Math.random() - 0.5) * 30
        );
        this.Color = Math.floor(Math.random() * 16777215);
        this.MaterialType = 'Plastic';
        this.isImportedMesh = false;
        this.importedAssetId = "";

        this.Anchored = true;
        this.CanCollide = true;
        this.Touched = new RbxSignal();
        
        this.customTextureUrl = ""; 
        this.Locked = false; 

        this.recreateGeometry();
    }

    recreateGeometry() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();

        if (this.Shape === 'Sphere') {
            this.geometry = new THREE.SphereGeometry(0.5, 32, 32);
        } else if (this.Shape === 'Cylinder') {
            this.geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        } else if (this.Shape === 'Wedge') {
            this.geometry = createWedgeGeometry();
        } else {
            this.geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        this.updateMaterialSettings();
        
        if (this.mesh) {
            this.mesh.geometry = this.geometry;
            this.mesh.material = this.material;
        } else {
            this.mesh = new THREE.Mesh(this.geometry, this.material);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            this.mesh.userData.instance = this;
        }

        this.updateTransform();
    }

    updateMaterialSettings() {
        if (this.isImportedMesh) return;

        if (this.material) this.material.dispose();

        if (this.MaterialType === 'Neon') {
            this.material = new THREE.MeshStandardMaterial({
                color: this.Color,
                emissive: this.Color,
                emissiveIntensity: 3.5,
                roughness: 0.1
            });
        } else if (this.customTextureUrl) {
            const texLoader = new THREE.TextureLoader();
            const tex = texLoader.load(this.customTextureUrl);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            this.material = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 });
        } else {
            const proceduralTexture = MaterialLibrary.get(this.MaterialType, this.Color);
            this.material = new THREE.MeshStandardMaterial({
                map: proceduralTexture,
                roughness: this.MaterialType === 'Slate' ? 0.95 : 0.5,
                metalness: 0.05
            });
        }

        this.refreshDecals();
    }

    refreshDecals() {
        this.children.forEach(child => {
            if (child.ClassName === "Decal") {
                child.onParentChanged(this);
            }
        });
    }

    updateTransform() {
        this.mesh.position.copy(this.Position);
        this.mesh.scale.copy(this.Size);
        this.updateMaterialSettings();
        if (this.mesh) this.mesh.material = this.material;
        for (const child of this.children) {
            if (child.updateLight) child.updateLight();
            else if (child.updateTransform) child.updateTransform();
        }
    }

    onParentChanged(newParent) {
        if (isChildOfWorkspace(newParent)) {
            window.engine.scene.add(this.mesh);
            window.engine.collidableMeshes.push(this.mesh);
        } else {
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
            const idx = window.engine.collidableMeshes.indexOf(this.mesh);
            if (idx > -1) window.engine.collidableMeshes.splice(idx, 1);
        }
    }

    Destroy() {
        super.Destroy();
        if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        const idx = window.engine.collidableMeshes.indexOf(this.mesh);
        if (idx > -1) window.engine.collidableMeshes.splice(idx, 1);
        this.geometry.dispose();
        this.material.dispose();
    }
}

export class LightBlock extends Part {
    constructor(shape = 'Block') {
        super(shape);
        this.ClassName = "LightBlock";
        this.Name = "Light";
        this.Color = 0x00f0ff;
        this.Brightness = 5.0;
        this.Range = 30;
        this.Size = new THREE.Vector3(2, 2, 2);

        this.pointLight = new THREE.PointLight(this.Color, this.Brightness * 25, this.Range, 1);
        this.pointLight.castShadow = true;
        this.pointLight.shadow.bias = -0.001;

        this.updateTransform();
    }

    updateMaterialSettings() {
        if (this.material) this.material.dispose();

        this.material = new THREE.MeshStandardMaterial({
            color: this.Color,
            emissive: this.Color,
            emissiveIntensity: Math.max(1.0, this.Brightness),
            roughness: 0.1,
            metalness: 0.2
        });

        if (this.pointLight) {
            this.pointLight.color.setHex(this.Color);
            this.pointLight.intensity = this.Brightness * 25;
            this.pointLight.distance = this.Range;
        }

        this.refreshDecals();
    }

    updateTransform() {
        this.mesh.position.copy(this.Position);
        this.mesh.scale.copy(this.Size);
        this.updateMaterialSettings();
        if (this.mesh) this.mesh.material = this.material;

        if (this.pointLight && window.engine && window.engine.scene) {
            if (!this.pointLight.parent) {
                window.engine.scene.add(this.pointLight);
            }
            this.pointLight.position.copy(this.Position);
        }
        for (const child of this.children) {
            if (child.updateLight) child.updateLight();
            else if (child.updateTransform) child.updateTransform();
        }
    }

    onParentChanged(newParent) {
        super.onParentChanged(newParent);
        if (isChildOfWorkspace(newParent)) {
            if (this.pointLight && window.engine && window.engine.scene) {
                if (!this.pointLight.parent) {
                    window.engine.scene.add(this.pointLight);
                }
                this.pointLight.position.copy(this.Position);
            }
        } else {
            if (this.pointLight && this.pointLight.parent) {
                this.pointLight.parent.remove(this.pointLight);
            }
        }
    }

    Destroy() {
        if (this.pointLight) {
            if (this.pointLight.parent) this.pointLight.parent.remove(this.pointLight);
            this.pointLight.dispose();
        }
        super.Destroy();
    }
}

export class Water extends Instance {
    constructor() {
        super("Water", "Water");
        this.Size = new THREE.Vector3(250, 1, 250);
        this.Position = new THREE.Vector3(0, -0.5, 0);
        this.Color = 0x0066aa;
        this.Transparency = 0.25;
        this.WaveSpeed = 0.8;
        this.Anchored = true;
        this.CanCollide = false;
        this.Locked = false;

        this.geometry = new THREE.PlaneGeometry(1, 1, 32, 32);

        const normLoader = new THREE.TextureLoader();
        const waterNormals = normLoader.load('https://threejs.org/examples/textures/waternormals.jpg', (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
        });

        this.waterMesh = new ThreeWater(this.geometry, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: waterNormals,
            sunDirection: new THREE.Vector3(0.5, 1.0, 0.5).normalize(),
            sunColor: 0xffffff,
            waterColor: this.Color,
            distortionScale: 3.7,
            fog: true
        });

        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.userData.instance = this;
        this.mesh = this.waterMesh;

        this.updateTransform();
    }

    updateWaveAnimation(delta) {
        if (this.waterMesh && this.waterMesh.material && this.waterMesh.material.uniforms) {
            this.waterMesh.material.uniforms['time'].value += delta * this.WaveSpeed;
        }
    }

    updateTransform() {
        if (!this.waterMesh) return;
        this.waterMesh.position.copy(this.Position);
        this.waterMesh.scale.set(this.Size.x, this.Size.z, 1);
        if (this.waterMesh.material.uniforms && this.waterMesh.material.uniforms['waterColor']) {
            this.waterMesh.material.uniforms['waterColor'].value.setHex(this.Color);
        }
    }

    onParentChanged(newParent) {
        if (isChildOfWorkspace(newParent)) {
            window.engine.scene.add(this.mesh);
        } else if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }

    Destroy() {
        super.Destroy();
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.geometry.dispose();
        if (this.waterMesh.material) this.waterMesh.material.dispose();
    }
}

export class Terrain extends Instance {
    constructor() {
        super("Terrain", "Terrain");
        this.Size = new THREE.Vector3(250, 20, 250);
        this.Position = new THREE.Vector3(0, -5, 0);
        this.MaterialType = "Grass";
        this.Anchored = true;
        this.CanCollide = true;
        this.Locked = false;

        this.recreateTerrain();
    }

    recreateTerrain() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();

        this.geometry = new THREE.PlaneGeometry(1, 1, 128, 128);

        const loader = new THREE.TextureLoader();

        const grassColor = loader.load('./Textures/terrain/grass_color.jpg');
        const grassNormal = loader.load('./Textures/terrain/grass_normal.jpg');
        const rockColor = loader.load('./Textures/terrain/rock_color.jpg');
        const rockNormal = loader.load('./Textures/terrain/rock_normal.jpg');

        [grassColor, grassNormal, rockColor, rockNormal].forEach(t => {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(16, 16);
        });

        if (this.MaterialType === "Rock") {
            this.material = new THREE.MeshStandardMaterial({
                map: rockColor,
                normalMap: rockNormal,
                roughness: 0.9,
                metalness: 0.05
            });
        } else {
            this.material = new THREE.MeshStandardMaterial({
                map: grassColor,
                normalMap: grassNormal,
                roughness: 0.85,
                metalness: 0.02
            });
        }

        if (this.mesh) {
            this.mesh.geometry = this.geometry;
            this.mesh.material = this.material;
        } else {
            this.mesh = new THREE.Mesh(this.geometry, this.material);
            this.mesh.rotation.x = -Math.PI / 2;
            this.mesh.receiveShadow = true;
            this.mesh.castShadow = true;
            this.mesh.userData.instance = this;
        }

        this.updateTransform();
    }

    sculpt(worldPoint, radius, strength, mode = 'raise') {
        if (!this.mesh || !this.geometry) return;

        const localPoint = this.mesh.worldToLocal(worldPoint.clone());
        const pos = this.geometry.attributes.position;
        let modified = false;

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i);
            const vz = pos.getZ(i);

            const dist = Math.sqrt((vx - localPoint.x) ** 2 + (vy - localPoint.y) ** 2);

            if (dist < radius) {
                const falloff = Math.pow(1 - dist / radius, 2);
                const delta = strength * falloff;

                if (mode === 'raise') {
                    pos.setZ(i, vz + delta);
                } else if (mode === 'lower') {
                    pos.setZ(i, vz - delta);
                } else if (mode === 'smooth') {
                    pos.setZ(i, vz + (0 - vz) * delta * 0.5);
                }
                modified = true;
            }
        }

        if (modified) {
            pos.needsUpdate = true;
            this.geometry.computeVertexNormals();
        }
    }

    updateTransform() {
        this.mesh.position.copy(this.Position);
        this.mesh.scale.set(this.Size.x, this.Size.z, this.Size.y);
    }

    onParentChanged(newParent) {
        if (isChildOfWorkspace(newParent)) {
            window.engine.scene.add(this.mesh);
            window.engine.collidableMeshes.push(this.mesh);
        } else {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            const idx = window.engine.collidableMeshes.indexOf(this.mesh);
            if (idx > -1) window.engine.collidableMeshes.splice(idx, 1);
        }
    }

    Destroy() {
        super.Destroy();
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        const idx = window.engine.collidableMeshes.indexOf(this.mesh);
        if (idx > -1) window.engine.collidableMeshes.splice(idx, 1);
        this.geometry.dispose();
        this.material.dispose();
    }
}

export class MeshPart extends Part {
    constructor() {
        super('Block'); 
        this.ClassName = "MeshPart";
        this.Name = "MeshPart";
        this.AssetId = ""; 
        this.customTextureUrl = ""; 
    }

    recreateGeometry() {
        if (!this.AssetId) {
            super.recreateGeometry();
            return;
        }

        const loader = new GLTFLoader();
        loader.load(this.AssetId, (gltf) => {
            if (this.geometry) this.geometry.dispose();
            if (this.material) this.material.dispose();

            let parsedMesh = null;
            gltf.scene.traverse((child) => {
                if (child.isMesh && !parsedMesh) {
                    parsedMesh = child;
                }
            });

            if (parsedMesh) {
                this.geometry = parsedMesh.geometry.clone();
                this.material = parsedMesh.material.clone();

                if (this.customTextureUrl) {
                    const texLoader = new THREE.TextureLoader();
                    const tex = texLoader.load(this.customTextureUrl);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.flipY = false;
                    this.material = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 });
                } else {
                    this.material.map = null;
                    this.material.color.setHex(0xcccccc); 
                    this.material.needsUpdate = true;
                }

                this.mesh.geometry = this.geometry;
                this.mesh.material = this.material;
                this.updateTransform();
            }
        }, undefined, (err) => {
            console.error("Failed loading custom MeshPart asset:", err);
            super.recreateGeometry(); 
        });
    }
}

export class SpawnLocation extends Part {
    constructor() {
        super('Block');
        this.ClassName = "SpawnLocation";
        this.Name = "SpawnLocation";
        this.Color = 0xffff00; 
        this.Size.set(5, 0.5, 5); 
        this.updateTransform();

        const decal = new Decal();
        decal.Face = 'Top';
        decal.TextureId = 'https://threejs.org/examples/textures/uv_grid_opengl.jpg';
        decal.Parent = this;
    }
}

export class Decal extends Instance {
    constructor() {
        super("Decal");
        this.TextureId = "";
        this.Face = "Front";
        this.decalMesh = null;
    }

    onParentChanged(newParent) {
        if (this.decalMesh && this.decalMesh.parent) {
            this.decalMesh.parent.remove(this.decalMesh);
        }
        if (newParent && newParent.mesh) {
            const geom = new THREE.PlaneGeometry(1, 1);
            const loader = new THREE.TextureLoader();
            const mat = new THREE.MeshBasicMaterial({
                map: loader.load(this.TextureId),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            this.decalMesh = new THREE.Mesh(geom, mat);
            
            const offset = 0.505;
            if (this.Face === "Top") {
                this.decalMesh.position.set(0, offset, 0);
                this.decalMesh.rotation.x = -Math.PI / 2;
            } else if (this.Face === "Bottom") {
                this.decalMesh.position.set(0, -offset, 0);
                this.decalMesh.rotation.x = Math.PI / 2;
            } else if (this.Face === "Left") {
                this.decalMesh.position.set(-offset, 0, 0);
                this.decalMesh.rotation.y = -Math.PI / 2;
            } else if (this.Face === "Right") {
                this.decalMesh.position.set(offset, 0, 0);
                this.decalMesh.rotation.y = Math.PI / 2;
            } else if (this.Face === "Back") {
                this.decalMesh.position.set(0, 0, -offset);
                this.decalMesh.rotation.y = Math.PI;
            } else {
                this.decalMesh.position.set(0, 0, offset);
            }

            newParent.mesh.add(this.decalMesh);
        }
    }

    Destroy() {
        if (this.decalMesh && this.decalMesh.parent) {
            this.decalMesh.parent.remove(this.decalMesh);
        }
        super.Destroy();
    }
}

export class Sound extends Instance {
    constructor() {
        super("Sound");
        this.SoundId = "";
        this.Volume = 0.5;
        this.Looped = false;
        this.soundEmitter = null;
    }

    onParentChanged(newParent) {
        if (this.soundEmitter && this.soundEmitter.parent) {
            this.soundEmitter.parent.remove(this.soundEmitter);
        }
        if (newParent && newParent.mesh && window.engine && window.engine.audioListener) {
            this.soundEmitter = new THREE.PositionalAudio(window.engine.audioListener);
            this.soundEmitter.setRefDistance(10);
            this.soundEmitter.setVolume(this.Volume);
            this.soundEmitter.setLoop(this.Looped);

            const audioLoader = new THREE.AudioLoader();
            if (this.SoundId) {
                audioLoader.load(this.SoundId, (buffer) => {
                    this.soundEmitter.setBuffer(buffer);
                    this.soundEmitter.play();
                });
            }
            newParent.mesh.add(this.soundEmitter);
        }
    }

    Destroy() {
        if (this.soundEmitter) {
            if (this.soundEmitter.isPlaying) this.soundEmitter.stop();
            if (this.soundEmitter.parent) this.soundEmitter.parent.remove(this.soundEmitter);
        }
        super.Destroy();
    }
}

export class Script extends Instance {
    constructor() {
        super("Script");
        this.Source = `// Server Script Context\nconst part = script.Parent;\nwhile (true) {\n    part.Color = 0xff0000;\n    await wait(1000);\n    part.Color = 0x00ff00;\n    await wait(1000);\n}`;
    }
}

export class LocalScript extends Instance {
    constructor() {
        super("LocalScript");
        this.Source = `// Local Client Script Context\nprint("Client Script executing inside StarterGui context!");`;
    }
}

export class Model extends Instance {
    constructor() {
        super("Model");
    }
}

export class PointLight extends Instance {
    constructor() {
        super("PointLight");
        this.Color = 0xffffff;
        this.Intensity = 5.0;
        this.Range = 15;
        this.Shadows = true;

        this.light = new THREE.PointLight(this.Color, this.Intensity * 15, this.Range, 1);
        this.light.castShadow = true;
    }

    updateLight() {
        if (!this.light) return;
        this.light.color.setHex(this.Color);
        this.light.intensity = this.Intensity * 15;
        this.light.distance = this.Range;
        this.light.castShadow = this.Shadows;
        if (this.Parent && this.Parent.mesh && window.engine && window.engine.scene) {
            const worldPos = new THREE.Vector3();
            this.Parent.mesh.getWorldPosition(worldPos);
            this.light.position.copy(worldPos);
            if (!this.light.parent) {
                window.engine.scene.add(this.light);
            }
        }
    }

    onParentChanged(newParent) {
        if (newParent && newParent.mesh && window.engine && window.engine.scene) {
            if (!this.light.parent) {
                window.engine.scene.add(this.light);
            }
            this.updateLight();
        } else {
            if (this.light.parent) this.light.parent.remove(this.light);
        }
    }

    Destroy() {
        super.Destroy();
        if (this.light.parent) this.light.parent.remove(this.light);
        this.light.dispose();
    }
}

export class SpotLight extends Instance {
    constructor() {
        super("SpotLight");
        this.Color = 0xffffff;
        this.Intensity = 10.0;
        this.Range = 25;
        this.Angle = 45; 
        this.Shadows = true;

        this.light = new THREE.SpotLight(this.Color, this.Intensity * 15, this.Range, THREE.MathUtils.degToRad(this.Angle), 0.5, 1);
        this.light.castShadow = true;
    }

    updateLight() {
        if (!this.light) return;
        this.light.color.setHex(this.Color);
        this.light.intensity = this.Intensity * 15;
        this.light.distance = this.Range;
        this.light.angle = THREE.MathUtils.degToRad(this.Angle);
        this.light.castShadow = this.Shadows;
        if (this.Parent && this.Parent.mesh && window.engine && window.engine.scene) {
            const worldPos = new THREE.Vector3();
            this.Parent.mesh.getWorldPosition(worldPos);
            this.light.position.copy(worldPos);
            this.light.target.position.copy(worldPos).add(new THREE.Vector3(0, -5, 0));
            if (!this.light.parent) {
                window.engine.scene.add(this.light);
                window.engine.scene.add(this.light.target);
            }
        }
    }

    onParentChanged(newParent) {
        if (newParent && newParent.mesh && window.engine && window.engine.scene) {
            if (!this.light.parent) {
                window.engine.scene.add(this.light);
                window.engine.scene.add(this.light.target);
            }
            this.updateLight();
        } else {
            if (this.light.parent) this.light.parent.remove(this.light);
            if (this.light.target && this.light.target.parent) this.light.target.parent.remove(this.light.target);
        }
    }

    Destroy() {
        super.Destroy();
        if (this.light.parent) this.light.parent.remove(this.light);
        if (this.light.target && this.light.target.parent) this.light.target.parent.remove(this.light.target);
        this.light.dispose();
    }
}

export class Lighting extends Instance {
    constructor() {
        super("Lighting", "Lighting");
        this.ClockTime = 12.0; 
        this.Brightness = 1.0;
        this.BloomStrength = 0.85; 
        this.MotionBlur = 1.0;     
        this.Exposure = 1.0;       
        this.Rayleigh = 1.0;       
        this.Turbidity = 1.0;      
        this.Ambient = 0x666666;
    }
    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('lighting-changed'));
    }
}

export class StarterPlayer extends Instance {
    constructor() {
        super("StarterPlayer", "StarterPlayer");
        this.CharacterWalkSpeed = 16.0;  
        this.CharacterJumpPower = 15.0; 
    }
}

export class BillboardGui extends Instance {
    constructor() {
        super("BillboardGui");
        this.Size = new THREE.Vector2(150, 100);    
        this.StudsOffset = new THREE.Vector3(0, 2, 0); 
    }
    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('gui-changed'));
    }
}

export class SurfaceGui extends Instance {
    constructor() {
        super("SurfaceGui");
        this.Face = "Front"; 
    }
    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('gui-changed'));
    }
}

export class ScreenGui extends Instance {
    constructor() {
        super("ScreenGui");
    }
    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('gui-changed'));
    }
}

export class Frame extends Instance {
    constructor() {
        super("Frame");
        this.Position = new THREE.Vector2(10, 10); 
        this.Size = new THREE.Vector2(150, 100);    
        this.BackgroundColor = 0x3a3a3a;
        this.BorderSizePixel = 1; 
        this.BorderColor = 0x000000; 
        this.Visible = true;
        this.BackgroundTransparency = 0; 
    }
    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('gui-changed'));
    }
}

export class TextLabel extends Frame {
    constructor() {
        super();
        this.ClassName = "TextLabel";
        this.Name = "TextLabel";
        this.Text = "Label Text";
        this.TextColor = 0xffffff;
        this.TextSize = 14;
        this.TextWrapped = false;
        this.TextXAlignment = "Center"; 
        this.TextYAlignment = "Center"; 
    }
}

export class TextButton extends Frame {
    constructor() {
        super();
        this.ClassName = "TextButton";
        this.Name = "TextButton";
        this.Text = "Button Text";
        this.TextColor = 0xffffff;
        this.TextSize = 14;
        this.TextWrapped = false;
        this.TextXAlignment = "Center";
        this.TextYAlignment = "Center";
    }
}

/* --- ROBLOX PLAYTESTING INSTANCES --- */
export class Humanoid extends Instance {
    constructor() {
        super("Humanoid", "Humanoid");
        this.Health = 100;
        this.MaxHealth = 100;
        this.WalkSpeed = 16.0;
        this.JumpPower = 15.0; // Default JumpPower set to 15
        this.HipHeight = 3.3; // Default HipHeight set to 3.3
        this.DisplayName = "Player1";
    }

    onParentChanged(newParent) {
        window.dispatchEvent(new CustomEvent('humanoid-changed', { detail: this }));
    }
}

export class Players extends Instance {
    constructor() {
        super("Players", "Players");
    }
}

export class Player extends Instance {
    constructor(name = "Player1") {
        super("Player", name);
        this.UserId = 1;
        this.DisplayName = name;
    }
}

export class Backpack extends Instance {
    constructor() {
        super("Backpack", "Backpack");
    }
}

export class PlayerGui extends Instance {
    constructor() {
        super("PlayerGui", "PlayerGui");
    }
}

export class PlayerScripts extends Instance {
    constructor() {
        super("PlayerScripts", "PlayerScripts");
    }
}

export class Tool extends Instance {
    constructor(name = "Classic Tool") {
        super("Tool", name);
        this.ToolTip = "Roblox Tool";
        this.Grip = new THREE.Vector3(0, 0, 0);
    }
}