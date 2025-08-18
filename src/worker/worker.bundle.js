export default `/*!
 * maptalks.tiflayer v0.3.0
  */
 function (exports) { 'use strict';

    function createCanvas(width, height) {
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

    function createImage(width, height, data, ignoreBlackColor) {
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

    const initialize = function () {
    };
    const onmessage = function (message, postResponse) {
        const data = message.data;
        const { type } = data;
        const { width, height, buffer, ignoreBlackColor } = data;
        if (type === 'createimage') {
            const imageBitmap = createImage(width, height, new Uint8Array(buffer), ignoreBlackColor);
            postResponse(null, { loaded: true, buffer: imageBitmap }, [imageBitmap]);
        }
    };

    exports.initialize = initialize;
    exports.onmessage = onmessage;

    Object.defineProperty(exports, '__esModule', { value: true });

}`
