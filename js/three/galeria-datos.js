/* ==================================================
   galeria-datos.js

   Carga un GeoJSON (FeatureCollection) y lo convierte
   en un array de "elementos" con la forma genérica
   que necesita el motor, usando el adaptador
   "normalizar" que le pasen (ver
   CONFIG.normalizarElemento en galeria-config.js).

   Este módulo no sabe nada de edificios: solo sabe
   leer un FeatureCollection.
================================================== */


export async function cargarElementos(
    dataUrl, normalizar
) {

    const respuesta =
        await fetch(dataUrl);


    if (!respuesta.ok) {

        throw new Error(
            "No se pudo cargar " + dataUrl +
            " (HTTP " + respuesta.status + ")"
        );

    }


    const geojson =
        await respuesta.json();


    if (!Array.isArray(geojson.features)) {

        throw new Error(
            dataUrl +
            " no tiene un array \"features\" " +
            "válido"
        );

    }


    return geojson.features.map(
        (feature, indice) =>
            normalizar(feature, indice)
    );

}
