<script>
  export let metaWheelZoom;
  export let metaWheelZoomWarning;
  export let twoFingerDrag;
  export let twoFingerDragWarning;
  export let warningZIndex;
  export let state;

  let showWarning;
  let warningType;
  let width;
  let height;
  state.subscribe(value => {
    showWarning = value.showWarning;
    warningType = value.warningType;
    width = value.width;
    height = value.height;
  });

  let warningText = null;

  const meta =
    typeof window !== "undefined" &&
    window.navigator &&
    window.navigator.platform.toUpperCase().indexOf("MAC") >= 0
      ? "⌘"
      : "⊞";

  function update() {
    warningText = null;
    if (
      (metaWheelZoom && metaWheelZoomWarning) ||
      (twoFingerDrag && twoFingerDragWarning)
    ) {
      warningText = warningText =
        warningType === "fingers" ? twoFingerDragWarning : metaWheelZoomWarning;
    }
  }

  $: state,
    metaWheelZoom,
    metaWheelZoomWarning,
    twoFingerDrag,
    twoFingerDragWarning,
    warningZIndex && update();
</script>

<style>
  .warning {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    pointer-events: none;
    transition: opacity 300ms;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 22;
    font-family: "Arial", sans-serif;
    text-align: center;
  }
</style>

{#if warningText}
  <div
    class="warning"
    style="{`opacity: ${showWarning ? 100 : 0};`}
    {`width: ${width}px;`}
    {`height: ${height}px;`}
    {`z-index: ${warningZIndex};`}">
    {warningText.replace('META', meta)}
  </div>
{/if}
