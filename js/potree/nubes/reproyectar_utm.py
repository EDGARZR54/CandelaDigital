import laspy
import numpy as np
from pyproj import Transformer

INPUT_PATH  = r"D:\CandelaDigital\CandelaDigital\js\potree\nubes\15m.las"
OUTPUT_PATH = r"D:\CandelaDigital\CandelaDigital\js\potree\nubes\15m_utm14n.las"

# EPSG:4326 = WGS84 (lon/lat en grados, tal como venia el archivo original)
# EPSG:32614 = WGS 84 / UTM zone 14N (metros, cubre CDMX)
transformer = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True)

las = laspy.read(INPUT_PATH)

print("Total de puntos:", len(las.points))
print("Rango original (lon, lat, alt):")
print("  lon:", las.x.min(), "a", las.x.max())
print("  lat:", las.y.min(), "a", las.y.max())
print("  alt:", las.z.min(), "a", las.z.max())

# las.x / las.y ya vienen en grados (lon/lat) porque el header original
# los declara con scale 1e-8, que sí es correcto para grados WGS84.
lon = np.asarray(las.x)
lat = np.asarray(las.y)
alt = np.asarray(las.z)

# Reproyeccion real punto por punto (geodesicamente correcta)
easting, northing = transformer.transform(lon, lat)

print()
print("Rango reproyectado UTM 14N (metros):")
print("  Easting :", easting.min(), "a", easting.max(), " -> extension:", easting.max()-easting.min())
print("  Northing:", northing.min(), "a", northing.max(), " -> extension:", northing.max()-northing.min())
print("  Altura  :", alt.min(), "a", alt.max(), " -> extension:", alt.max()-alt.min())

# Nuevo header con scale/offset apropiados para las nuevas coordenadas en metros
new_header = laspy.LasHeader(point_format=las.header.point_format, version=las.header.version)
new_header.scales = [0.001, 0.001, 0.001]
new_header.offsets = [np.floor(easting.min()), np.floor(northing.min()), np.floor(alt.min())]

new_las = laspy.LasData(new_header)

# Copiamos el resto de los campos (intensidad, rgb, clasificacion, etc.)
for dim_name in las.point_format.dimension_names:
    if dim_name not in ("X", "Y", "Z"):
        setattr(new_las, dim_name, las[dim_name])

new_las.x = easting
new_las.y = northing
new_las.z = alt

new_las.write(OUTPUT_PATH)
print()
print("Archivo reproyectado guardado en:", OUTPUT_PATH)
print("CRS: EPSG:32614 (WGS 84 / UTM zone 14N)")
