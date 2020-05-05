<script>
  import Map from "./Map.svelte";
  import Marker from "./Marker.svelte";

  function called() {
    console.log("Clicked");
  }
</script>

<main>
  <Map center="50.879, 4.6997" zoom="12" width="600" height="400">
    <Marker anchor="50.879, 4.6997" onClick={called} />
  </Map>
</main>
