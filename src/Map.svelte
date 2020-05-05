<script>
  import { onMount, onDestroy, afterUpdate } from "svelte";
  import { writable } from "svelte/store";

  import Attribution from "./Attribution.svelte";
  import Overlays from "./Overlays.svelte";
  import Tiles from "./Tiles.svelte";
  import Warning from "./Warning.svelte";

  import parentPosition from "./utils/parent-position";
  import parentHasClass from "./utils/parent-has-class";
  import debounce from "./utils/debounce";

  const ANIMATION_TIME = 300;
  const DIAGONAL_THROW_TIME = 1500;
  const SCROLL_PIXELS_FOR_ZOOM_LEVEL = 150;
  const MIN_DRAG_FOR_THROW = 40;
  const CLICK_TOLERANCE = 2;
  const DOUBLE_CLICK_DELAY = 300;
  const DEBOUNCE_DELAY = 60;
  const PINCH_RELEASE_THROW_DELAY = 300;
  const WARNING_DISPLAY_TIMEOUT = 300;

  function osm(x, y, z) {
    const s = String.fromCharCode(97 + ((x + y + z) % 3));
    return `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }

  function stamenToner(x, y, z, dpr) {
    return `https://stamen-tiles.a.ssl.fastly.net/toner/${z}/${x}/${y}${
      dpr >= 2 ? "@2x" : ""
    }.png`;
  }

  // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
  const lng2tile = (lon, _zoom) => ((lon + 180) / 360) * Math.pow(2, _zoom);
  const lat2tile = (lat, _zoom) =>
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    Math.pow(2, _zoom);

  function tile2lng(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }

  function tile2lat(y, z) {
    var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function getMousePixel(dom, event) {
    const parent = parentPosition(dom);
    return [event.clientX - parent.x, event.clientY - parent.y];
  }

  function easeOutQuad(t) {
    return t * (2 - t);
  }

  // minLat, maxLat, minLng, maxLng
  const absoluteMinMax = [
    tile2lat(Math.pow(2, 10), 10),
    tile2lat(0, 10),
    tile2lng(0, 10),
    tile2lng(Math.pow(2, 10), 10)
  ];

  const hasWindow = typeof window !== "undefined";

  const performanceNow =
    hasWindow && window.performance && window.performance.now
      ? () => window.performance.now()
      : (() => {
          const timeStart = new Date().getTime();
          return () => new Date().getTime() - timeStart;
        })();

  const requestAnimationFrame = hasWindow
    ? window.requestAnimationFrame || window.setTimeout
    : callback => callback();
  const cancelAnimationFrame = hasWindow
    ? window.cancelAnimationFrame || window.clearTimeout
    : () => {};

  function srcSet(dprs, url, x, y, z) {
    if (!dprs || dprs.length === 0) {
      return "";
    }
    return dprs
      .map(dpr => url(x, y, z, dpr) + (dpr === 1 ? "" : ` ${dpr}x`))
      .join(", ");
  }

  // Props
  export let center;
  export let defaultCenter;
  export let zoom;
  export let defaultZoom;
  export let width;
  export let defaultWidth;
  export let height;
  export let defaultHeight;
  export let provider;
  export let dprs = [];
  export let children;
  export let animate = true;
  export let animateMaxScreens = 5;
  export let minZoom = 1;
  export let maxZoom = 18;
  export let metaWheelZoom = false;
  export let metaWheelZoomWarning = "Use META+wheel to zoom!";
  export let twoFingerDrag = false;
  export let twoFingerDragWarning = "Use two fingers to move the map";
  export let warningZIndex = 100;
  export let attribution = true;
  export let attributionPrefix;
  export let zoomSnap = true;
  export let mouseEvents = true;
  export let touchEvents = true;
  export let onClick = null;
  export let onBoundsChanged = null;
  export let onAnimationStart = null;
  export let onAnimationStop = null;
  export let limitBounds = "center";

  // Internal component state
  let mousePosition = null;
  let dragStart = null;
  let mouseDown = false;
  let moveEvents = [];
  let lastClick = null;
  let lastTap = null;
  let touchStartPixel = null;
  let touchStartMidPoint = null;
  let touchStartDistance = null;

  let isAnimating = false;
  let animationStart = null;
  let animationEnd = null;
  let centerTarget = null;
  let zoomTarget = null;

  let lastZoom = defaultZoom ? defaultZoom : zoom;
  let lastCenter = defaultCenter ? defaultCenter : center;
  let boundsSynced = false;
  let minMaxCache = null;

  let animFrame = null;
  let centerStart = null;
  let zoomStart = null;
  let secondTouchEnd = null;
  let warningClearTimeout = null;

  let loadTracker = {};
  let zoomAround;

  // Detect changes of center/zoom for updating
  let prevCenter;
  let prevZoom;

  // Component ref
  let containerElement = null;

  // Store for state
  const state = writable({
    zoom: lastZoom,
    center: lastCenter,
    width: width || defaultWidth,
    height: height || defaultHeight,
    zoomDelta: 0,
    pixelDelta: null,
    oldTiles: [],
    showWarning: false,
    warningType: null
  });

  // State updates
  let stateCenter;
  let stateZoom;
  let stateWidth;
  let stateHeight;
  let stateOldTiles;
  let statePixelDelta;
  let stateZoomDelta;
  let stateShowWarning;
  let stateWarningType;
  state.subscribe(value => {
    stateCenter = value.center;
    stateZoom = value.zoom;
    stateWidth = value.width;
    stateHeight = value.height;
    stateOldTiles = value.oldTiles;
    statePixelDelta = value.pixelDelta;
    stateZoomDelta = value.zoomDelta;
    stateShowWarning = value.showWarning;
    stateWarningType = value.warningType;
  });

  onMount(function() {
    // Bindings are done with window on:...

    if (!width || !height) {
      if (!updateWidthHeight()) {
        requestAnimationFrame(updateWidthHeight);
      }
    }

    debouncedSyncToProps();
  });

  onDestroy(function() {
    // Bindings will be removed automatically
  });

  function updateWidthHeight() {
    if (containerElement) {
      const rect = containerElement.getBoundingClientRect();

      if (rect && rect.width > 0 && rect.height > 0) {
        state.update(currentState => ({
          ...currentState,
          width: rect.width,
          height: rect.height
        }));
        return true;
      }
    }
    return false;
  }

  function setCenterZoomTarget(
    _center,
    _zoom,
    _fromProps,
    _zoomAround,
    _animationDuration = ANIMATION_TIME
  ) {
    if (
      animate &&
      (!_fromProps ||
        distanceInScreens(_center, _zoom, stateCenter, stateZoom) <=
          animateMaxScreens)
    ) {
      if (isAnimating) {
        cancelAnimationFrame(animFrame);
        const { centerStep, zoomStep } = animationStep(performanceNow());
        centerStart = centerStep;
        zoomStart = zoomStep;
      } else {
        isAnimating = true;
        centerStart = limitCenterAtZoom(
          [lastCenter[0], lastCenter[1]],
          lastZoom
        );
        zoomStart = lastZoom;
        onAnimationStartFn();
      }

      animationStart = performanceNow();
      animationEnd = animationStart + _animationDuration;

      if (_zoomAround) {
        zoomAround = _zoomAround;
        centerTarget = calculateZoomCenter(
          lastCenter,
          _zoomAround,
          lastZoom,
          _zoom
        );
      } else {
        zoomAround = null;
        centerTarget = _center;
      }
      zoomTarget = _zoom;

      animFrame = requestAnimationFrame(animateFn);
    } else {
      stopAnimating();

      if (_zoomAround) {
        calculatedCenter = calculateZoomCenter(
          lastCenter,
          _zoomAround,
          lastZoom,
          _zoom
        );
        setCenterZoom(calculatedCenter, _zoom, _fromProps);
      } else {
        setCenterZoom(_center, _zoom, _fromProps);
      }
    }
  }

  function distanceInScreens(_centerTarget, _zoomTarget, _center, _zoom) {
    // distance in pixels at the current zoom level
    const l1 = latLngToPixel(_center, _center, _zoom);
    const l2 = latLngToPixel(_centerTarget, _center, _zoom);

    // distance in pixels at the target zoom level (could be the same)
    const z1 = latLngToPixel(_center, _center, _zoomTarget);
    const z2 = latLngToPixel(_centerTarget, _center, _zoomTarget);

    // take the average between the two and divide by width or height to get the distance multiplier in screens
    const w =
      (Math.abs(l1[0] - l2[0]) + Math.abs(z1[0] - z2[0])) / 2 / stateWidth;
    const h =
      (Math.abs(l1[1] - l2[1]) + Math.abs(z1[1] - z2[1])) / 2 / stateHeight;

    // return the distance
    return Math.sqrt(w * w + h * h);
  }

  function animationStep(timestamp) {
    const length = animationEnd - animationStart;
    const progress = Math.max(timestamp - animationStart, 0);
    const percentage = easeOutQuad(progress / length);

    const zoomDiff = (zoomTarget - zoomStart) * percentage;
    const zoomStep = zoomStart + zoomDiff;

    if (zoomAround) {
      const centerStep = calculateZoomCenter(
        centerStart,
        zoomAround,
        zoomStart,
        zoomStep
      );

      return { centerStep, zoomStep };
    } else {
      const centerStep = [
        centerStart[0] + (centerTarget[0] - centerStart[0]) * percentage,
        centerStart[1] + (centerTarget[1] - centerStart[1]) * percentage
      ];

      return { centerStep, zoomStep };
    }
  }

  function animateFn(timestamp) {
    if (timestamp >= animationEnd) {
      isAnimating = false;
      setCenterZoom(centerTarget, zoomTarget, true);
      onAnimationStopFn();
    } else {
      const { centerStep, zoomStep } = animationStep(timestamp);
      setCenterZoom(centerStep, zoomStep);
      animFrame = requestAnimationFrame(animateFn);
    }
  }

  function stopAnimating() {
    if (isAnimating) {
      isAnimating = false;
      onAnimationStopFn();
      cancelAnimationFrame(animFrame);
    }
  }

  function limitCenterAtZoom(_center, _zoom) {
    // [minLat, maxLat, minLng, maxLng]
    const minMax = getBoundsMinMax(_zoom || stateZoom);

    return [
      Math.max(
        Math.min(isNaN(_center[0]) ? stateCenter[0] : _center[0], minMax[1]),
        minMax[0]
      ),
      Math.max(
        Math.min(isNaN(_center[1]) ? stateCenter[1] : _center[1], minMax[3]),
        minMax[2]
      )
    ];
  }

  function onAnimationStartFn() {
    onAnimationStart && onAnimationStartFn();
  }

  function onAnimationStopFn() {
    onAnimationStop && onAnimationStop();
  }

  function setCenterZoom(_center, _zoom, _animationEnded = false) {
    const limitedCenter = limitCenterAtZoom(_center, _zoom);

    if (Math.round(stateZoom) !== Math.round(_zoom)) {
      const _tileValues = tileValues({
        center: stateCenter,
        zoom: stateZoom,
        width: stateWidth,
        height: stateHeight,
        pixelDelta: statePixelDelta,
        zoomDelta: stateZoomDelta
      });
      const nextValues = tileValues({
        center: limitedCenter,
        zoom: _zoom,
        width: stateWidth,
        height: stateHeight,
        pixelDelta: statePixelDelta,
        zoomDelta: stateZoomDelta
      });
      const oldTiles = stateOldTiles;

      state.update(currentState => ({
        ...currentState,
        oldTiles: currentState.oldTiles
          .filter(o => o.roundedZoom !== _tileValues.roundedZoom)
          .concat(_tileValues)
      }));

      let _loadTracker = {};

      for (let x = nextValues.tileMinX; x <= nextValues.tileMaxX; x++) {
        for (let y = nextValues.tileMinY; y <= nextValues.tileMaxY; y++) {
          let key = `${x}-${y}-${nextValues.roundedZoom}`;
          _loadTracker[key] = false;
        }
      }

      loadTracker = _loadTracker;
    }

    state.update(currentState => ({
      ...currentState,
      center: limitedCenter,
      zoom: _zoom
    }));

    const maybeZoom = zoom ? zoom : lastZoom;
    const maybeCenter = center ? center : lastCenter;
    if (
      _animationEnded ||
      Math.abs(maybeZoom - _zoom) > 0.001 ||
      Math.abs(maybeCenter[0] - limitedCenter[0]) > 0.00001 ||
      Math.abs(maybeCenter[1] - limitedCenter[1]) > 0.00001
    ) {
      lastZoom = _zoom;
      lastCenter = [...limitedCenter];
      debouncedSyncToProps(limitedCenter, _zoom);
    }
  }

  function getBoundsMinMax(_zoom) {
    if (limitBounds === "center") {
      return absoluteMinMax;
    }

    if (
      minMaxCache &&
      minMaxCache[0] === _zoom &&
      minMaxCache[1] === stateWidth &&
      minMaxCache[2] === stateHeight
    ) {
      return minMaxCache[3];
    }

    const pixelsAtZoom = Math.pow(2, _zoom) * 256;

    const minLng =
      stateWidth > pixelsAtZoom ? 0 : tile2lng(stateWidth / 512, _zoom); // x
    const minLat =
      stateHeight > pixelsAtZoom
        ? 0
        : tile2lat(Math.pow(2, _zoom) - stateHeight / 512, _zoom); // y

    const maxLng =
      stateWidth > pixelsAtZoom
        ? 0
        : tile2lng(Math.pow(2, _zoom) - stateWidth / 512, _zoom); // x
    const maxLat =
      stateHeight > pixelsAtZoom ? 0 : tile2lat(stateHeight / 512, _zoom); // y

    const minMax = [minLat, maxLat, minLng, maxLng];

    minMaxCache = [_zoom, stateWidth, stateHeight, minMax];

    return minMax;
  }

  function imageLoaded(key) {
    if (loadTracker && key in loadTracker) {
      loadTracker[key] = true;

      const unloadedCount = Object.keys(loadTracker).filter(
        k => !loadTracker[k]
      ).length;

      if (unloadedCount === 0) {
        state.update(currentState => ({
          ...currentState,
          oldTiles: []
        }));
      }
    }
  }

  function coordsInside(pixel) {
    if (
      pixel[0] < 0 ||
      pixel[1] < 0 ||
      pixel[0] >= stateWidth ||
      pixel[1] >= stateHeight
    ) {
      return false;
    }

    const parent = containerElement;
    const pos = parentPosition(parent);
    const element = document.elementFromPoint(
      pixel[0] + pos.x,
      pixel[1] + pos.y
    );

    return parent === element || parent.contains(element);
  }

  function handleTouchStart(event) {
    if (!containerElement) {
      return;
    }
    if (event.target && parentHasClass(event.target, "pigeon-drag-block")) {
      return;
    }
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const pixel = getMousePixel(containerElement, touch);

      if (coordsInside(pixel)) {
        touchStartPixel = [pixel];

        if (!twoFingerDrag) {
          stopAnimating();

          if (lastTap && performanceNow() - lastTap < DOUBLE_CLICK_DELAY) {
            event.preventDefault();
            const latLngNow = pixelToLatLng(touchStartPixel[0]);
            setCenterZoomTarget(
              null,
              Math.max(minZoom, Math.min(stateZoom + 1, maxZoom)),
              false,
              latLngNow
            );
          } else {
            lastTap = performanceNow();
            trackMoveEvents(pixel);
          }
        }
      }
      // added second finger and first one was in the area
    } else if (event.touches.length === 2 && touchStartPixel) {
      event.preventDefault();

      stopTrackingMoveEvents();

      if (statePixelDelta || stateZoomDelta) {
        sendDeltaChange();
      }

      const t1 = getMousePixel(containerElement, event.touches[0]);
      const t2 = getMousePixel(containerElement, event.touches[1]);

      touchStartPixel = [t1, t2];
      touchStartMidPoint = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
      touchStartDistance = Math.sqrt(
        Math.pow(t1[0] - t2[0], 2) + Math.pow(t1[1] - t2[1], 2)
      );
    }
  }

  function handleTouchMove(event) {
    if (!containerElement) {
      touchStartPixel = null;
      return;
    }
    if (event.touches.length === 1 && touchStartPixel) {
      const touch = event.touches[0];
      const pixel = getMousePixel(containerElement, touch);

      if (twoFingerDrag) {
        if (coordsInside(pixel)) {
          showWarning("fingers");
        }
      } else {
        event.preventDefault();
        trackMoveEvents(pixel);

        state.update(currentState => ({
          ...currentState,
          pixelDelta: [
            pixel[0] - touchStartPixel[0][0],
            pixel[1] - touchStartPixel[0][1]
          ]
        }));
      }
    } else if (event.touches.length === 2 && touchStartPixel) {
      event.preventDefault();

      const t1 = getMousePixel(containerElement, event.touches[0]);
      const t2 = getMousePixel(containerElement, event.touches[1]);

      const midPoint = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
      const midPointDiff = [
        midPoint[0] - touchStartMidPoint[0],
        midPoint[1] - touchStartMidPoint[1]
      ];

      const distance = Math.sqrt(
        Math.pow(t1[0] - t2[0], 2) + Math.pow(t1[1] - t2[1], 2)
      );

      const zoomDelta =
        Math.max(
          minZoom,
          Math.min(
            maxZoom,
            stateZoom + Math.log2(distance / touchStartDistance)
          )
        ) - stateZoom;
      const scale = Math.pow(2, zoomDelta);

      const centerDiffDiff = [
        (stateWidth / 2 - midPoint[0]) * (scale - 1),
        (stateHeight / 2 - midPoint[1]) * (scale - 1)
      ];

      state.update(currentState => ({
        ...currentState,
        zoomDelta,
        pixelDelta: [
          centerDiffDiff[0] + midPointDiff[0] * scale,
          centerDiffDiff[1] + midPointDiff[1] * scale
        ]
      }));
    }
  }

  function handleTouchEnd(event) {
    if (!containerElement) {
      touchStartPixel = null;
      return;
    }
    if (touchStartPixel) {
      const { center: _center, zoom: _zoom } = sendDeltaChange();

      if (event.touches.length === 0) {
        if (twoFingerDrag) {
          clearWarning();
        } else {
          // if the click started and ended at about
          // the same place we can view it as a click
          // and not prevent default behavior.
          const oldTouchPixel = touchStartPixel[0];
          const newTouchPixel = getMousePixel(
            containerElement,
            event.changedTouches[0]
          );

          if (
            Math.abs(oldTouchPixel[0] - newTouchPixel[0]) > CLICK_TOLERANCE ||
            Math.abs(oldTouchPixel[1] - newTouchPixel[1]) > CLICK_TOLERANCE
          ) {
            // don't throw immediately after releasing the second finger
            if (
              !secondTouchEnd ||
              performanceNow() - secondTouchEnd > PINCH_RELEASE_THROW_DELAY
            ) {
              event.preventDefault();
              throwAfterMoving(newTouchPixel, _center, _zoom);
            }
          }

          touchStartPixel = null;
          secondTouchEnd = null;
        }
      } else if (event.touches.length === 1) {
        event.preventDefault();
        const touch = getMousePixel(containerElement, event.touches[0]);

        secondTouchEnd = performanceNow();
        touchStartPixel = [touch];
        trackMoveEvents(touch);

        if (zoomSnap) {
          // if somehow we have no midpoint for the two finger touch, just take the center of the map
          const latLng = touchStartMidPoint
            ? pixelToLatLng(touchStartMidPoint)
            : stateCenter;

          let zoomTarget;

          // do not zoom up/down if we must drag with 2 fingers and didn't change the zoom level
          if (
            twoFingerDrag &&
            Math.round(stateZoom) === Math.round(stateZoom + stateZoomDelta)
          ) {
            zoomTarget = Math.round(stateZoom);
          } else {
            zoomTarget =
              zoomDelta > 0 ? Math.ceil(stateZoom) : Math.floor(stateZoom);
          }
          const zoom = Math.max(minZoom, Math.min(zoomTarget, maxZoom));

          setCenterZoomTarget(latLng, _zoom, false, latLng);
        }
      }
    }
  }

  function handleMouseDown(event) {
    if (!containerElement) {
      return;
    }
    const pixel = getMousePixel(containerElement, event);

    if (
      event.button === 0 &&
      (!event.target || !parentHasClass(event.target, "pigeon-drag-block")) &&
      coordsInside(pixel)
    ) {
      stopAnimating();
      event.preventDefault();

      if (lastClick && performanceNow() - lastClick < DOUBLE_CLICK_DELAY) {
        const latLngNow = pixelToLatLng(mousePosition || pixel);

        setCenterZoomTarget(
          null,
          Math.max(minZoom, Math.min(stateZoom + 1, maxZoom)),
          false,
          latLngNow
        );
      } else {
        lastClick = performanceNow();

        mouseDown = true;
        dragStart = pixel;
        trackMoveEvents(pixel);
      }
    }
  }

  function handleMouseMove(event) {
    if (!containerElement) {
      return;
    }
    mousePosition = getMousePixel(containerElement, event);

    if (mouseDown && dragStart) {
      trackMoveEvents(mousePosition);
      state.update(currentState => ({
        ...currentState,
        pixelDelta: [
          mousePosition[0] - dragStart[0],
          mousePosition[1] - dragStart[1]
        ]
      }));
    }
  }

  function handleMouseUp(event) {
    if (!containerElement) {
      mouseDown = false;
      return;
    }

    if (mouseDown) {
      mouseDown = false;

      const pixel = getMousePixel(containerElement, event);

      if (
        onClick &&
        (!event.target ||
          !parentHasClass(event.target, "pigeon-click-block")) &&
        (!statePixelDelta ||
          Math.abs(statePixelDelta[0]) + Math.abs(statePixelDelta[1]) <=
            CLICK_TOLERANCE)
      ) {
        const latLng = pixelToLatLng(pixel);
        onClick({ event, latLng, pixel: pixel });
        state.update(currentState => ({
          ...currentState,
          pixelDelta: null
        }));
      } else {
        const { center: _center, zoom: _zoom } = sendDeltaChange();

        throwAfterMoving(pixel, _center, _zoom);
      }
    }
  }

  // https://www.bennadel.com/blog/1856-using-jquery-s-animate-step-callback-function-to-create-custom-animations.htm
  function stopTrackingMoveEvents() {
    moveEvents = [];
  }

  function trackMoveEvents(coords) {
    const timestamp = performanceNow();

    if (
      moveEvents.length === 0 ||
      timestamp - moveEvents[moveEvents.length - 1].timestamp > 40
    ) {
      moveEvents.push({ timestamp, coords });
      if (moveEvents.length > 2) {
        moveEvents.shift();
      }
    }
  }

  function throwAfterMoving(coords, _center, _zoom) {
    const timestamp = performanceNow();
    const lastEvent = moveEvents.shift();

    if (lastEvent && animate) {
      const deltaMs = Math.max(timestamp - lastEvent.timestamp, 1);

      const delta = [
        ((coords[0] - lastEvent.coords[0]) / deltaMs) * 120,
        ((coords[1] - lastEvent.coords[1]) / deltaMs) * 120
      ];

      const distance = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);

      if (distance > MIN_DRAG_FOR_THROW) {
        const diagonal = Math.sqrt(
          stateWidth * stateWidth + stateHeight * stateHeight
        );

        const throwTime = (DIAGONAL_THROW_TIME * distance) / diagonal;

        const lng = tile2lng(
          lng2tile(_center[1], _zoom) - delta[0] / 256.0,
          _zoom
        );
        const lat = tile2lat(
          lat2tile(_center[0], _zoom) - delta[1] / 256.0,
          _zoom
        );

        setCenterZoomTarget([lat, lng], _zoom, false, null, throwTime);
      }
    }

    stopTrackingMoveEvents();
  }

  function sendDeltaChange() {
    let lat = stateCenter[0];
    let lng = stateCenter[1];

    if (statePixelDelta || stateZoomDelta !== 0) {
      lng = tile2lng(
        lng2tile(stateCenter[1], stateZoom + stateZoomDelta) -
          (statePixelDelta ? statePixelDelta[0] / 256.0 : 0),
        stateZoom + stateZoomDelta
      );
      lat = tile2lat(
        lat2tile(stateCenter[0], stateZoom + stateZoomDelta) -
          (statePixelDelta ? statePixelDelta[1] / 256.0 : 0),
        stateZoom + stateZoomDelta
      );
      setCenterZoom([lat, lng], stateZoom + stateZoomDelta);
    }

    state.update(currentState => ({
      ...currentState,
      pixelDelta: null,
      zoomDelta: 0
    }));

    return {
      center: limitCenterAtZoom([lat, lng], stateZoom + stateZoomDelta),
      zoom: stateZoom + stateZoomDelta
    };
  }

  function getBounds(_center = stateCenter, _zoom = zoomPlusDelta()) {
    return {
      ne: pixelToLatLng([stateWidth - 1, 0], _center, _zoom),
      sw: pixelToLatLng([0, stateHeight - 1], _center, _zoom)
    };
  }

  function syncToProps(_center = stateCenter, _zoom = stateZoom) {
    if (onBoundsChanged) {
      const bounds = getBounds(_center, _zoom);

      onBoundsChanged({
        center: _center,
        zoom: _zoom,
        bounds,
        initial: !boundsSynced
      });

      boundsSynced = true;
    }
  }

  const debouncedSyncToProps = debounce(syncToProps, DEBOUNCE_DELAY);

  function handleWheel(event) {
    if (!mouseEvents) {
      return;
    }

    if (!metaWheelZoom || event.metaKey) {
      event.preventDefault();

      const addToZoom = -event.deltaY / SCROLL_PIXELS_FOR_ZOOM_LEVEL;

      if (!zoomSnap && zoomTarget) {
        const stillToAdd = zoomTarget - stateZoom;
        zoomAroundMouse(addToZoom + stillToAdd, event);
      } else {
        if (animate) {
          zoomAroundMouse(addToZoom, event);
        } else {
          if (!lastWheel || performanceNow() - lastWheel > ANIMATION_TIME) {
            lastWheel = performanceNow();
            zoomAroundMouse(addToZoom, event);
          }
        }
      }
    } else {
      showWarning("wheel");
    }
  }

  function showWarning(warningType) {
    if (!stateShowWarning || stateWarningType !== warningType) {
      state.update(currentState => ({
        ...currentState,
        showWarning: true,
        warningType
      }));
    }

    if (warningClearTimeout) {
      window.clearTimeout(warningClearTimeout);
    }
    warningClearTimeout = window.setTimeout(
      clearWarning,
      WARNING_DISPLAY_TIMEOUT
    );
  }

  function clearWarning() {
    if (stateShowWarning) {
      state.update(currentState => ({
        ...currentState,
        showWarning: false
      }));
    }
  }

  function zoomAroundMouse(zoomDiff, event) {
    if (!containerElement) {
      return;
    }
    mousePosition = getMousePixel(containerElement, event);

    if (
      !mousePosition ||
      (stateZoom === minZoom && zoomDiff < 0) ||
      (stateZoom === maxZoom && zoomDiff > 0)
    ) {
      return;
    }

    const latLngNow = pixelToLatLng(mousePosition);

    let zoomTarget = stateZoom + zoomDiff;
    if (zoomSnap) {
      zoomTarget =
        zoomDiff < 0 ? Math.floor(zoomTarget) : Math.ceil(zoomTarget);
    }
    zoomTarget = Math.max(minZoom, Math.min(zoomTarget, maxZoom));

    setCenterZoomTarget(null, zoomTarget, false, latLngNow);
  }

  function zoomPlusDelta() {
    return stateZoom + stateZoomDelta;
  }

  function pixelToLatLng(
    pixel,
    _center = stateCenter,
    _zoom = zoomPlusDelta()
  ) {
    const pointDiff = [
      (pixel[0] - stateWidth / 2 - (statePixelDelta ? statePixelDelta[0] : 0)) /
        256.0,
      (pixel[1] -
        stateHeight / 2 -
        (statePixelDelta ? statePixelDelta[1] : 0)) /
        256.0
    ];

    const tileX = lng2tile(_center[1], _zoom) + pointDiff[0];
    const tileY = lat2tile(_center[0], _zoom) + pointDiff[1];

    return [
      Math.max(
        absoluteMinMax[0],
        Math.min(absoluteMinMax[1], tile2lat(tileY, _zoom))
      ),
      Math.max(
        absoluteMinMax[2],
        Math.min(absoluteMinMax[3], tile2lng(tileX, _zoom))
      )
    ];
  }

  function latLngToPixel(
    latLng,
    _center = stateCenter,
    _zoom = zoomPlusDelta()
  ) {
    const tileCenterX = lng2tile(_center[1], _zoom);
    const tileCenterY = lat2tile(_center[0], _zoom);

    const tileX = lng2tile(latLng[1], _zoom);
    const tileY = lat2tile(latLng[0], _zoom);

    return [
      (tileX - tileCenterX) * 256.0 +
        stateWidth / 2 +
        (statePixelDelta ? statePixelDelta[0] : 0),
      (tileY - tileCenterY) * 256.0 +
        stateHeight / 2 +
        (statePixelDelta ? statePixelDelta[1] : 0)
    ];
  }

  function calculateZoomCenter(_center, coords, oldZoom, newZoom) {
    const pixelBefore = latLngToPixel(coords, _center, oldZoom);
    const pixelAfter = latLngToPixel(coords, _center, newZoom);

    const newCenter = pixelToLatLng(
      [
        stateWidth / 2 + pixelAfter[0] - pixelBefore[0],
        stateHeight / 2 + pixelAfter[1] - pixelBefore[1]
      ],
      _center,
      newZoom
    );

    return limitCenterAtZoom(newCenter, newZoom);
  }

  function tileValues(state) {
    const {
      center: _center,
      zoom: _zoom,
      pixelDelta: _pixelDelta,
      zoomDelta: _zoomDelta,
      width: _width,
      height: _height
    } = state;

    const roundedZoom = Math.round(_zoom + (_zoomDelta || 0));
    const zoomDiff = _zoom + (_zoomDelta || 0) - roundedZoom;

    const scale = Math.pow(2, zoomDiff);
    const scaleWidth = _width / scale;
    const scaleHeight = _height / scale;

    const tileCenterX =
      lng2tile(_center[1], roundedZoom) -
      (_pixelDelta ? _pixelDelta[0] / 256.0 / scale : 0);
    const tileCenterY =
      lat2tile(_center[0], roundedZoom) -
      (_pixelDelta ? _pixelDelta[1] / 256.0 / scale : 0);

    const halfWidth = scaleWidth / 2 / 256.0;
    const halfHeight = scaleHeight / 2 / 256.0;

    const tileMinX = Math.floor(tileCenterX - halfWidth);
    const tileMaxX = Math.floor(tileCenterX + halfWidth);

    const tileMinY = Math.floor(tileCenterY - halfHeight);
    const tileMaxY = Math.floor(tileCenterY + halfHeight);

    return {
      tileMinX,
      tileMaxX,
      tileMinY,
      tileMaxY,
      tileCenterX,
      tileCenterY,
      roundedZoom,
      zoomDelta: _zoomDelta || 0,
      scaleWidth,
      scaleHeight,
      scale
    };
  }

  function updateState(nextState) {
    if (width !== stateWidth || height !== stateHeight) {
      state.update(currentState => ({
        ...currrentState,
        width,
        height
      }));
    }
  }

  function updateStateViewport() {
    if (!prevCenter || !prevZoom) {
      prevCenter = center;
      prevZoom = prevZoom;
      return;
    }

    if (!center && !zoom) {
      // if the user isn't controlling neither zoom nor center we don't have to update.
      return;
    }
    if (
      (!center ||
        (center[0] === prevCenter[0] && center[1] === prevCenter[1])) &&
      zoom === prevZoom
    ) {
      // if the user is controlling either zoom or center but nothing changed
      // we don't have to update aswell
      return;
    }

    const currentCenter = isAnimating ? centerTarget : stateCenter;
    const currentZoom = isAnimating ? zoomTarget : stateZoom;

    const nextCenter = center || currentCenter; // prevent the rare null errors
    const nextZoom = zoom || currentZoom;

    if (
      Math.abs(nextZoom - currentZoom) > 0.001 ||
      Math.abs(nextCenter[0] - currentCenter[0]) > 0.0001 ||
      Math.abs(nextCenter[1] - currentCenter[1]) > 0.0001
    ) {
      setCenterZoomTarget(nextCenter, nextZoom, true);
    }

    prevCenter = center;
    prevZoom = zoom;
  }

  $: width, height && updateState();
  $: center, zoom && updateStateViewport();

  // Style checks
  let touchClass = touchEvents
    ? twoFingerDrag
      ? "mapTouchActionTwoFingerDrag"
      : "mapTouchActionNone"
    : "mapTouchActionAuto";

  let containerWidth = width ? `${stateWidth}px` : "100%";
  let containerHeight = height ? `${stateHeight}px` : "100%";
  let hasSize = !!(stateWidth && stateHeight);
</script>

<style>
  .map {
    position: relative;
    display: inline-block;
    overflow: hidden;
    background: #dddddd;
  }

  .mapTouchActionTwoFingerDrag {
    touch-action: pan-x pan-y;
  }

  .mapTouchActionNone {
    touch-action: none;
  }

  .mapTouchActionAuto {
    touch-action: auto;
  }
</style>

<!-- TODO: Have mouse/touch events optional as per props -->
<svelte:window
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mousemove={handleMouseMove}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  on:resize={updateWidthHeight} />

<div
  bind:this={containerElement}
  on:wheel={handleWheel}
  class="map {touchClass}"
  style="{`width: ${containerWidth};`}
  {`height: ${containerHeight};`}">
  {#if hasSize}
    <Tiles
      {dprs}
      {provider}
      {state}
      {tileValues}
      {imageLoaded}
      mapUrl={osm}
      {srcSet} />
    <Overlays />
    <Attribution {attribution} {attributionPrefix} />
    <Warning />
  {/if}
</div>
