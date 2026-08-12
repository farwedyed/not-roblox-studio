# ROBLOX STUDIO WAS SLOW SO I BUILT A BETTER ONE

Roblox Studio takes ten minutes to open, eats all my computer memory, and crashes whenever I look at it wrong. So I got mad and rebuilt the entire map editor inside a single browser tab using Three.js and WebGL.

Welcome to the lightest, fastest, and most weird 3D map editor ever created. Zero installs. Zero lag. Pure power.

## FEATURES IMPORTED FROM ROBLOX STUDIO

1. Camera Flight Navigation
* Right click plus WASD to fly around the workspace like a superhero.
* Hold Shift for slow precision camera flight.
* Q and E keys to fly down and up.
* Pointer lock camera look so your cursor never gets trapped on screen borders.

2. Roblox Future Lighting Engine
* ClockTime control with dynamic Day and Night cycle from morning to night.
* Realistic Sun Lens Flares that sparkle when you look at the sun.
* Procedural Roblox Sky Gradient with soft horizon haze.
* Glossy ground light reflections on the baseplate using sky environment maps.
* Global soft shadows with adjustable sun brightness and ambient fill light.

3. Explorer Workspace Tree
* Full Workspace tree view showing all your parts, models, and baseplate.
* Dedicated Lighting service in the tree to edit sun and sky settings.
* Right click context menu directly inside the Explorer panel.

4. Properties Panel with Bulk Editing
* Tweak object Name, Locked status, Anchored status, and CanCollide rules.
* Appearance controls for Color picker, Transparency slider, Roughness, and Shadows.
* Bulk Property Editing: Select multiple parts and change their colors or materials all at once.

5. Builtin Material and Texture Library
* Classic Roblox Studs pattern on top of parts.
* Builtin procedural materials for Grass, Brick, Wood, Concrete, Metal, and Cobblestone.
* Custom Texture Upload: Upload any image and apply it to parts with texture scaling controls.

6. Transform Tools and Snapping
* Select Tool (Ctrl+1): Click and drag parts directly across surfaces with grid snapping.
* Move Tool (Ctrl+2): 3D direction arrows with Stud snapping (1 Stud, 0.5 Studs, 2 Studs, 4 Studs, Off).
* Scale Tool (Ctrl+3): Directional scaling that anchors the bottom face to the ground while stretching upward.
* Rotate Tool (Ctrl+4): Rotation rings with Degree snapping (15 deg, 45 deg, 90 deg) and real time X Y Z degree readouts.
* Drop To Ground button to instantly snap any object to the baseplate.

7. Multiselection and Grouping
* Shift plus Click to pick multiple items.
* Marquee Box Select: Click and drag a box across the screen to select a cluster of parts.
* Multi Object Pivot: Moving, scaling, or rotating transforms all selected objects together around a shared center.
* Group (Ctrl+G) and Ungroup (Ctrl+U) parts into organized model folders.

8. Production Quality Shortcuts and Memory
* Undo (Ctrl+Z) and Redo (Ctrl+Y) with zero ghost trails.
* Duplicate (Ctrl+D) and Delete.
* Focus Camera (F) to frame the selected model.
* Automatic map autosave to LocalStorage every 15 seconds.
* Persistent IndexedDB 3D Model Database: Imported 3D models stay saved in browser storage so refreshing the page never loses your assets.
* Export map layout to JSON for game engines.

9. Universal Asset Importing
* Drag and Drop 3D GLB models or images directly onto the browser window.
* Open entire folders or pick individual files.
* Automatic 3D thumbnail previews generated in the Toolbox sidebar.
* Automatic missing texture fallbacks so GLB models never crash.

## HOW TO RUN

1. Open index.html in your web browser or run Live Server in VS Code.
2. Import your 3D GLB models or start placing parts.
3. Enjoy a map editor that does not crash your computer!
