import * as THREE from 'three';

export const materialTextureLibrary = {};
export const fileBlobMap = new Map();
export const fileToAssetIdMap = new Map();
export const blobUrlToAssetIdMap = new Map();
export const assetIdToDisplayNameMap = new Map();

function createDummyDataURL() {
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 4;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/png');
}

export const DUMMY_WHITE_PIXEL = createDummyDataURL();

// Global URL modifier intercepts ALL missing texture requests app-wide
export function setupGlobalLoadingManager() {
    THREE.DefaultLoadingManager.setURLModifier((url) => {
        if (!url) return url;
        const cleanUrl = decodeURIComponent(url).replace(/\\/g, '/').toLowerCase();
        const fileName = cleanUrl.split('/').pop().split('?')[0];

        if (fileBlobMap.has(cleanUrl)) return fileBlobMap.get(cleanUrl);
        if (fileBlobMap.has(fileName)) return fileBlobMap.get(fileName);

        if (url.match(/\.(png|jpg|jpeg|webp)$/i) || url.includes('Textures/')) {
            return DUMMY_WHITE_PIXEL;
        }

        return url;
    });
}

export function generateProceduralMaterials() {
    function makeCanvas(size, drawFn) {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        drawFn(ctx, size);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    materialTextureLibrary["Studs"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#cccccc';
        const grid = 4; const step = s / grid;
        for (let x = 0; x < grid; x++) {
            for (let y = 0; y < grid; y++) {
                ctx.beginPath();
                ctx.arc(x * step + step/2, y * step + step/2, step/4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });

    materialTextureLibrary["Grass"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#4b7f32'; ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 2000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#3d6827' : '#59933a';
            ctx.fillRect(Math.random() * s, Math.random() * s, 2, 4);
        }
    });

    materialTextureLibrary["Brick"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#8b3a2b'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#555555';
        const rows = 8; const rHeight = s / rows;
        for (let r = 0; r <= rows; r++) { ctx.fillRect(0, r * rHeight, s, 2); }
        for (let r = 0; r < rows; r++) {
            const offset = (r % 2) * (s / 4);
            for (let c = 0; c < 4; c++) {
                ctx.fillRect(c * (s / 2) + offset, r * rHeight, 2, rHeight);
            }
        }
    });

    materialTextureLibrary["Wood"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#a06a42'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#835431';
        for (let y = 0; y < s; y += 4) {
            ctx.fillRect(0, y + (Math.random()*2), s, 1 + Math.random()*2);
        }
    });

    materialTextureLibrary["Concrete"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#666666' : '#aaaaaa';
            ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
        }
    });

    materialTextureLibrary["Metal"] = makeCanvas(256, (ctx, s) => {
        ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#aaaaaa';
        const step = 32;
        for (let x = 0; x < s; x += step) {
            for (let y = 0; y < s; y += step) {
                ctx.save();
                ctx.translate(x + 16, y + 16);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-6, -2, 12, 4);
                ctx.restore();
            }
        }
    });
}

export function createRobloxSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#0055ff');
    grad.addColorStop(0.45, '#2b88ff');
    grad.addColorStop(0.75, '#80bfff');
    grad.addColorStop(1.0, '#cce6ff');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
}

export function createFlareTexture(size, innerColor, outerColor) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.4, outerColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}