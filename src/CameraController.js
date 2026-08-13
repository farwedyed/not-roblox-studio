import * as THREE from 'three';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.cameraDistance = 5;
        this.cameraYaw = 0;
        this.cameraPitch = 0.2;
        this.cameraOffset = new THREE.Vector3(0, 1.3, 0);

        this.shiftLockActive = false;
        this.isFirstPerson = false;
        this.rightMouseDown = false;
    }

    // Play Mode: Orbit and track player
    update(characterGroup) {
        if (!characterGroup) return;

        let targetPosition = characterGroup.position.clone().add(this.cameraOffset);

        if (this.cameraDistance < 0.8) {
            this.isFirstPerson = true;
            characterGroup.visible = false;
        } else {
            this.isFirstPerson = false;
            characterGroup.visible = true;
        }

        // Sync the crosshair HTML overlay dynamically based on first person / shift lock
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            if (this.isFirstPerson || this.shiftLockActive) {
                crosshair.style.display = 'block';
            } else {
                crosshair.style.display = 'none';
            }
        }

        // Shift view laterally to the right when Roblox Shift-Lock is turned on
        if (this.shiftLockActive && !this.isFirstPerson) {
            const rightDir = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
            targetPosition.addScaledVector(rightDir, 0.85);
        }

        const sphericalOffset = new THREE.Vector3(
            Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
            Math.sin(this.cameraPitch),
            Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
        ).multiplyScalar(this.cameraDistance);

        this.camera.position.copy(targetPosition).add(sphericalOffset);

        // Clamping height to prevent dropping beneath ground plane (Y=0)
        const minCameraHeight = 0.3;
        if (this.camera.position.y < minCameraHeight) {
            this.camera.position.y = minCameraHeight;
        }

        this.camera.lookAt(targetPosition);
    }

    // Edit Mode: Studio Fly Camera
    updateEditMode(delta, keys) {
        // Compute orientation directly
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.cameraYaw;
        
        // FIXED: Inverted pitch direction so dragging mouse down tilts camera down
        this.camera.rotation.x = -this.cameraPitch; 

        // Translation calculations
        const speed = 25 * delta; // Fly speed (25 units/studs per second)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        if (keys.w) this.camera.position.addScaledVector(forward, speed);
        if (keys.s) this.camera.position.addScaledVector(forward, -speed);
        if (keys.a) this.camera.position.addScaledVector(right, -speed);
        if (keys.d) this.camera.position.addScaledVector(right, speed);
        if (keys.e) this.camera.position.addScaledVector(up, speed); // Fly Up
        if (keys.q) this.camera.position.addScaledVector(up, -speed); // Fly Down
    }
}