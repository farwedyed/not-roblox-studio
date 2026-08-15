import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export class CharacterController {
    constructor(scene) {
        this.scene = scene;
        this.gltfLoader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();

        this.characterGroup = null;
        this.characterMesh = null;
        this.mixer = null;
        this.actions = {};
        this.activeActionName = 'idle';

        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this.isLanding = false;
        this.landingTimeout = null;
        this.isDead = false; 
        this.keys = null; 

        this.humanoidInstance = null; 
        this.meshGroundOffset = 0; // Calculates exact ground alignment for custom mesh

        // --- MODEL SCALE & ORIENTATION FIXES ---
        this.modelScale = 3.5; 
        this.rotationXFix = -Math.PI / 2;    
        this.rotationYFix = 0;              
    }

    findSpawnLocation(root) {
        if (root.ClassName === "SpawnLocation") return root;
        for (const child of root.children) {
            const found = this.findSpawnLocation(child);
            if (found) return found;
        }
        return null;
    }

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
        this.isLanding = false;
        this.isDead = false;
    }

    load(onComplete) {
        const modelPath = './Characters/Character1.glb';

        const loadGLB = (url) => new Promise((res, rej) => this.gltfLoader.load(url, res, undefined, rej));
        const loadFBX = (url) => new Promise((res) => this.fbxLoader.load(url, res, undefined, () => res(null)));

        Promise.all([
            loadGLB(modelPath),
            loadFBX('./Animations/Idle.fbx'),
            loadFBX('./Animations/Walking.fbx'),
            loadFBX('./Animations/Jumping.fbx'),
            loadFBX('./Animations/Falling.fbx'),
            loadFBX('./Animations/Landing.fbx')
        ]).then(([characterGltf, idleFbx, walkFbx, jumpFbx, fallFbx, landFbx]) => {
            this.characterMesh = characterGltf.scene;

            this.characterMesh.scale.setScalar(this.modelScale);
            this.characterMesh.rotation.x = this.rotationXFix;
            this.characterMesh.rotation.y = this.rotationYFix;

            // PRECISE GROUND ALIGNMENT: Calculate exact feet level so mesh never sinks into ground
            this.characterMesh.updateMatrixWorld(true);
            const bbox = new THREE.Box3().setFromObject(this.characterMesh);
            this.meshGroundOffset = -bbox.min.y;
            this.characterMesh.position.y = this.meshGroundOffset;

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

            this.characterMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            const getRelativePath = (root, target) => {
                const path = [];
                let current = target;
                while (current && current !== root) {
                    path.unshift(current.name);
                    current = current.parent;
                }
                return path.join('/');
            };

            const characterBones = {};
            this.characterMesh.traverse((child) => {
                if (child.name) {
                    characterBones[child.name] = child;
                }
            });

            const processMixamoClip = (clip) => {
                if (!clip) return null;
                const clonedClip = clip.clone();
                const cleanTracks = [];

                clonedClip.tracks.forEach(track => {
                    const lastDot = track.name.lastIndexOf('.');
                    if (lastDot > -1) {
                        const path = track.name.substring(0, lastDot);
                        const propertyName = track.name.substring(lastDot + 1);
                        
                        const lastSlash = path.lastIndexOf('/');
                        let nodeName = lastSlash > -1 ? path.substring(lastSlash + 1) : path;
                        
                        const pipeIndex = nodeName.indexOf('|');
                        if (pipeIndex > -1) {
                            nodeName = nodeName.substring(pipeIndex + 1);
                        }

                        const targetBoneNode = Object.values(characterBones).find(
                            node => node.name.toLowerCase() === nodeName.toLowerCase()
                        );

                        if (targetBoneNode) {
                            const relativePath = getRelativePath(this.characterMesh, targetBoneNode);

                            if (propertyName === 'quaternion') {
                                track.name = relativePath + '.' + propertyName;
                                cleanTracks.push(track);
                            }
                            else if (propertyName === 'position' && (nodeName.toLowerCase().includes('hips') || nodeName.toLowerCase().includes('pelvis'))) {
                                track.name = relativePath + '.' + propertyName;
                                const firstFrameY = Math.abs(track.values[1]);
                                const isCentimeters = firstFrameY > 5.0;

                                if (isCentimeters) {
                                    for (let i = 0; i < track.values.length; i++) {
                                        track.values[i] *= 0.01;
                                    }
                                }
                                cleanTracks.push(track);
                            }
                        }
                    }
                });
                
                clonedClip.tracks = cleanTracks;
                return clonedClip;
            };

            this.mixer = new THREE.AnimationMixer(this.characterMesh);

            const idleClip = idleFbx?.animations?.length > 0 ? processMixamoClip(idleFbx.animations[0]) : null;
            const walkClip = walkFbx?.animations?.length > 0 ? processMixamoClip(walkFbx.animations[0]) : null;
            const jumpClip = jumpFbx?.animations?.length > 0 ? processMixamoClip(jumpFbx.animations[0]) : null;
            const fallClip = fallFbx?.animations?.length > 0 ? processMixamoClip(fallFbx.animations[0]) : null;
            const landClip = landFbx?.animations?.length > 0 ? processMixamoClip(landFbx.animations[0]) : null;

            if (idleClip) {
                idleClip.name = 'idle';
                this.actions['idle'] = this.mixer.clipAction(idleClip);
            }
            if (walkClip) {
                walkClip.name = 'run';
                this.actions['run'] = this.mixer.clipAction(walkClip);
            }
            if (jumpClip) {
                jumpClip.name = 'jump';
                this.actions['jump'] = this.mixer.clipAction(jumpClip);
                this.actions['jump'].setLoop(THREE.LoopOnce);
                this.actions['jump'].clampWhenFinished = true;
            }
            if (fallClip) {
                fallClip.name = 'fall';
                this.actions['fall'] = this.mixer.clipAction(fallClip);
            }
            if (landClip) {
                landClip.name = 'land';
                this.actions['land'] = this.mixer.clipAction(landClip);
                this.actions['land'].setLoop(THREE.LoopOnce);
                this.actions['land'].clampWhenFinished = true;
            }

            if (this.actions['idle']) this.actions['idle'].play();

            const spService = window.game.children.find(c => c.ClassName === "StarterPlayer");
            const scsFolder = spService?.children.find(c => c.Name === "StarterCharacterScripts");
            if (scsFolder && window.engine) {
                window.engine.scriptSystem.executeAll(scsFolder);
            }

            if (onComplete) onComplete();
        }).catch(err => {
            console.warn("Character asset files could not load. Falling back to blocky rig:", err);
            this.createFallbackRig();
            if (onComplete) onComplete();
        });
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.velocity.set(0, 0, 0);

        if (this.humanoidInstance) {
            this.humanoidInstance.Health = 0;
            window.dispatchEvent(new CustomEvent('gui-changed'));
        }

        if (this.actions['die']) {
            if (this.actions['idle']) this.actions['idle'].stop();
            if (this.actions['run']) this.actions['run'].stop();
            this.actions['die'].reset().setEffectiveWeight(1).play();
        } else {
            this.characterMesh.rotation.z = Math.PI / 2;
        }
    }

    // HIPHEIGHT WORLD POSITION ADJUSTER (ROBLOX STYLE)
    applyHumanoidProperties() {
        if (!this.humanoidInstance || !this.characterMesh) return;

        // HipHeight specifies the height offset above ground!
        const targetHipHeight = this.humanoidInstance.HipHeight !== undefined ? this.humanoidInstance.HipHeight : 2.0;
        const hipHeightOffset = targetHipHeight - 2.0;
        
        // Adjust mesh Y elevation directly without stretching scale
        this.characterMesh.position.y = this.meshGroundOffset + hipHeightOffset;
        this.characterMesh.scale.setScalar(this.modelScale);

        if (this.humanoidInstance.Health <= 0 && !this.isDead) {
            this.die();
        }
    }

    update(delta, camera, shiftLockActive, isFirstPerson, cameraYaw, collidableMeshes) {
        if (!this.characterGroup || !this.keys) return;

        this.applyHumanoidProperties();

        if (this.isDead) {
            if (this.mixer) this.mixer.update(delta);
            return;
        }

        const walkSpeed = this.humanoidInstance ? this.humanoidInstance.WalkSpeed : 16.0;  
        const jumpPower = this.humanoidInstance ? this.humanoidInstance.JumpPower : 50.0; 

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

        const playerRadius = 0.8;
        const playerHeight = 3.2;

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

        const previouslyGrounded = this.isGrounded;

        if (!this.isGrounded) {
            this.velocity.y += -32 * delta;
        }

        if (this.keys.space && this.isGrounded) {
            this.velocity.y = jumpPower;
            this.isGrounded = false;
            this.isLanding = false;
            if (this.actions['jump']) this.actions['jump'].reset().play();
        }

        this.characterGroup.position.y += this.velocity.y * delta;

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

        // Trigger Landing animation if returning to ground
        if (!previouslyGrounded && this.isGrounded) {
            if (this.actions['land']) {
                this.isLanding = true;
                const landAction = this.actions['land'];
                landAction.reset().setEffectiveWeight(1).play();

                const landDuration = (landAction.getClip().duration * 1000) || 350;
                clearTimeout(this.landingTimeout);
                this.landingTimeout = setTimeout(() => {
                    this.isLanding = false;
                }, landDuration);
            }
        }

        let nextActionName = 'idle';
        if (!this.isGrounded) {
            this.isLanding = false;
            if (this.velocity.y < -1.0 && this.actions['fall']) {
                nextActionName = 'fall';
            } else {
                nextActionName = 'jump';
            }
        } else if (isMoving) {
            this.isLanding = false;
            nextActionName = 'run';
        } else if (this.isLanding && this.actions['land']) {
            nextActionName = 'land';
        } else {
            nextActionName = 'idle';
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
        this.isLanding = false;
        this.isDead = false; 
        this.humanoidInstance = null;
    }
}