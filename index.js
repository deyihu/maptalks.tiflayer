import { TileLayer, Extent, Browser, registerWorkerAdapter, worker, Util } from 'maptalks';
import { fromArrayBuffer, Pool } from 'geotiff';
import SphericalMercator from '@mapbox/sphericalmercator';
const merc = new SphericalMercator({
    size: 256,
    antimeridian: true
});
const pool = new Pool();
const TEMPBBOX1 = [1, 1, 1, 1], TEMPBBOX2 = [1, 1, 1, 1];
const DEFAULT_TILE_SIZE = 256;
let blankImage, blankCanvas;
const workerKey = '_tifprocess_';
let tifActor;
let tempCanvas;

function createCanvas(width, height) {
    let canvas;
    if (Browser.decodeImageInWorker) {
        canvas = new OffscreenCanvas(width, height);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
    }
    return canvas;
}
function getBlankImage() {
    if (!blankCanvas) {
        blankCanvas = createCanvas(DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE);
    }
    if (Browser.decodeImageInWorker) {
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

function bboxCross(bbox1, bbox2) {
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

function mergeArrayBuffer(datas) {
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

function createImage(width, height, data) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    let idx = 0;
    for (let i = 0, len = data.length; i < len; i += 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        let alpha = 255;
        if (r === 0 && g === 0 && b === 0) {
            alpha = 0;
        }
        imageData.data[idx + 3] = alpha;
        idx += 4;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

registerWorkerAdapter(workerKey, function (exports, global) {

    function createCanvas(width, height) {
        return new OffscreenCanvas(width, height);
    }

    function createImage(width, height, data) {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        let idx = 0;
        for (let i = 0, len = data.length; i < len; i += 3) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            imageData.data[idx] = r;
            imageData.data[idx + 1] = g;
            imageData.data[idx + 2] = b;
            let alpha = 255;
            if (r === 0 && g === 0 && b === 0) {
                alpha = 0;
            }
            imageData.data[idx + 3] = alpha;
            idx += 4;
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.transferToImageBitmap();
    }

    exports.initialize = function () {
    };
    exports.onmessage = function (message, postResponse) {
        const data = message.data;
        const { type } = data;
        const { width, height, buffer } = data;
        if (type === 'createimage') {
            const imageBitmap = createImage(width, height, new Uint8Array(buffer));
            postResponse(null, { loaded: true, buffer: imageBitmap }, [imageBitmap]);
        }
    };
});

function getActor() {
    if (tifActor) {
        return tifActor;
    }
    tifActor = new worker.Actor(workerKey);
    return tifActor;
}

function getTileImage(options) {
    if (!tempCanvas) {
        tempCanvas = createCanvas(DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE);
    }
    const ctx = tempCanvas.getContext('2d');
    const { width, height } = tempCanvas;
    ctx.clearRect(0, 0, width, height);
    const { bounds, image, quality } = options;
    const [px, py, w, h] = bounds;
    ctx.drawImage(image, px, py, w, h, 0, 0, width, height);
    if (!Browser.decodeImageInWorker) {
        const dataUrl = tempCanvas.toDataURL('image/png', quality || 0.6);
        return dataUrl;
    } else {
        const imageBitMap = tempCanvas.transferToImageBitmap();
        return imageBitMap;
    }
}
const forEachCoordinatesOfExtent = (extent, transform, out) => {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const coordinates = extent.toArray();
    coordinates.forEach(c => {
        c = c.toArray();
        c = merc[transform](c);
        const [x, y] = c;
        minx = Math.min(minx, x);
        miny = Math.min(miny, y);
        maxx = Math.max(maxx, x);
        maxy = Math.max(maxy, y);
    });
    if (out) {
        out.xmin = minx;
        out.ymin = miny;
        out.xmax = maxx;
        out.ymax = maxy;
        return out;
    }
    return [minx, miny, maxx, maxy];
};

const options = {
    urlTemplate: './hello?x={x}&y={y}&z={z}',
    datadebug: false,
    quality: 0.6
};

export class TifLayer extends TileLayer {
    constructor(id, options) {
        super(id, options);
        this._pendingTiles = [];
        this.on('renderercreate', this._renderCreate);
        this.geoTifInfo = {
            loaded: false
        };
        this._initTif();
    }

    _renderCreate(e) {
        e.renderer.loadTile = function (tile) {
            let tileImage;
            if (Browser.decodeImageInWorker) {
                tileImage = {};
                // this._fetchImage(tileImage, tile);
            } else {
                const tileSize = this.layer.getTileSize(tile.layer);
                tileImage = new Image();

                tileImage.width = tileSize['width'];
                tileImage.height = tileSize['height'];

                tileImage.onload = this.onTileLoad.bind(this, tileImage, tile);
                tileImage.onerror = this.onTileError.bind(this, tileImage, tile);

                // this.loadTileImage(tileImage, tile['url'], tile);
            }
            this.loadTileImage(tileImage, tile['url'], tile);
            return tileImage;
        };
        e.renderer.loadTileImage = (img, url, tile) => {
            if (!this.geoTifInfo.loaded) {
                this._pendingTiles.push({
                    img, url, tile
                });
                return this;
            }
            setTimeout(() => {
                this._getTifTile({ url, img, tile });
            }, 1);

        };
    }

    _getTifTile(tileData) {
        const { url, img, tile } = tileData;
        const searchParams = new URL(Util.getAbsoluteURL(url)).searchParams;
        function getParams(key) {
            return parseInt(searchParams.get(key));
        }
        const loadTile = (dataUrl) => {
            if (img instanceof Image) {
                img.src = dataUrl;
            } else {
                this.getRenderer().onTileLoad(dataUrl, tile);
            }
        };
        const x = getParams('x');
        const y = getParams('y');
        const z = getParams('z');
        const extent = this._getTileExtent(x, y, z);
        const map = this.getMap();
        const prj = map.getProjection();
        let bounds;
        if (prj.code.indexOf('4326') > -1) {
            bounds = this.geoTifInfo.bounds;
        } else if (prj.code.indexOf('3857') > -1) {
            bounds = this.geoTifInfo.mBounds;
        }
        if (!bounds) {
            console.error('onlay support 4326/3857 prj');
            return;
        }
        TEMPBBOX1[0] = extent.xmin;
        TEMPBBOX1[1] = extent.ymin;
        TEMPBBOX1[2] = extent.xmax;
        TEMPBBOX1[3] = extent.ymax;
        TEMPBBOX2[0] = bounds[0];
        TEMPBBOX2[1] = bounds[1];
        TEMPBBOX2[2] = bounds[2];
        TEMPBBOX2[3] = bounds[3];
        if (!bboxCross(TEMPBBOX1, TEMPBBOX2)) {
            const blank = getBlankImage();
            loadTile(blank);
            return null;
        }
        const tileBounds = this.getImageBounds(x, y, z, bounds);
        const dataUrl = getTileImage({
            bounds: tileBounds,
            image: this.geoTifInfo.canvas,
            quality: this.options.quality
        });
        loadTile(dataUrl);
    }

    _tifLoaded() {
        this._pendingTiles.forEach(tile => {
            this._getTifTile(tile);
        });
        return this;
    }

    _initTif() {
        const url = this.options.tifUrl;
        if (!url) {
            return this;
        }
        this.geoTifInfo = {
            url: url,
            loaded: false
        };
        fetch(url).then(res => res.arrayBuffer()).then(arrayBuffer => {
            fromArrayBuffer(arrayBuffer).then(tiff => {
                return tiff.getImage();
            }).then(image => {
                const width = image.getWidth();
                const height = image.getHeight();
                let bounds = image.getBoundingBox();
                let mBounds = bounds;
                const geoInfo = image.getGeoKeys();
                this.geoTifInfo.geoInfo = geoInfo;
                const extent = new Extent(bounds);
                if (geoInfo && geoInfo.GeographicTypeGeoKey === 4326) {
                    mBounds = forEachCoordinatesOfExtent(extent, 'forward');
                }
                if (geoInfo && geoInfo.ProjectedCSTypeGeoKey === 3857) {
                    bounds = forEachCoordinatesOfExtent(extent, 'inverse');
                    forEachCoordinatesOfExtent(extent, 'inverse', extent);
                }
                this.geoTifInfo = Object.assign(this.geoTifInfo, {
                    width, height, bounds, extent, mBounds
                });
                this.readTif(image);
            });
        }).catch(error => {
            console.log(error);
        });
    }

    readTif(image) {
        const width = image.getWidth();
        const height = image.getHeight();
        const rowHeight = 400;
        const row = Math.ceil(height / rowHeight);
        const datas = [];
        let idx = 0;
        const read = () => {
            if (idx < row) {
                if (this.options.datadebug) {
                    console.log(`正在读取(by geotiff.readRGB) tif的数据 ${idx + 1}/${row}`);
                }
                if (!this.geoTifInfo.bounds) {
                    return;
                }
                const top = idx * rowHeight, bottom = Math.min(top + rowHeight, height);
                image.readRGB({ interleave: true, window: [0, top, width, bottom], pool }).then(data => {
                    datas.push(data);
                    idx++;
                    read();
                });
            } else {
                if (!this.geoTifInfo.bounds) {
                    return;
                }
                this.geoTifInfo.data = mergeArrayBuffer(datas);
                if (!Browser.decodeImageInWorker) {
                    this.geoTifInfo.canvas = createImage(width, height, this.geoTifInfo.data);
                    this.geoTifInfo.loaded = true;
                    this.fire('tifload', Object.assign({}, this.geoTifInfo));
                    this._tifLoaded();
                } else {
                    const actor = getActor();
                    const arrayBuffer = this.geoTifInfo.data.buffer;
                    actor.send({ width, height, type: 'createimage', url: this.geoTifInfo.url, buffer: arrayBuffer },
                        [arrayBuffer], (err, message) => {
                            if (err) {
                                console.error(err);
                                return;
                            }
                            this.geoTifInfo.loaded = message.loaded;
                            this.geoTifInfo.canvas = message.buffer;
                            this.fire('tifload', Object.assign({}, this.geoTifInfo));
                            this._tifLoaded();
                        });
                }
            }
        };
        read();
    }

    getImageBounds(x, y, z, bounds) {
        const extent = this._getTileExtent(x, y, z);
        const tileminx = extent.xmin, tileminy = extent.ymin, tilemaxx = extent.xmax, tilemaxy = extent.ymax;
        const { width, height } = this.geoTifInfo;
        const [minx, miny, maxx, maxy] = bounds;
        const ax = width / (maxx - minx), ay = height / (maxy - miny);
        const px = (tileminx - minx) * ax, py = height - (tilemaxy - miny) * ay;
        const w = (tilemaxx - tileminx) * ax, h = (tilemaxy - tileminy) * ay;
        return [px, py, w, h].map(v => {
            return Math.round(v);
        });

    }

    _getTileExtent(x, y, z) {
        const map = this.getMap(),
            res = map._getResolution(z),
            tileConfig = this._getTileConfig(),
            tileExtent = tileConfig.getTilePrjExtent(x, y, res);
        return tileExtent;
    }

    setTifUrl(url) {
        this.options.tifUrl = url;
        this.geoTifInfo = {};
        this._pendingTiles = [];
        this._initTif();
        this.getRenderer().clear();
        this.getRenderer().setToRedraw();
        return this;
    }
}
TifLayer.mergeOptions(options);
