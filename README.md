# maptalks.tiflayer

The tif file layer for maptalks

**Currently Experimenting**

[demo test](https://deyihu.github.io/maptalks.tiflayer/test/index.html)

## WARNING

- only support `EPSG:4326`,`EPSG:4490`,`EPSG:3857` projection
- Only used to load small volume TIF files,Please slice and load large files using TileLayer

## Install

```sh
npm i maptalks.tiflayer

```

```html
<script type="text/javascript" src="https://unpkg.com/maptalks.tiflayer/dist/maptalks.tiflayer.js"></script>
```

## API

```js
import {
    TifLayer
} from 'maptalks.tiflayer';

const layer = new TifLayer('tiflayer', {
    urlTemplate: './hello?x={x}&y={y}&z={z}',
    datadebug: false,
    quality: 0.6,
    ignoreBlackColor: false
});

layer.setTifUrl(url);
layer.on('tifload', e => {

});
```

```html
<link rel="stylesheet" href="https://unpkg.com/maptalks/dist/maptalks.css">
<script type="text/javascript" src="https://unpkg.com/maptalks/dist/maptalks.min.js"></script>
<script type="text/javascript" src="https://unpkg.com/geotiff/dist-browser/geotiff.js"></script>
<script type="text/javascript" src="https://unpkg.com/maptalks.tiflayer/dist/maptalks.tiflayer.js"></script>
<script>
    // maptalks.Browser.decodeImageInWorker = false;
    var map = new maptalks.Map('map', {
        center: [-0.113049, 51.498568],
        zoom: 11,
        baseLayer: new maptalks.TileLayer('base', {
            urlTemplate: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            subdomains: ["a", "b", "c", "d"],
            attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
        })
    });

    const layer = new maptalks.TifLayer('tif', {
        // tifUrl: './test4.tif',
        // debug: true,
        datadebug: true,
        // ignoreBlackColor: true
    }).addTo(map);
    layer.on('tifload', e => {
        map.fitExtent(e.extent);
    })
    layer.setTifUrl(url);
```
