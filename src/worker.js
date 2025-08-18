import { createImage } from './util';

export const initialize = function () {
};
export const onmessage = function (message, postResponse) {
    const data = message.data;
    const { type } = data;
    const { width, height, buffer, ignoreBlackColor } = data;
    if (type === 'createimage') {
        const imageBitmap = createImage(width, height, new Uint8Array(buffer), ignoreBlackColor);
        postResponse(null, { loaded: true, buffer: imageBitmap }, [imageBitmap]);
    }
};
