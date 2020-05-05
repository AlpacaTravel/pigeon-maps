<script>
  import { getContext } from "svelte";
  import { writable } from "svelte/store";

  import { latLng } from "./utils/inputs";
  import { key as contextKey, getOverlayProps } from "./context";

  export let anchor;
  export let offset = [0, 0];
  export let payload;
  export let hover;
  export let onClick;
  export let onContextMenu;
  export let onMouseOver;
  export let onMouseOut;

  const imageOffset = {
    left: 15,
    top: 31
  };

  let top;
  let left;

  const state = writable({
    hover: false
  });

  // Update the position props
  const context = getContext(contextKey);
  let { mapState, latLngToPixel, pixelToLatLng } = context;
  function updateOverlayProps(lngLat) {
    ({ top, left } = getOverlayProps(context, latLng(anchor), offset));
  }

  function eventParameters(event) {
    return {
      event,
      anchor,
      payload
    };
  }

  function handleClick(event) {
    if (onClick) {
      onClick(eventParameters(event));
    }
  }
  function handleContextMenu(event) {
    if (onContextMenu) {
      onContextMenu(eventParameters(event));
    }
  }
  function handleMouseOver() {
    state.update(currentState => ({ ...currentState, hover: true }));
    if (onMouseOver) {
      onMouseOver(eventParameters(event));
    }
  }
  function handleMouseOut() {
    state.update(currentState => ({ ...currentState, hover: false }));
    if (onMouseOut) {
      onMouseOut(eventParameters(event));
    }
  }

  $: hovered = typeof hover === "boolean" ? hover : $state.hover;

  $: anchor, $mapState && updateOverlayProps();
</script>

<style>
  .pigeon-click-block {
    position: absolute;
  }
</style>

<svelte:options tag="pigeon-marker" />

<div
  class="pigeon-click-block"
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:mouseover={handleMouseOver}
  on:mouseout={handleMouseOut}
  style="{`transform: translate(${left - imageOffset.left}px, ${top - imageOffset.top}px);`}
  {`cursor: ${onClick ? 'pointer' : 'default'};`}">
  {#if hovered}
    <img
      src="marker/pin-hover.png"
      srcset="marker/pin-hover.png 1x, marker/pin-hover@2x.png 2x"
      alt=""
      width="29"
      height="34" />
  {:else}
    <img
      src="marker/pin.png"
      srcset="marker/pin.png 1x, marker/pin@2x.png 2x"
      alt=""
      width="29"
      height="34" />
  {/if}
</div>
