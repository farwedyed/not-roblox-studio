import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Camera Velocity Motion Blur Shader ---
const CameraVelocityBlurShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "uVelocity": { value: new THREE.Vector2(0, 0) },
        "uIntensity": { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uVelocity;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
            vec2 vel = uVelocity * uIntensity;
            vel = clamp(vel, vec2(-0.03), vec2(0.03));

            vec4 color = texture2D(tDiffuse, vUv);
            if (length(vel) < 0.0001) {
                gl_FragColor = color;
                return;
            }

            for (int i = 1; i < 7; i++) {
                vec2 offset = vel * (float(i) / 6.0 - 0.5);
                color += texture2D(tDiffuse, vUv + offset);
            }
            gl_FragColor = color / 7.0;
        }
    `
};

export class RendererService {
    constructor() {
        this.scene = new THREE.Scene();
        this.overlayScene = new THREE.Scene(); // Dedicated Overlay Scene for Gizmos (Renders AFTER Bloom)
        this.clock = new THREE.Clock();

        const viewportWidth = window.innerWidth - 310;
        const viewportHeight = window.innerHeight - 270;

        // Camera Setup
        this.camera = new THREE.PerspectiveCamera(60, viewportWidth / viewportHeight, 0.1, 2000);
        this.camera.position.set(0, 10, 15);

        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        // WebGL Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(viewportWidth, viewportHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.45;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '1';

        const container = document.getElementById('canvas-container');
        if (container) container.appendChild(this.renderer.domElement);

        // CSS2D Renderer for 2D UI / BillboardGui Overlays
        this.cssRenderer = new CSS2DRenderer();
        this.cssRenderer.setSize(viewportWidth, viewportHeight);
        this.cssRenderer.domElement.style.position = 'absolute';
        this.cssRenderer.domElement.style.top = '0';
        this.cssRenderer.domElement.style.left = '0';
        this.cssRenderer.domElement.style.pointerEvents = 'none';
        this.cssRenderer.domElement.style.zIndex = '2';
        if (container) container.appendChild(this.cssRenderer.domElement);

        // --- Post-Processing Composer Pipeline ---
        this.composer = new EffectComposer(this.renderer);
        
        // 1. Render Pass
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // 2. GTAO Pass
        this.gtaoPass = new GTAOPass(this.scene, this.camera, viewportWidth, viewportHeight);
        this.gtaoPass.output = GTAOPass.OUTPUT.Default;
        this.gtaoPass.blendIntensity = 0.35;
        this.composer.addPass(this.gtaoPass);

        // 3. Unreal Bloom Pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(viewportWidth, viewportHeight),
            0.15, // Strength
            0.40, // Radius
            2.0   // Threshold
        );
        this.composer.addPass(this.bloomPass);

        // 4. Motion Blur Pass
        this.motionBlurPass = new ShaderPass(CameraVelocityBlurShader);
        this.composer.addPass(this.motionBlurPass);

        // 5. Output Pass
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        // Camera Velocity Tracking Variables
        this.prevCamPos = this.camera.position.clone();
        this.prevYaw = 0;
        this.prevPitch = 0;

        window.addEventListener('resize', () => this.onWindowResize());
    }

    updatePostProcessing(bloomStrength, motionBlurIntensity) {
        if (this.bloomPass) {
            this.bloomPass.strength = Math.min(1.2, bloomStrength);
        }
        if (this.motionBlurPass && this.motionBlurPass.uniforms.uIntensity) {
            this.motionBlurPass.uniforms.uIntensity.value = motionBlurIntensity;
        }
    }

    renderPassPipeline(yaw = 0, pitch = 0) {
        // Calculate Camera Velocity for Motion Blur
        const currentCamPos = this.camera.position.clone();
        const posDelta = new THREE.Vector3().subVectors(currentCamPos, this.prevCamPos);
        posDelta.applyQuaternion(this.camera.quaternion.clone().invert());

        const yawDelta = yaw - this.prevYaw;
        const pitchDelta = pitch - this.prevPitch;

        const velX = -yawDelta * 0.5 - posDelta.x * 0.01;
        const velY = pitchDelta * 0.5 - posDelta.y * 0.01;

        if (this.motionBlurPass && this.motionBlurPass.uniforms.uVelocity) {
            this.motionBlurPass.uniforms.uVelocity.value.set(velX, velY);
        }

        this.prevCamPos.copy(currentCamPos);
        this.prevYaw = yaw;
        this.prevPitch = pitch;

        // 1. Render 3D Scene + Post Processing
        this.composer.render();

        // 2. Render Overlay Pass (Transform Gizmos) AFTER Bloom so handles are NEVER washed out!
        if (this.overlayScene) {
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            this.renderer.render(this.overlayScene, this.camera);
        }

        // 3. Render 2D CSS Overlays
        this.cssRenderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.camera || !this.renderer || !this.cssRenderer) return;
        
        const width = Math.max(100, window.innerWidth - 310);
        const height = Math.max(100, window.innerHeight - 270);

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.cssRenderer.setSize(width, height);

        if (this.composer) {
            this.composer.setSize(width, height);
        }
        if (this.bloomPass) {
            this.bloomPass.resolution.set(width, height);
        }
    }
}