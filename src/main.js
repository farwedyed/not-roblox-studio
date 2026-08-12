import { state } from './state.js';
import { initScene, animate } from './scene.js';
import { initDB, loadSavedModelsFromDB, clearAllSavedData } from './db.js';
import { setTool, updateSnapSettings, snapSelectedToGround, focusCamera, groupSelected, ungroupSelected, deleteSelected, duplicateSelected, toggleLockSelected, setupControlListeners } from './controls.js';
import { insertPrimitive } from './loaders.js';
import { exportMapJSON, checkAndRestoreAutoSave, autoSaveMap, hideContextMenu, undo, redo } from './ui.js';
import { setupGlobalLoadingManager } from './materials.js';

function bindUIButtons() {
    // Ribbon Tools
    document.getElementById('tool-select').onclick = () => setTool('select');
    document.getElementById('tool-translate').onclick = () => setTool('translate');
    document.getElementById('tool-scale').onclick = () => setTool('scale');
    document.getElementById('tool-rotate').onclick = () => setTool('rotate');

    // Primitives
    document.getElementById('btn-part-block').onclick = () => insertPrimitive('Block');
    document.getElementById('btn-part-sphere').onclick = () => insertPrimitive('Sphere');

    // Action Buttons
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

    // Context Menu Buttons
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

    initDB().then(() => {
        return loadSavedModelsFromDB();
    }).then(() => {
        checkAndRestoreAutoSave();
    });

    setInterval(autoSaveMap, 15000);
    animate();
});