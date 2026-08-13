import * as THREE from 'three';

export const state = {
    loadedModels: {},
    loadedSkyboxes: {},
    loadedTextures: {},
    placedObjects: [],
    selectedObjects: [],
    selectedObject: null,
    isLightingSelected: false,
    isRestoring: true,
    currentTool: 'select',
    
    textureData: {},
    
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
    
    const parentRef = isInsideTempPivot 
        ? (obj.userData.originalParent && obj.userData.originalParent !== scene ? obj.userData.originalParent : null) 
        : ((obj.parent && obj.parent !== scene) ? obj.parent : null);

    const parentUuid = parentRef ? parentRef.uuid : null;
    const parentName = parentRef ? parentRef.name : null;

    let textureAssetId = null;
    
    obj.traverse(c => {
        if (c.isMesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                if (m.userData && m.userData.textureAssetId) {
                    textureAssetId = m.userData.textureAssetId;
                }
            });
        }
    });

    if (!textureAssetId && obj.userData && obj.userData.textureAssetId) {
        textureAssetId = obj.userData.textureAssetId;
    }

    let repeatU = 1, repeatV = 1;
    let offsetU = 0, offsetV = 0;

    obj.traverse(c => {
        if (c.isMesh && c.material && c.material.map) {
            repeatU = c.material.map.repeat.x;
            repeatV = c.material.map.repeat.y;
            offsetU = c.material.map.offset.x;
            offsetV = c.material.map.offset.y;
        }
    });

    let objectType = "Group";
    if (obj.name === "Baseplate") objectType = "Baseplate";
    else if (obj.userData && obj.userData.isPrimitive) objectType = "Primitive";
    else if (obj.userData && obj.userData.modelType) objectType = "GLTFModel";
    else if (obj.isMesh) objectType = "Primitive";

    let hexColor = "#a3a2a5";
    if (obj.isMesh && obj.material && obj.material.color) {
        hexColor = "#" + obj.material.color.getHexString();
    }

    return {
        uuid: obj.uuid,
        parentUuid: parentUuid,
        parentName: parentName,
        name: obj.name,
        objectType: objectType,
        modelType: obj.userData ? (obj.userData.modelType || null) : null,
        materialName: obj.userData ? (obj.userData.materialName || "Plastic") : "Plastic",
        textureAssetId: textureAssetId,
        hasCustomTexture: obj.userData ? !!obj.userData.hasCustomTexture : false,
        textureName: obj.userData ? (obj.userData.textureName || null) : null,
        textureRepeat: { u: repeatU, v: repeatV },
        textureOffset: { u: offsetU, v: offsetV },
        isPrimitive: obj.userData ? !!obj.userData.isPrimitive : (objectType === "Primitive"),
        primitiveType: obj.userData ? (obj.userData.primitiveType || 'Block') : 'Block',
        isBaseplate: obj.name === "Baseplate",
        isGroup: obj.isGroup && !isInsideTempPivot && objectType === "Group",
        locked: obj.userData ? !!obj.userData.locked : false,
        anchored: obj.userData ? !!obj.userData.anchored : false,
        canCollide: obj.userData ? !!obj.userData.canCollide : false,
        castShadow: !!obj.castShadow,
        receiveShadow: !!obj.receiveShadow,
        color: hexColor,
        transparency: (obj.isMesh && obj.material) ? obj.material.opacity : 1,
        roughness: (obj.isMesh && obj.material) ? obj.material.roughness : 0.35,
        position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        rotation: { x: worldRot.x, y: worldRot.y, z: worldRot.z },
        scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z }
    };
}

export function getSerializableObjects() {
    const list = [];
    const traverse = (obj) => {
        if (!obj) return;
        list.push(obj);

        if (obj.userData && obj.userData.modelType) {
            return;
        }

        if (obj.children) {
            obj.children.forEach(child => {
                if (child.name === "TempMultiPivot" || 
                    child.name === "RobloxScaleGizmoGroup" || 
                    child.isTransformControls || 
                    child.isLight || 
                    child.userData?.isHelper) return;
                traverse(child);
            });
        }
    };

    state.placedObjects.forEach(root => {
        traverse(root);
    });

    return list;
}