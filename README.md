# pigeon-maps

A vanilla JS version of the popular ReactJS Pigeon Maps, without the ReactJS bit.

No dependencies. Nilche.

Pigeon Maps is really cool. It offered a massive reduction in filesize (down to 20KB min/7KB gzip excluding marker lib) over products like Google Maps and Mapbox. But, it still has dependency on React/ReactDOM. These are around an additional 40KB gzip of library. Out of curiousity, is it possible to just release a stand-alone pigeon maps, with _just_ the 7KB file size to have it on a page.

Answer: So far we've bundled in the marker component and it is 28KB min/10KB gzip. This provides a good working map for ~10KB.

Svelte offers a way to compile to vanilla JS, without the need for React/ReactDOM, allowing you to shed that requirement and use Pigeon Maps in other use cases.

## Tasks

The following tasks are in progress for an initial release.

- shows a map/tiles (done)
- wheel/zoom around (done)
- drag pan (done)
- attribution (e.g. osm requirements) (done)
- warnings (done)
- overlays (done)
- markers (done)
- prop callbacks
- touch interaction (in progress)
- event listeners - switch to dispatcher for standard events emit pattern
- web-component example
- packed as component lib
- webpack deployment

## Example

### In Svelte

```html
<script>
  import Map from "./Map.svelte";
  import Marker from "./Marker.svelte";
</script>

<main>
  <map center="{[50.879," 4.6997]} zoom="{12}" width="{600}" height="{400}">
    <Marker anchor="{[50.879," 4.6997]} />
  </map>
</main>
```

### Web Components

Example coming..

## Developing

```
npm clone https://github.com/AlpacaTravel/svelte-pigeon-maps.git
cd svelte-pigeon-maps
npm install
npm run dev
```

## See Also

- [https://github.com/mariusandra/pigeon-maps](https://github.com/mariusandra/pigeon-maps)
