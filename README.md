# YIWU / Weather Impressions

Standalone publication of the local /2 edition. Import a Rhino .3dm, choose a view, and generate a weather-colored dotted print. PNG and JPEG export are available.

The portrait renderer from the local root page is not included in this repository. All application assets use relative paths so the site works under a GitHub Pages project URL.

Three.js 0.180.0, rhino3dm 8.32.1 and Lucide 0.468.0 are bundled locally. Models are processed in the browser. Weather uses Open-Meteo historical reanalysis, with an explicitly labeled bundled real-data fallback. The purple waterlogging indicator is a rainfall-derived artistic proxy, not observed flooding.

Weather attribution: [Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), CC BY 4.0. The free API is for non-commercial use.

Publish the main branch root with GitHub Pages. No build step is needed.
