export const key = {};
export const getOverlayProps = (context, latLng, offset = [0, 0]) => {
  const { overlayOffset, mapState } = context;
  if (!overlayOffset || !latLng) {
    return context;
  }
  // Calculate the top/left
  const { top, left } = overlayOffset(latLng || mapState.center, offset);
  return {
    ...context,
    top,
    left,
  };
};
