import { state } from './state.js';
import { initScene, animate } from './scene.js';
import { initDB, loadSavedModelsFromDB, loadSavedTexturesFromDB, clearAllSavedData, cleanupCollidingTextures } from './db.js';
import { setTool, updateSnapSettings, snapSelectedToGround, focusCamera, groupSelected, ungroupSelected, deleteSelected, duplicateSelected, toggleLockSelected, setupControlListeners, undo, redo } from './controls.js';
import { insertPrimitive } from './loaders.js';
import { exportMapJSON, checkAndRestoreAutoSave, autoSaveMap, hideContextMenu, saveState } from './ui.js';
import { setupGlobalLoadingManager } from './materials.js';

function bindUIButtons() {
    document.getElementById('tool-select').onclick = () => setTool('select');
    document.getElementById('tool-translate').onclick = () => setTool('translate');
    document.getElementById('tool-scale').onclick = () => setTool('scale');
    document.getElementById('tool-rotate').onclick = () => setTool('rotate');

    document.getElementById('btn-part-block').onclick = () => insertPrimitive('Block');
    document.getElementById('btn-part-sphere').onclick = () => insertPrimitive('Sphere');

    document.getElementById('btn-drop-ground').onclick = () => snapSelectedToGround();
    document.getElementById('btn-undo').onclick = () => undo();
    document.getElementById('btn-redo').onclick = () => redo();
    document.getElementById('btn-focus').onclick = () => focusCamera();
    document.getElementById('btn-group').onclick = () => groupSelected();
    document.getElementById('btn-ungroup').onclick = () => ungroupSelected();
    document.getElementById('btn-delete').onclick = () => deleteSelected();
    document.getElementById('btn-duplicate').onclick = () => duplicateSelected();
    document.getElementById('btn-export').onclick = () => exportMapJSON();
    document.getElementById('btn-clear-autosave').onclick = () => clearAllSavedData();

    document.getElementById('ctx-duplicate').onclick = () => { duplicateSelected(); hideContextMenu(); };
    document.getElementById('ctx-group').onclick = () => { groupSelected(); hideContextMenu(); };
    document.getElementById('ctx-ungroup').onclick = () => { ungroupSelected(); hideContextMenu(); };
    document.getElementById('ctx-focus').onclick = () => { focusCamera(); hideContextMenu(); };
    document.getElementById('ctx-drop').onclick = () => { snapSelectedToGround(); hideContextMenu(); };
    document.getElementById('ctx-lock').onclick = () => { toggleLockSelected(); hideContextMenu(); };
    document.getElementById('ctx-delete').onclick = () => { deleteSelected(); hideContextMenu(); };
}

window.addEventListener('DOMContentLoaded', () => {
    setupGlobalLoadingManager();
    initScene();
    bindUIButtons();
    setupControlListeners();

    window.addEventListener('beforeunload', () => {
        if (!state.isRestoring) autoSaveMap();
    });

    initDB().then(() => {
        return cleanupCollidingTextures();
    }).then(() => {
        return loadSavedTexturesFromDB();
    }).then(() => {
        return loadSavedModelsFromDB();
    }).then(() => {
        // Sequenced with a clean Promise resolve to prevent frame 1 autosave overwrites
        return checkAndRestoreAutoSave();
    }).then(() => {
        saveState();
    }).catch(err => {
        console.error("Startup restore error:", err);
        state.isRestoring = false;
        saveState();
    });

    window.repairTextures = () => {
        import('./loaders.js').then(m => {
            m.repairSceneTextures();
        });
    };

    window.purgeBlackTextures = () => {
        import('./state.js').then(stateMod => {
            const s = stateMod.state;
            delete s.loadedTextures["palette.png"];
            delete s.loadedTextures["colormap.png"];
            delete s.loadedTextures["texture.png"];
            if (s.textureData) {
                delete s.textureData["palette.png"];
                delete s.textureData["colormap.png"];
                delete s.textureData["texture.png"];
            }
            import('./db.js').then(dbMod => {
                dbMod.cleanupCollidingTextures().then(() => {
                    alert("Purge complete! The legacy black textures are gone from your database and memory.\n\nNow, simply drag-and-drop your asset folders to reload the correct colorful textures!");
                });
            });
        });
    };

    setInterval(autoSaveMap, 10000);
    animate();
});