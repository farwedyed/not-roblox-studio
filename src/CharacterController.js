/* --- START OF FILE CharacterController.js (REVISED) --- */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class CharacterController {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        this.characterGroup = null;
        this.characterMesh = null;
        this.mixer = null;
        this.actions = {};
        this.activeActionName = 'idle';

        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this.isDead = false; 
        this.keys = null; 
    }

    findSpawnLocation(root) {
        if (root.ClassName === "SpawnLocation") return root;
        for (const child of root.children) {
            const found = this.findSpawnLocation(child);
            if (found) return found;
        }
        return null;
    }

    // Constructs an offline-friendly, assets-free blocky avatar if the GLTF files fail to load
    createFallbackRig() {
        this.characterMesh = new THREE.Group();
        
        // Head
        const headGeom = new THREE.SphereGeometry(0.35, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.8 });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 1.45;
        head.castShadow = true;
        this.characterMesh.add(head);

        // Torso
        const torsoGeom = new THREE.BoxGeometry(0.7, 0.8, 0.35);
        const torsoMat = new THREE.MeshStandardMaterial({ color: 0x007acc, roughness: 0.6 });
        const torso = new THREE.Mesh(torsoGeom, torsoMat);
        torso.position.y = 0.85;
        torso.castShadow = true;
        this.characterMesh.add(torso);

        // Left Leg
        const legGeom = new THREE.BoxGeometry(0.28, 0.5, 0.28);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1b2a35, roughness: 0.8 });
        const leftLeg = new THREE.Mesh(legGeom, legMat);
        leftLeg.position.set(-0.18, 0.25, 0);
        leftLeg.castShadow = true;
        this.characterMesh.add(leftLeg);

        // Right Leg
        const rightLeg = new THREE.Mesh(legGeom, legMat);
        rightLeg.position.set(0.18, 0.25, 0);
        rightLeg.castShadow = true;
        this.characterMesh.add(rightLeg);

        this.characterGroup = new THREE.Group();
        this.characterGroup.position.set(0, 0, 0);

        const spawn = this.findSpawnLocation(window.game);
        if (spawn) {
            this.characterGroup.position.copy(spawn.Position).y += (spawn.Size.y / 2 + 0.1);
        } else {
            this.characterGroup.position.set(0, 0.5, 0);
        }

        this.scene.add(this.characterGroup);
        this.characterGroup.add(this.characterMesh);

        this.mixer = null; 
        this.actions = {};
        this.isGrounded = true;
        this.isDead = false;
    }

    load(onComplete) {
        const modelPath = './Characters/Ranger.glb';
        const texturePath = './Characters/ranger_texture.png';
        const movementAnimPath = './Animations/Rig_Medium_MovementBasic.glb';
        const generalAnimPath = './Animations/Rig_Medium_General.glb';

        const skinTexture = this.textureLoader.load(texturePath, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
        }, undefined, () => {
            console.warn("Ranger skin texture could not load. Proceeding with flat mesh colors.");
        });

        const loadGLB = (url) => new Promise((res, rej) => this.loader.load(url, res, undefined, rej));

        Promise.all([
            loadGLB(modelPath),
            loadGLB(movementAnimPath),
            loadGLB(generalAnimPath)
        ]).then(([ranger, basicAnims, generalAnims]) => {
            this.characterMesh = ranger.scene;

            this.characterGroup = new THREE.Group();
            this.characterGroup.position.set(0, 0, 0);

            const spawn = this.findSpawnLocation(window.game);
            if (spawn) {
                this.characterGroup.position.copy(spawn.Position).y += (spawn.Size.y / 2 + 0.1);
            }

            this.scene.add(this.characterGroup);
            this.characterGroup.add(this.characterMesh);

            this.characterMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.map = skinTexture;
                        child.material.needsUpdate = true;
                    }
                }
            });

            this.mixer = new THREE.AnimationMixer(this.characterMesh);

            const generalClips = generalAnims.animations;
            const idleClip = generalClips.find(c => c.name.toLowerCase().includes('animation 7')) || generalClips[6];
            if (idleClip) {
                idleClip.name = 'idle';
                this.actions['idle'] = this.mixer.clipAction(idleClip);
            }

            const basicClips = basicAnims.animations;
            basicClips.forEach((clip) => {
                const name = clip.name.toLowerCase();
                const isExactRun = (name === 'run' || name === 'rig_medium|run');
                const isExactJump = (name === 'jump' || name === 'rig_medium|jump');

                if (isExactRun) {
                    this.actions['run'] = this.mixer.clipAction(clip);
                } else if ((name.includes('run') || name.includes('walk_fast') || name.includes('walk')) && !this.actions['run']) {
                    this.actions['run'] = this.mixer.clipAction(clip);
                }

                if (isExactJump) {
                    this.actions['jump'] = this.mixer.clipAction(clip);
                    this.actions['jump'].setLoop(THREE.LoopOnce);
                    this.actions['jump'].clampWhenFinished = true;
                } else if (name.includes('jump') && !this.actions['jump']) {
                    this.actions['jump'] = this.mixer.clipAction(clip);
                    this.actions['jump'].setLoop(THREE.LoopOnce);
                    this.actions['jump'].clampWhenFinished = true;
                }
            });

            const dieClip = generalClips.find(c => c.name.toLowerCase().includes('death') || c.name.toLowerCase().includes('die') || c.name.toLowerCase().includes('defeat'));
            if (dieClip) {
                dieClip.name = 'die';
                this.actions['die'] = this.mixer.clipAction(dieClip);
                this.actions['die'].setLoop(THREE.LoopOnce);
                this.actions['die'].clampWhenFinished = true;
            }

            if (this.actions['idle']) this.actions['idle'].play();

            const spService = window.game.children.find(c => c.ClassName === "StarterPlayer");
            const scsFolder = spService?.children.find(c => c.Name === "StarterCharacterScripts");
            if (scsFolder && window.engine) {
                window.engine.scriptSystem.executeAll(scsFolder);
            }

            if (onComplete) onComplete();
        }).catch(err => {
            console.warn("Local character asset files are missing or could not load. Spawning a blocky procedural rig so you can playtest offline:", err);
            
            // Generate basic fallback rig and start playtest
            this.createFallbackRig();
            
            if (onComplete) onComplete();
        });
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.velocity.set(0, 0, 0);

        if (this.actions['die']) {
            if (this.actions['idle']) this.actions['idle'].stop();
            if (this.actions['run']) this.actions['run'].stop();
            this.actions['die'].reset().setEffectiveWeight(1).play();
        } else {
            this.characterMesh.rotation.z = Math.PI / 2;
        }
    }

    update(delta, camera, shiftLockActive, isFirstPerson, cameraYaw, collidableMeshes) {
        if (!this.characterGroup || !this.keys) return;

        if (this.isDead) {
            if (this.mixer) this.mixer.update(delta);
            return;
        }

        const spService = window.game.children.find(c => c.ClassName === "StarterPlayer");
        const walkSpeed = spService ? spService.CharacterWalkSpeed : 8.0;  
        const jumpPower = spService ? spService.CharacterJumpPower : 12.0; 

        const moveVector = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0; right.normalize();

        if (this.keys.w) moveVector.add(forward);
        if (this.keys.s) moveVector.sub(forward);
        if (this.keys.a) moveVector.sub(right);
        if (this.keys.d) moveVector.add(right);

        const isMoving = moveVector.lengthSq() > 0;

        if (isMoving) {
            moveVector.normalize();
            this.velocity.x = moveVector.x * walkSpeed;
            this.velocity.z = moveVector.z * walkSpeed;

            if (shiftLockActive || isFirstPerson) {
                this.characterGroup.rotation.y = cameraYaw + Math.PI;
            } else {
                const targetAngle = Math.atan2(moveVector.x, moveVector.z);
                let angleDifference = targetAngle - this.characterGroup.rotation.y;
                angleDifference = Math.atan2(Math.sin(angleDifference), Math.cos(angleDifference));
                this.characterGroup.rotation.y += angleDifference * 12 * delta;
            }
        } else {
            this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, 20 * delta);
            this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, 20 * delta);

            if (shiftLockActive || isFirstPerson) {
                this.characterGroup.rotation.y = cameraYaw + Math.PI;
            }
        }

        const nextPosition = this.characterGroup.position.clone();
        nextPosition.x += this.velocity.x * delta;
        nextPosition.z += this.velocity.z * delta;

        const playerRadius = 0.6;
        const playerHeight = 1.8;

        const playerBox = new THREE.Box3(
            new THREE.Vector3(nextPosition.x - playerRadius, this.characterGroup.position.y, nextPosition.z - playerRadius),
            new THREE.Vector3(nextPosition.x + playerRadius, this.characterGroup.position.y + playerHeight, nextPosition.z + playerRadius)
        );

        for (const mesh of collidableMeshes) {
            const instance = mesh.userData.instance;
            
            const meshBox = new THREE.Box3().setFromObject(mesh);

            if (playerBox.intersectsBox(meshBox)) {
                if (instance && instance.Touched) {
                    instance.Touched.Fire(this.characterGroup);
                }
            }

            if (instance && instance.CanCollide === false) continue;

            const playerMinY = this.characterGroup.position.y;
            const playerMaxY = this.characterGroup.position.y + playerHeight;
            const meshMinY = meshBox.min.y;
            const meshMaxY = meshBox.max.y;

            const overlapY = (playerMinY < meshMaxY && playerMaxY > meshMinY);

            if (overlapY) {
                const testBoxX = new THREE.Box3(
                    new THREE.Vector3(nextPosition.x - playerRadius, playerMinY, this.characterGroup.position.z - playerRadius),
                    new THREE.Vector3(nextPosition.x + playerRadius, playerMaxY, this.characterGroup.position.z + playerRadius)
                );
                if (testBoxX.intersectsBox(meshBox)) {
                    if (instance && instance.Anchored === false) {
                        instance.mesh.position.x += this.velocity.x * delta;
                        instance.Position.copy(instance.mesh.position);
                    }
                    nextPosition.x = this.characterGroup.position.x;
                    this.velocity.x = 0;
                }

                const testBoxZ = new THREE.Box3(
                    new THREE.Vector3(this.characterGroup.position.x - playerRadius, playerMinY, nextPosition.z - playerRadius),
                    new THREE.Vector3(this.characterGroup.position.x + playerRadius, playerMaxY, nextPosition.z + playerRadius)
                );
                if (testBoxZ.intersectsBox(meshBox)) {
                    if (instance && instance.Anchored === false) {
                        instance.mesh.position.z += this.velocity.z * delta;
                        instance.Position.copy(instance.mesh.position);
                    }
                    nextPosition.z = this.characterGroup.position.z;
                    this.velocity.z = 0;
                }
            }
        }

        this.characterGroup.position.x = nextPosition.x;
        this.characterGroup.position.z = nextPosition.z;

        if (!this.isGrounded) {
            this.velocity.y += -32 * delta;
        }

        if (this.keys.space && this.isGrounded) {
            this.velocity.y = jumpPower;
            this.isGrounded = false;
            if (this.actions['jump']) this.actions['jump'].reset().play();
        }

        this.characterGroup.position.y += this.velocity.y * delta;

        // Dynamic ground check
        let landedY = 0;
        let onPlatform = false;

        for (const mesh of collidableMeshes) {
            const instance = mesh.userData.instance;
            if (instance && instance.CanCollide === false) continue;

            const meshBox = new THREE.Box3().setFromObject(mesh);
            const playerX = this.characterGroup.position.x;
            const playerZ = this.characterGroup.position.z;

            const insideX = (playerX + playerRadius > meshBox.min.x) && (playerX - playerRadius < meshBox.max.x);
            const insideZ = (playerZ + playerRadius > meshBox.min.z) && (playerZ - playerRadius < meshBox.max.z);

            if (insideX && insideZ) {
                if (this.velocity.y <= 0 && 
                    this.characterGroup.position.y <= meshBox.max.y + 0.1 && 
                    this.characterGroup.position.y >= meshBox.max.y - 0.4) {
                    landedY = meshBox.max.y;
                    onPlatform = true;
                    break;
                }
            }
        }

        if (onPlatform) {
            this.characterGroup.position.y = landedY;
            this.velocity.y = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        let nextActionName = 'idle';
        if (!this.isGrounded) {
            nextActionName = 'jump';
        } else if (isMoving) {
            nextActionName = 'run';
        }

        if (this.activeActionName !== nextActionName) {
            const current = this.actions[this.activeActionName];
            const next = this.actions[nextActionName];
            if (next) {
                next.reset().setEffectiveWeight(1).play();
                if (current) current.crossFadeTo(next, 0.15, true);
                this.activeActionName = nextActionName;
            }
        }

        if (this.mixer) this.mixer.update(delta);
    }

    destroy() {
        if (this.characterGroup) {
            this.scene.remove(this.characterGroup);
            this.characterGroup = null;
        }
        this.mixer = null;
        this.actions = {};
        this.activeActionName = 'idle';
        this.isDead = false; 
    }
}