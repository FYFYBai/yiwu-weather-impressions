# YIWU / Weather Maps

Color Map is the home page; /2/ remains an alias. Transparency Map at /transparency/ uses rainfall and sunshine-derived sky proportions to create variable-size, variable-opacity dots. Reflectivity Map at /reflectivity/ is reserved and intentionally blank.

The bundled default is Massing Model v2 (1).3dm. Import another Rhino model, choose a view and generate. PNG and JPEG export are available; reset restores the bundled model. All assets are relative to the GitHub Pages project root.

Rainy days have at least 1 mm precipitation. Of the remaining days, sunshine fraction at least 60% is sunny; the rest is classified as cloudy (a sunshine-derived classification, not observed cloud cover). Missing days are excluded. Color Map waterlogging is a rainfall-derived proxy, not observed flooding.

Three.js 0.180.0, rhino3dm 8.32.1 and Lucide 0.468.0 are bundled locally. Models are processed in the browser. Weather uses Open-Meteo reanalysis with an explicitly labeled real-data archive fallback.

Weather attribution: [Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), CC BY 4.0. The free API is for non-commercial use.

Publish the main branch root with GitHub Pages. No build step is needed.
