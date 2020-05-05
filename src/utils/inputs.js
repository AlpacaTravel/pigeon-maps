export function latLng(input) {
  if (typeof input === "string") {
    const [latitude, longitude] = input.split(",");
    return [Number(latitude.trim()), Number(longitude.trim())];
  }
  return input;
}

export function dimension(input) {
  if (typeof input === "string" && /^-?\d*\.?\d*$/.test(input)) {
    return input;
  }

  return input;
}
