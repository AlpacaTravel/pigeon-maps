<script>
  export let attribution;
  export let attributionPrefix;
</script>

<style>
  .attribution {
    position: absolute;
    bottom: 0;
    right: 0;
    font-size: 11px;
    padding: 2px 5px;
    background: rgba(255, 255, 255, 0.7);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #333;
  }

  .link {
    color: #0078a8;
    text-decoration: none;
  }
</style>

{#if attribution}
  <div class="attribution">
    {#if attributionPrefix && attributionPrefix !== false}
      <span>{attributionPrefix} |</span>
    {/if}
    <span>
      &copy;
      <a href="https://www.openstreetmap.org/copyright" class="link">
        OpenStreetMap
      </a>
      contributors
    </span>
  </div>
{/if}
