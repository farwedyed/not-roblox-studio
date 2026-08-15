import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

// Custom Vibrant Roblox Studio Sky Shader with Clouds
const RobloxSkyShader = {
    uniforms: {
        uSunPosition: { value: new THREE.Vector3(0, 1, 0) },
        uTopColor: { value: new THREE.Color(0x0077ff) },
        uMidColor: { value: new THREE.Color(0x40a0ff) },
        uHorizonColor: { value: new THREE.Color(0xa3dbff) },
        uGroundColor: { value: new THREE.Color(0x759ac0) },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uSunSize: { value: 0.02 },
        uDayFactor: { value: 1.0 }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
    `,
    fragmentShader: `
        varying vec3 vWorldPosition;

        uniform vec3 uSunPosition;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform float uSunSize;
        uniform float uDayFactor;

        // Procedural noise for soft Roblox sky clouds
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec3 viewDir = normalize(vWorldPosition);
            vec3 sunDir = normalize(uSunPosition);
            float h = viewDir.y;

            vec3 skyColor;

            if (h > -0.05) {
                // Vibrant upper sky gradient
                float tMid = smoothstep(-0.05, 0.3, h);
                float tTop = smoothstep(0.3, 0.9, h);

                vec3 lowerSky = mix(uHorizonColor, uMidColor, tMid);
                skyColor = mix(lowerSky, uTopColor, tTop);

                // Add soft procedural clouds in daylight
                if (uDayFactor > 0.2 && h > 0.05) {
                    vec2 cloudUV = viewDir.xz / (viewDir.y + 0.3) * 1.8;
                    float n = fbm(cloudUV);
                    float cloudDensity = smoothstep(0.48, 0.75, n) * smoothstep(0.05, 0.4, h) * uDayFactor;
                    vec3 cloudColor = vec3(1.0, 1.0, 1.0);
                    skyColor = mix(skyColor, cloudColor, cloudDensity * 0.65);
                }
            } else {
                // Smooth ground atmosphere transition
                float tGround = smoothstep(-0.05, -0.5, h);
                skyColor = mix(uHorizonColor, uGroundColor, tGround);
            }

            // Sun Disc & Bright Sun Halo
            float cosTheta = dot(viewDir, sunDir);
            if (sunDir.y > -0.1) {
                float sunAngle = acos(clamp(cosTheta, -1.0, 1.0));
                float sunDisc = smoothstep(uSunSize, uSunSize * 0.6, sunAngle);
                float sunGlow = pow(max(0.0, cosTheta), 16.0) * 0.4 * uDayFactor;

                skyColor += uSunColor * (sunDisc * 3.0 + sunGlow);
            }

            gl_FragColor = vec4(skyColor, 1.0);
        }
    `
};

export class EnvironmentService {
    constructor() {
        this.scene = null;
        this.renderer = null;
        this.sunLight = null;
        this.hemiLight = null;
        this.ambientLight = null;
        this.sky = null;
        this.skyBake = null;
        this.skyScene = null;
        this.pmremGenerator = null;
        this.currentEnvRenderTarget = null;
        this.starField = null;
        this.starMat = null;
    }

    init(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;

        this.scene.background = null;
        this.scene.fog = null;

        // Ambient Fill Light (Provides daylight warmth and moonlight clarity at night)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.50);
        this.scene.add(this.ambientLight);

        // Bright Hemisphere Fill Light
        this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x64748b, 0.65);
        this.scene.add(this.hemiLight);

        // Directional Sun/Moon Light
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.30);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 800;
        
        const shadowExtent = 120;
        this.sunLight.shadow.camera.left = -shadowExtent;
        this.sunLight.shadow.camera.right = shadowExtent;
        this.sunLight.shadow.camera.top = shadowExtent;
        this.sunLight.shadow.camera.bottom = -shadowExtent;
        this.sunLight.shadow.bias = -0.0001;

        this.sunLight.target.position.set(0, 0, 0);
        this.scene.add(this.sunLight.target);
        this.scene.add(this.sunLight);

        // PMREM Generator for dynamic PBR sky reflections
        if (this.renderer) {
            this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            this.pmremGenerator.compileCubemapShader();
        }

        // Dedicated Sky Scene for offscreen reflection baking
        this.skyScene = new THREE.Scene();

        const skyGeo = new THREE.SphereGeometry(1200, 32, 32);

        // Material for Sky Bake
        const skyBakeMat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(RobloxSkyShader.uniforms),
            vertexShader: RobloxSkyShader.vertexShader,
            fragmentShader: RobloxSkyShader.fragmentShader,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.skyBake = new THREE.Mesh(skyGeo, skyBakeMat);
        this.skyScene.add(this.skyBake);

        // Visible Sky Dome
        const skyMat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(RobloxSkyShader.uniforms),
            vertexShader: RobloxSkyShader.vertexShader,
            fragmentShader: RobloxSkyShader.fragmentShader,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);

        // Sun Lensflare Elements
        const lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(this.createFlareTexture('sun'), 120, 0, new THREE.Color(0xfff5ea)));
        lensflare.addElement(new LensflareElement(this.createFlareTexture('ring'), 120, 0.4, new THREE.Color(0x88ccff)));
        lensflare.addElement(new LensflareElement(this.createFlareTexture('burst'), 50, 0.7, new THREE.Color(0xffaa44)));
        this.sunLight.add(lensflare);

        // Night Starfield Dome
        const starCount = 1200;
        const starGeo = new THREE.BufferGeometry();
        const starPositions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 700;

            starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
            starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }

        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        this.starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.2,
            transparent: true,
            opacity: 0.0,
            sizeAttenuation: false,
            blending: THREE.AdditiveBlending
        });
        this.starField = new THREE.Points(starGeo, this.starMat);
        this.scene.add(this.starField);
    }

    createFlareTexture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const center = 128;

        if (type === 'sun') {
            const grad = ctx.createRadialGradient(center, center, 0, center, center, 128);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            grad.addColorStop(0.2, 'rgba(255, 220, 160, 0.4)');
            grad.addColorStop(0.6, 'rgba(255, 140, 50, 0.1)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
        } else if (type === 'ring') {
            const grad = ctx.createRadialGradient(center, center, 80, center, center, 110);
            grad.addColorStop(0, 'rgba(0, 180, 255, 0)');
            grad.addColorStop(0.5, 'rgba(120, 220, 255, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
        } else if (type === 'burst') {
            const grad = ctx.createRadialGradient(center, center, 0, center, center, 100);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            grad.addColorStop(0.4, 'rgba(255, 200, 100, 0.1)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
        }

        return new THREE.CanvasTexture(canvas);
    }

    updateLighting() {
        const lighting = window.game?.children.find(c => c.ClassName === "Lighting");
        if (!lighting || !this.sky) return;

        const clockTime = lighting.ClockTime !== undefined ? lighting.ClockTime : 12.0;
        const brightness = lighting.Brightness !== undefined ? lighting.Brightness : 1.0;

        // Calculate Sun Trajectory with forward Z-offset
        const hours = clockTime;
        const phi = ((hours - 6) / 24) * Math.PI * 2;
        const sunX = Math.cos(phi) * 300 + 100;
        const sunY = Math.sin(phi) * 400;
        const sunZ = Math.sin(phi * 0.5) * 200 + 150;

        const sunPosition = new THREE.Vector3(sunX, sunY, sunZ);

        // Day vs Sunset vs Night factors
        const dayFactor = Math.max(0, Math.min(1, (sunY + 20) / 80));
        const nightFactor = 1.0 - dayFactor;

        // Vibrant Sky Color Schemes
        const topDay = new THREE.Color(0x0077ff);
        const midDay = new THREE.Color(0x40a0ff);
        const horizDay = new THREE.Color(0xa3dbff);
        const groundDay = new THREE.Color(0x759ac0);

        const topSunset = new THREE.Color(0x1a1233);
        const midSunset = new THREE.Color(0x9c2d19);
        const horizSunset = new THREE.Color(0xeb6a20);
        const groundSunset = new THREE.Color(0x28121a);

        // Roblox Studio Visible Midnight Sky (Rich Navy Blue, NOT pitch black)
        const topNight = new THREE.Color(0x0c1836);
        const midNight = new THREE.Color(0x18284c);
        const horizNight = new THREE.Color(0x243866);
        const groundNight = new THREE.Color(0x121c33);

        let activeTop = new THREE.Color();
        let activeMid = new THREE.Color();
        let activeHoriz = new THREE.Color();
        let activeGround = new THREE.Color();

        if (sunY > 20) {
            activeTop.copy(topDay);
            activeMid.copy(midDay);
            activeHoriz.copy(horizDay);
            activeGround.copy(groundDay);
        } else if (sunY > -20) {
            const t = (sunY + 20) / 40;
            activeTop.lerpColors(topSunset, topDay, t);
            activeMid.lerpColors(midSunset, midDay, t);
            activeHoriz.lerpColors(horizSunset, horizDay, t);
            activeGround.lerpColors(groundSunset, groundDay, t);
        } else {
            const t = Math.min(1, (-sunY - 20) / 30);
            activeTop.lerpColors(topSunset, topNight, t);
            activeMid.lerpColors(midSunset, midNight, t);
            activeHoriz.lerpColors(horizSunset, horizNight, t);
            activeGround.lerpColors(groundSunset, groundNight, t);
        }

        // Apply Uniforms to Sky Mesh
        const skyUnis = this.sky.material.uniforms;
        skyUnis.uSunPosition.value.copy(sunPosition);
        skyUnis.uTopColor.value.copy(activeTop);
        skyUnis.uMidColor.value.copy(activeMid);
        skyUnis.uHorizonColor.value.copy(activeHoriz);
        skyUnis.uGroundColor.value.copy(activeGround);
        skyUnis.uDayFactor.value = dayFactor;

        // Apply Uniforms to Sky Bake Mesh
        if (this.skyBake) {
            const bakeUnis = this.skyBake.material.uniforms;
            bakeUnis.uSunPosition.value.copy(sunPosition);
            bakeUnis.uTopColor.value.copy(activeTop);
            bakeUnis.uMidColor.value.copy(activeMid);
            bakeUnis.uHorizonColor.value.copy(activeHoriz);
            bakeUnis.uGroundColor.value.copy(activeGround);
            bakeUnis.uDayFactor.value = dayFactor;
        }

        // Directional Light: Sun by Day, Silvery Moon by Night
        if (this.sunLight) {
            if (sunY >= -20) {
                this.sunLight.position.copy(sunPosition);
                this.sunLight.color.setHex(0xffffff);
                this.sunLight.intensity = dayFactor * 1.30 * brightness;
            } else {
                const moonPos = sunPosition.clone().negate();
                this.sunLight.position.copy(moonPos);
                this.sunLight.color.setHex(0xb0d0ff); // Cool silvery moonlight
                this.sunLight.intensity = nightFactor * 0.40 * brightness; // Soft moonlight
            }
        }

        // Hemisphere Fill Light
        if (this.hemiLight) {
            const dayHemiSky = new THREE.Color(0xdbeafe);
            const dayHemiGnd = new THREE.Color(0x64748b);
            
            const nightHemiSky = new THREE.Color(0x3d527c);
            const nightHemiGnd = new THREE.Color(0x24324a);

            const currentSkyHemi = new THREE.Color().lerpColors(nightHemiSky, dayHemiSky, dayFactor);
            const currentGndHemi = new THREE.Color().lerpColors(nightHemiGnd, dayHemiGnd, dayFactor);

            this.hemiLight.color.copy(currentSkyHemi);
            this.hemiLight.groundColor.copy(currentGndHemi);
            this.hemiLight.intensity = THREE.MathUtils.lerp(0.45, 0.65, dayFactor) * brightness;
        }

        // Ambient Fill Light (Ensures character & ground are ALWAYS clearly visible at night)
        if (this.ambientLight) {
            const dayAmbient = new THREE.Color(0xffffff);
            const nightAmbient = new THREE.Color(0x6b8bb8); // Soft moonlight fill

            const currentAmbient = new THREE.Color().lerpColors(nightAmbient, dayAmbient, dayFactor);
            this.ambientLight.color.copy(currentAmbient);
            this.ambientLight.intensity = THREE.MathUtils.lerp(0.42, 0.50, dayFactor) * brightness;
        }

        // Fade in Night Starfield
        if (this.starMat) {
            const starOpacity = Math.max(0, Math.min(1, (-sunY + 10) / 50));
            this.starMat.opacity = starOpacity;
        }

        // Calibrated Tone Mapping Exposure (Keeps night bright & visible)
        if (this.renderer) {
            const exposureSetting = lighting.Exposure !== undefined ? lighting.Exposure : 1.0;
            this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.42, 0.45, dayFactor) * exposureSetting;
        }

        // Bake dynamic Image-Based Lighting (IBL) reflections
        if (this.pmremGenerator && this.skyScene) {
            if (this.currentEnvRenderTarget) {
                this.currentEnvRenderTarget.dispose();
            }
            this.currentEnvRenderTarget = this.pmremGenerator.fromScene(this.skyScene);
            this.scene.environment = this.currentEnvRenderTarget.texture;
        }

        // Sync Post-Processing Effects
        if (window.engine && window.engine.rendererService) {
            const bloomStrength = lighting.BloomStrength !== undefined ? lighting.BloomStrength : 0.15;
            const motionBlurIntensity = lighting.MotionBlur !== undefined ? lighting.MotionBlur : 1.0;
            window.engine.rendererService.updatePostProcessing(bloomStrength, motionBlurIntensity);
        }
    }
}