export function createCanvas(width, height) {
    let canvas;
    if (OffscreenCanvas) {
        canvas = new OffscreenCanvas(width, height);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
    }
    return canvas;
}

let blankCanvas, blankImage;

export const DEFAULT_TILE_SIZE = 256;

export function getBlankImage() {
    if (!blankCanvas) {
        blankCanvas = createCanvas(DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE);
    }
    if (OffscreenCanvas) {
        // eslint-disable-next-line no-unused-vars
        const ctx = blankCanvas.getContext('2d');
        return blankCanvas.transferToImageBitmap();
    } else {
        if (!blankImage) {
            blankImage = blankCanvas.toDataURL('image/png', 0.5);
        }
        return blankImage;
    }
}

export function createImage(width, height, data, ignoreBlackColor) {
    const size = width * height * 4;
    let pixelSize = 3;
    if (size === data.length) {
        pixelSize = 4;
    }
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    let idx = 0;
    for (let i = 0, len = data.length; i < len; i += pixelSize) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        let alpha = a;
        if (pixelSize !== 4) {
            alpha = 255;
        }
        if (ignoreBlackColor) {
            if (r === 0 && g === 0 && b === 0) {
                alpha = 0;
            }
        }
        imageData.data[idx + 3] = alpha;
        idx += 4;
    }
    ctx.putImageData(imageData, 0, 0);
    if (canvas.transferToImageBitmap) {
        return canvas.transferToImageBitmap();
    }
    return canvas;
}

export function bboxCross(bbox1, bbox2) {
    if (bbox1[2] < bbox2[0]) {
        return false;
    }
    if (bbox1[1] > bbox2[3]) {
        return false;
    }
    if (bbox1[0] > bbox2[2]) {
        return false;
    }
    if (bbox1[3] < bbox2[1]) {
        return false;
    }
    return true;
}

export function mergeArrayBuffer(datas) {
    let l = 0;
    const len = datas.length;
    for (let i = 0; i < len; i++) {
        l += datas[i].length;
    }
    const data = new Uint8Array(l);
    let offset = 0;
    for (let i = 0; i < len; i++) {
        data.set(datas[i], offset);
        offset += datas[i].length;
    }
    return data;
}
