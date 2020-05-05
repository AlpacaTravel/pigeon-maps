import App from "./App.svelte";

const app = new App({
  target: document.body,
  props: {
    metaWheelZoom: true,
  },
});

export default app;
