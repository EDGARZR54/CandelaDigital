# CandelaDigital
Documentación digital y análisis geométrico de cascarones de concreto del modernismo mexicano

cascarones-modernismo/
├── README.md
├── .gitignore
├── Caddyfile
│
├── index.html
├── acerca.html
├── creditos.html
├── mapa/
│   ├── mapa.html
│   ├── style/custom-style.json
│   └── data/edificios.geojson
│
├── edificios/
│   ├── plantilla.html            # una sola plantilla + JS que carga el JSON/MD según slug (?id=)
│   └── router.js
│
├── contenido/
│   └── edificios/
│       ├── los-manantiales.json
│       └── los-manantiales.md
│
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── navbar.css
│   ├── footer.css
│   ├── componentes.css
│   ├── mapa.css
│   ├── visor.css
│   └── edificio.css
│
├── js/
│   ├── navbar.js
│   ├── markdown.js               # wrapper de marked.js
│   ├── models/
│   │   └── paraboloide-hiperbolico.js
│   ├── animations/
│   │   ├── engine.js
│   │   └── camera-paths.js
│   ├── viewer/
│   │   ├── model-viewer.js
│   │   └── pointcloud-viewer.js  # inicializa Potree
│   └── mapa/
│       └── mapa.js
│
├── assets/
│   ├── img/<slug>/
│   ├── models/<slug>/            # .glb solo si NO es procedural
│   └── pointclouds/<slug>/       # potree/ output; crudo/ fuera de git
│
├── scripts/
│   ├── procesar-nube.py          # .las → potree
│   └── generar-geojson.py        # edificios.json → mapa/data/edificios.geojson
│
└── docs/
    ├── fuentes.md
    └── metodologia.md


José Enrique Hernández Díaz| @
José Alfonso Rosas Flores| @
Isaac Medina Zarco | @
Edgar Zambrano Rodríguez| @EDGARZR54
