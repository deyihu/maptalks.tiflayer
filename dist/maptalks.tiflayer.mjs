/*!
 * maptalks.tiflayer v0.1.0
  */
import { registerWorkerAdapter, TileLayer, Browser, Util, Extent, worker } from 'maptalks';
import { Pool, fromArrayBuffer } from 'geotiff';

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var sphericalmercator = createCommonjsModule(function (module, exports) {
var SphericalMercator = (function(){

// Closures including constants and other precalculated values.
var cache = {},
    D2R = Math.PI / 180,
    R2D = 180 / Math.PI,
    // 900913 properties.
    A = 6378137.0,
    MAXEXTENT = 20037508.342789244;

function isFloat(n){
    return Number(n) === n && n % 1 !== 0;
}

// SphericalMercator constructor: precaches calculations
// for fast tile lookups.
function SphericalMercator(options) {
    options = options || {};
    this.size = options.size || 256;
    this.expansion = (options.antimeridian === true) ? 2 : 1;
    if (!cache[this.size]) {
        var size = this.size;
        var c = cache[this.size] = {};
        c.Bc = [];
        c.Cc = [];
        c.zc = [];
        c.Ac = [];
        for (var d = 0; d < 30; d++) {
            c.Bc.push(size / 360);
            c.Cc.push(size / (2 * Math.PI));
            c.zc.push(size / 2);
            c.Ac.push(size);
            size *= 2;
        }
    }
    this.Bc = cache[this.size].Bc;
    this.Cc = cache[this.size].Cc;
    this.zc = cache[this.size].zc;
    this.Ac = cache[this.size].Ac;
}
// Convert lon lat to screen pixel value
//
// - `ll` {Array} `[lon, lat]` array of geographic coordinates.
// - `zoom` {Number} zoom level.
SphericalMercator.prototype.px = function(ll, zoom) {
  if (isFloat(zoom)) {
    var size = this.size * Math.pow(2, zoom);
    var d = size / 2;
    var bc = (size / 360);
    var cc = (size / (2 * Math.PI));
    var ac = size;
    var f = Math.min(Math.max(Math.sin(D2R * ll[1]), -0.9999), 0.9999);
    var x = d + ll[0] * bc;
    var y = d + 0.5 * Math.log((1 + f) / (1 - f)) * -cc;
    (x > ac * this.expansion) && (x = ac * this.expansion);
    (y > ac) && (y = ac);
    //(x < 0) && (x = 0);
    //(y < 0) && (y = 0);
    return [x, y];
  } else {
    var d = this.zc[zoom];
    var f = Math.min(Math.max(Math.sin(D2R * ll[1]), -0.9999), 0.9999);
    var x = Math.round(d + ll[0] * this.Bc[zoom]);
    var y = Math.round(d + 0.5 * Math.log((1 + f) / (1 - f)) * (-this.Cc[zoom]));
    (x > this.Ac[zoom] * this.expansion) && (x = this.Ac[zoom] * this.expansion);
    (y > this.Ac[zoom]) && (y = this.Ac[zoom]);
    //(x < 0) && (x = 0);
    //(y < 0) && (y = 0);
    return [x, y];
  }
};

// Convert screen pixel value to lon lat
//
// - `px` {Array} `[x, y]` array of geographic coordinates.
// - `zoom` {Number} zoom level.
SphericalMercator.prototype.ll = function(px, zoom) {
  if (isFloat(zoom)) {
    var size = this.size * Math.pow(2, zoom);
    var bc = (size / 360);
    var cc = (size / (2 * Math.PI));
    var zc = size / 2;
    var g = (px[1] - zc) / -cc;
    var lon = (px[0] - zc) / bc;
    var lat = R2D * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI);
    return [lon, lat];
  } else {
    var g = (px[1] - this.zc[zoom]) / (-this.Cc[zoom]);
    var lon = (px[0] - this.zc[zoom]) / this.Bc[zoom];
    var lat = R2D * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI);
    return [lon, lat];
  }
};

// Convert tile xyz value to bbox of the form `[w, s, e, n]`
//
// - `x` {Number} x (longitude) number.
// - `y` {Number} y (latitude) number.
// - `zoom` {Number} zoom.
// - `tms_style` {Boolean} whether to compute using tms-style.
// - `srs` {String} projection for resulting bbox (WGS84|900913).
// - `return` {Array} bbox array of values in form `[w, s, e, n]`.
SphericalMercator.prototype.bbox = function(x, y, zoom, tms_style, srs) {
    // Convert xyz into bbox with srs WGS84
    if (tms_style) {
        y = (Math.pow(2, zoom) - 1) - y;
    }
    // Use +y to make sure it's a number to avoid inadvertent concatenation.
    var ll = [x * this.size, (+y + 1) * this.size]; // lower left
    // Use +x to make sure it's a number to avoid inadvertent concatenation.
    var ur = [(+x + 1) * this.size, y * this.size]; // upper right
    var bbox = this.ll(ll, zoom).concat(this.ll(ur, zoom));

    // If web mercator requested reproject to 900913.
    if (srs === '900913') {
        return this.convert(bbox, '900913');
    } else {
        return bbox;
    }
};

// Convert bbox to xyx bounds
//
// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
// - `zoom` {Number} zoom.
// - `tms_style` {Boolean} whether to compute using tms-style.
// - `srs` {String} projection of input bbox (WGS84|900913).
// - `@return` {Object} XYZ bounds containing minX, maxX, minY, maxY properties.
SphericalMercator.prototype.xyz = function(bbox, zoom, tms_style, srs) {
    // If web mercator provided reproject to WGS84.
    if (srs === '900913') {
        bbox = this.convert(bbox, 'WGS84');
    }

    var ll = [bbox[0], bbox[1]]; // lower left
    var ur = [bbox[2], bbox[3]]; // upper right
    var px_ll = this.px(ll, zoom);
    var px_ur = this.px(ur, zoom);
    // Y = 0 for XYZ is the top hence minY uses px_ur[1].
    var x = [ Math.floor(px_ll[0] / this.size), Math.floor((px_ur[0] - 1) / this.size) ];
    var y = [ Math.floor(px_ur[1] / this.size), Math.floor((px_ll[1] - 1) / this.size) ];
    var bounds = {
        minX: Math.min.apply(Math, x) < 0 ? 0 : Math.min.apply(Math, x),
        minY: Math.min.apply(Math, y) < 0 ? 0 : Math.min.apply(Math, y),
        maxX: Math.max.apply(Math, x),
        maxY: Math.max.apply(Math, y)
    };
    if (tms_style) {
        var tms = {
            minY: (Math.pow(2, zoom) - 1) - bounds.maxY,
            maxY: (Math.pow(2, zoom) - 1) - bounds.minY
        };
        bounds.minY = tms.minY;
        bounds.maxY = tms.maxY;
    }
    return bounds;
};

// Convert projection of given bbox.
//
// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
// - `to` {String} projection of output bbox (WGS84|900913). Input bbox
//   assumed to be the "other" projection.
// - `@return` {Object} bbox with reprojected coordinates.
SphericalMercator.prototype.convert = function(bbox, to) {
    if (to === '900913') {
        return this.forward(bbox.slice(0, 2)).concat(this.forward(bbox.slice(2,4)));
    } else {
        return this.inverse(bbox.slice(0, 2)).concat(this.inverse(bbox.slice(2,4)));
    }
};

// Convert lon/lat values to 900913 x/y.
SphericalMercator.prototype.forward = function(ll) {
    var xy = [
        A * ll[0] * D2R,
        A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * ll[1] * D2R)))
    ];
    // if xy value is beyond maxextent (e.g. poles), return maxextent.
    (xy[0] > MAXEXTENT) && (xy[0] = MAXEXTENT);
    (xy[0] < -MAXEXTENT) && (xy[0] = -MAXEXTENT);
    (xy[1] > MAXEXTENT) && (xy[1] = MAXEXTENT);
    (xy[1] < -MAXEXTENT) && (xy[1] = -MAXEXTENT);
    return xy;
};

// Convert 900913 x/y values to lon/lat.
SphericalMercator.prototype.inverse = function(xy) {
    return [
        (xy[0] * R2D / A),
        ((Math.PI*0.5) - 2.0 * Math.atan(Math.exp(-xy[1] / A))) * R2D
    ];
};

return SphericalMercator;

})();

{
    module.exports = exports = SphericalMercator;
}
});

const merc = new sphericalmercator({
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

class TifLayer extends TileLayer {
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

export { TifLayer };
