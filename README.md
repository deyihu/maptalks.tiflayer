# maptalks.tiflayer

The tif file layer for maptalks

**Currently Experimenting**

[demo](https://deyihu.github.io/maptalks.tiflayer/test/index.html)
[custom tile](https://deyihu.github.io/maptalks.tiflayer/test/custom-tile.html)

## WARNING

* only support `EPSG:4326`,  `EPSG:4490`,  `EPSG:3857` projection
* Only used to load small volume TIF files, Please slice and load large files using TileLayer

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

## Custom Tile Data

Support custom Tile Image data, such as cropping and so on

```js
  const layer = new maptalks.TifLayer('tif', {
      // tifUrl: './test4.tif',
      // debug: true,
      datadebug: true,
      // ignoreBlackColor: true
  })
  layer.on('tifload', e => {
      map.fitExtent(e.extent);
  })

  const tileActor = maptalks.getTileActor();
  const maskId = '青浦区';

  layer.customTileImage = function(image, tile, callback) {
      //do some things
      tileActor.clipTile({
          tile: image,
          tileBBOX: layer._getTileBBox(tile),
          projection: layer.getProjection().code,
          tileSize: layer.getTileSize().width,
          maskId,
      }).then(image => {
          callback(image);
      }).catch(error => {
          //do some things
          console.error(error);
      })
  }
```
