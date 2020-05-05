<script>
  export let state;
  export let tileValues;
  export let dprs;
  export let mapUrl;
  export let srcSet;
  export let imageLoaded;
  export let boxClassname;

  let localState;
  state.subscribe(value => {
    localState = value;
  });

  let tiles = [];
  let left;
  let top;
  let scaleWidth;
  let scaleHeight;
  let scale;
  let tileMaxX;
  let tileMinX;
  let tileMaxY;
  let tileMinY;
  let tileCenterX;
  let tileCenterY;
  let roundedZoom;
  let finalBoxClassname;

  const updateTiles = () => {
    ({
      tileMinX,
      tileMaxX,
      tileMinY,
      tileMaxY,
      tileCenterX,
      tileCenterY,
      roundedZoom,
      scaleWidth,
      scaleHeight,
      scale
    } = tileValues(localState));

    tiles = [];

    for (let i = 0; i < localState.oldTiles.length; i++) {
      let old = localState.oldTiles[i];
      let zoomDiff = old.roundedZoom - roundedZoom;

      if (Math.abs(zoomDiff) > 4 || zoomDiff === 0) {
        continue;
      }

      let pow = 1 / Math.pow(2, zoomDiff);
      let xDiff = -(tileMinX - old.tileMinX * pow) * 256;
      let yDiff = -(tileMinY - old.tileMinY * pow) * 256;

      let xMin = Math.max(old.tileMinX, 0);
      let yMin = Math.max(old.tileMinY, 0);
      let xMax = Math.min(old.tileMaxX, Math.pow(2, old.roundedZoom) - 1);
      let yMax = Math.min(old.tileMaxY, Math.pow(2, old.roundedZoom) - 1);

      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          tiles.push({
            key: `${x}-${y}-${old.roundedZoom}`,
            url: mapUrl(x, y, old.roundedZoom),
            srcSet: srcSet(dprs, mapUrl, x, y, old.roundedZoom),
            left: xDiff + (x - old.tileMinX) * 256 * pow,
            top: yDiff + (y - old.tileMinY) * 256 * pow,
            width: 256 * pow,
            height: 256 * pow,
            active: false
          });
        }
      }
    }

    let xMin = Math.max(tileMinX, 0);
    let yMin = Math.max(tileMinY, 0);
    let xMax = Math.min(tileMaxX, Math.pow(2, roundedZoom) - 1);
    let yMax = Math.min(tileMaxY, Math.pow(2, roundedZoom) - 1);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({
          key: `${x}-${y}-${roundedZoom}`,
          url: mapUrl(x, y, roundedZoom),
          srcSet: srcSet(dprs, mapUrl, x, y, roundedZoom),
          left: (x - tileMinX) * 256,
          top: (y - tileMinY) * 256,
          width: 256,
          height: 256,
          active: true
        });
      }
    }

    finalBoxClassname = boxClassname || "";

    left = -((tileCenterX - tileMinX) * 256 - scaleWidth / 2);
    top = -((tileCenterY - tileMinY) * 256 - scaleHeight / 2);
  };

  $: localState && updateTiles();
</script>

<style>
  .box {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    will-change: transform;
    transform-origin: top left;
  }

  .tiles {
    position: absolute;
    will-change: transform;
  }

  .tile {
    position: absolute;
    will-change: transform;
    transform-origin: top left;
    opacity: 1;
  }
</style>

<div
  class="box {finalBoxClassname}"
  style="{`width: ${scaleWidth}px;`}
  {`height: ${scaleHeight}px;`}
  {`transform: scale(${scale}, ${scale});`}">
  <div
    class="tiles"
    style="{`width: ${(tileMaxX - tileMinX + 1) * 256}px;`}
    {`height: ${(tileMaxY - tileMinY + 1) * 256}px;`}
    {`transform: translate(${left}px, ${top}px);`}">
    {#each tiles as tile}
      <img
        class="tile"
        src={tile.url}
        srcSet={tile.srcSet}
        width={tile.width}
        height={tile.height}
        loading="lazy"
        alt=""
        on:load={() => imageLoaded(tile.key)}
        style="{`left: ${tile.left}px;`}
        {`top: ${tile.top}px;`}
        {`transform: ${tile.transform};`}" />
    {/each}
  </div>
</div>
