import * as THREE from 'three';

export class PhysicsService {
    update(collidableMeshes, delta) {
        const gravity = -32;

        for (const mesh of collidableMeshes) {
            const instance = mesh.userData.instance;
            if (!instance || instance.Anchored) continue; 

            if (!instance.velocity) {
                instance.velocity = new THREE.Vector3(0, 0, 0);
            }

            instance.velocity.y += gravity * delta;

            const nextPos = instance.Position.clone().addScaledVector(instance.velocity, delta);
            const halfHeight = instance.Size.y / 2;

            if (nextPos.y - halfHeight <= 0) {
                nextPos.y = halfHeight;
                instance.velocity.y = 0;
                instance.velocity.x *= 0.8; 
                instance.velocity.z *= 0.8;
            }

            const partBox = new THREE.Box3().setFromObject(mesh);
            partBox.min.y += 0.05; 

            for (const otherMesh of collidableMeshes) {
                if (otherMesh === mesh) continue;

                const otherInstance = otherMesh.userData.instance;
                if (otherInstance && otherInstance.CanCollide === false) continue;

                const otherBox = new THREE.Box3().setFromObject(otherMesh);
                const overlapX = nextPos.x - instance.Size.x / 2 < otherBox.max.x && nextPos.x + instance.Size.x / 2 > otherBox.min.x;
                const overlapZ = nextPos.z - instance.Size.z / 2 < otherBox.max.z && nextPos.z + instance.Size.z / 2 > otherBox.min.z;

                if (overlapX && overlapZ) {
                    const topOfOther = otherBox.max.y;
                    const bottomOfSelf = nextPos.y - halfHeight;

                    if (bottomOfSelf < topOfOther && instance.Position.y > otherInstance.Position.y) {
                        nextPos.y = topOfOther + halfHeight;
                        instance.velocity.y = 0;
                    }
                }
            }

            instance.Position.copy(nextPos);
            instance.updateTransform();
        }
    }
}