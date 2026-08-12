import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { state } from './state.js';
import { createRobloxSkyTexture, createFlareTexture, generateProceduralMaterials, materialTextureLibrary } from './materials.js';
import { updatePropertiesUIValues } from './ui.js';
import { multiPivotGroup } from './selection.js';
import { updateCamera } from './controls.js'; // Added import for updateCamera!

export let scene, camera, renderer, transformControls, selectionBox;
export let dirLight, hemiLight;

export function initScene() {
    generateProceduralMaterials();

    const canvasContainer = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    
    state.robloxSkyTexture = createRobloxSkyTexture();
    scene.background = state.robloxSkyTexture;
    scene.environment = state.robloxSkyTexture;

    scene.fog = new THREE.FogExp2(0x80bfff, 0.003);

    camera = new THREE.PerspectiveCamera(60, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 15, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    canvasContainer.appendChild(renderer.domElement);

    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.1);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xfff5ea, 1.8);
    dirLight.position.set(30, 60, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    if (Lensflare) {
        const lensflare = new Lensflare();
        const texSun = createFlareTexture(512, 'rgba(255, 245, 220, 1.0)', 'rgba(255, 180, 80, 0.4)');
        const texRing1 = createFlareTexture(256, 'rgba(100, 200, 255, 0.5)', 'rgba(50, 100, 255, 0.1)');
        const texRing2 = createFlareTexture(128, 'rgba(255, 120, 200, 0.4)', 'rgba(200, 50, 100, 0.1)');

        lensflare.addElement(new LensflareElement(texSun, 400, 0));
        lensflare.addElement(new LensflareElement(texRing1, 60, 0.5));
        lensflare.addElement(new LensflareElement(texRing2, 100, 0.8));
        lensflare.addElement(new LensflareElement(texRing1, 140, 1.0));

        dirLight.add(lensflare);
    }

    updateLighting();

    // Baseplate
    const baseplateGeo = new THREE.BoxGeometry(100, 1, 100);
    const studsTex = materialTextureLibrary["Studs"] ? materialTextureLibrary["Studs"].clone() : null;
    if (studsTex) studsTex.repeat.set(25, 25);

    const baseplateMat = new THREE.MeshStandardMaterial({ 
        color: 0x44484d, 
        map: studsTex,
        roughness: 0.35, 
        metalness: 0.1 
    });

    const baseplate = new THREE.Mesh(baseplateGeo, baseplateMat);
    baseplate.position.y = -0.5;
    baseplate.name = "Baseplate";
    baseplate.receiveShadow = true;
    baseplate.userData = { locked: true, anchored: true, canCollide: true, materialName: "Studs" };
    scene.add(baseplate);
    state.placedObjects.push(baseplate);

    const gridHelper = new THREE.GridHelper(100, 100, 0x00a2ff, 0x444444);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    selectionBox = new THREE.BoxHelper(baseplate, 0x00a2ff);
    selectionBox.visible = false;
    scene.add(selectionBox);

    transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
}

export function updateLighting() {
    if (!dirLight || !hemiLight) return;

    const time = state.lightingSettings.clockTime;
    const angle = ((time - 6) / 24) * Math.PI * 2;

    const sunX = Math.cos(angle) * 80;
    const sunY = Math.sin(angle) * 80;
    const sunZ = 30;

    dirLight.position.set(sunX, sunY, sunZ);
    dirLight.castShadow = state.lightingSettings.shadows;

    if (time >= 6 && time <= 18) {
        const isSunset = (time < 8 || time > 16);
        if (isSunset) {
            dirLight.color.setHex(0xffaa55);
            hemiLight.color.setHex(0xffaa77);
            const sunsetSky = new THREE.Color(0x3a221a);
            if (!scene.background || !(scene.background instanceof THREE.Texture)) scene.background = sunsetSky;
            if (scene.fog) scene.fog.color = sunsetSky;
        } else {
            dirLight.color.setHex(0xfff5ea);
            hemiLight.color.setHex(0xffffff);
            if (!scene.background || !(scene.background instanceof THREE.Texture)) scene.background = state.robloxSkyTexture;
            if (scene.fog) scene.fog.color = new THREE.Color(0x80bfff);
        }
        dirLight.intensity = state.lightingSettings.brightness;
        hemiLight.intensity = state.lightingSettings.ambient;
    } else {
        dirLight.color.setHex(0x5577bb);
        dirLight.intensity = state.lightingSettings.brightness * 0.3;
        hemiLight.color.setHex(0x223355);
        hemiLight.intensity = state.lightingSettings.ambient * 0.2;
        const nightSky = new THREE.Color(0x050811);
        if (!scene.background || !(scene.background instanceof THREE.Texture)) scene.background = nightSky;
        if (scene.fog) scene.fog.color = nightSky;
    }
}

export function onWindowResize() {
    const canvasContainer = document.getElementById('canvas-container');
    if (!camera || !renderer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

export function animate() {
    requestAnimationFrame(animate);

    // Call updateCamera() every frame tick!
    updateCamera();

    if (selectionBox && selectionBox.visible && (state.selectedObject || multiPivotGroup)) {
        selectionBox.update();
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}