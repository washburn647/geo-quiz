# Preparing a state's physical geography

`prep-state.py` turns the big public datasets into the small files in `build/sources/derived/`
that `build-maps.mjs` reads for rivers, lakes, cities and villages, and mountains.
The derived files are committed, so this only needs re-running to change what is extracted
or to add a state.

Needs Python with `geopandas`, `pyogrio`, `shapely`, `pillow`, `numpy`.

1. Hydrography: `https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/State/GPKG/NHD_H_<State>_State_GPKG.zip`
2. Names: `https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_<AB>_Text.zip`
3. Elevation tiles: `python fetch-dem.py <west> <south> <east> <north> 12` (Vermont: `-73.6 42.6 -71.3 45.15`)
4. `python prep-state.py vt 50 Vermont 32145 <nhd.gpkg> <DomesticNames_VT.txt>`
   (the number is a metre-based EPSG code for the state, here Vermont State Plane)

Summit heights are read off the elevation tiles (about 30 m cells), so they run a few feet
under surveyed heights. They are used for ranking and shown as "about".
