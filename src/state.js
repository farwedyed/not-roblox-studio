import * as THREE from 'three';

export const state = {
    loadedModels: {},
    loadedSkyboxes: {},
    loadedTextures: {},
    placedObjects: [],
    selectedObjects: [],
    selectedObject: null,
    isLightingSelected: false,
    currentTool: 'select',
    
    lightingSettings: {
        clockTime: 14,
        brightness: 2.2,
        ambient: 1.1,
        shadows: true
    },

    undoStack: [],
    redoStack: []
};

export function serializeObject(obj, scene) {
    const worldPos = new THREE.Vector3();
    const worldRot = new THREE.Euler();
    const worldScale = new THREE.Vector3();

    obj.getWorldPosition(worldPos);
    const q = new THREE.Quaternion();
    obj.getWorldQuaternion(q);
    worldRot.setFromQuaternion(q);
    obj.getWorldScale(worldScale);

    const isInsideTempPivot = (obj.parent && obj.parent.name === "TempMultiPivot");
    const realParent = isInsideTempPivot ? null : ((obj.parent && obj.parent !== scene) ? obj.parent.name : null);

    return {
        name: obj.name,
        parentName: realParent,
        modelType: obj.userData ? (obj.userData.modelType || null) : null,
        materialName: obj.userData ? (obj.userData.materialName || "Plastic") : "Plastic",
        isPrimitive: obj.userData ? !!obj.userData.isPrimitive : false,
        primitiveType: obj.userData ? (obj.userData.primitiveType || null) : null,
        isBaseplate: obj.name === "Baseplate",
        isGroup: obj.isGroup && !isInsideTempPivot && !(obj.userData && obj.userData.modelType),
        locked: obj.userData ? !!obj.userData.locked : false,
        anchored: obj.userData ? !!obj.userData.anchored : false,
        canCollide: obj.userData ? !!obj.userData.canCollide : false,
        castShadow: !!obj.castShadow,
        receiveShadow: !!obj.receiveShadow,
        color: (obj.isMesh && obj.material && obj.material.color) ? "#" + obj.material.color.getHexString() : "#a3a2a5",
        transparency: (obj.isMesh && obj.material) ? obj.material.opacity : 1,
        roughness: (obj.isMesh && obj.material) ? obj.material.roughness : 0.35,
        position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        rotation: { x: worldRot.x, y: worldRot.y, z: worldRot.z },
        scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z }
    };
}