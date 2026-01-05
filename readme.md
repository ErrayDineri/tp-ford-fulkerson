
# Défi Ford‑Fulkerson — Visualisation du flux maximum

Ce projet est une application pédagogique qui illustre l'algorithme de Ford‑Fulkerson pour le calcul du flux maximum sur un réseau. L'interface permet de jouer des niveaux prédéfinis, construire des graphes personnalisés, ajuster les flux directement sur le canvas et vérifier la conservation du flux (loi de Kirchhoff).

## Fonctionnalités
- Visualisation interactive d'un graphe orienté avec capacités et flux
- 5 niveaux prédéfinis pour apprendre les cas simples à complexes
- Constructeur de graphe personnalisé (2–10 nœuds, arcs avec capacités)
- Édition des valeurs de flux directement sur le canvas (popup sur les étiquettes d'arc)
- Vérification côté serveur du flux maximum (algorithme Ford‑Fulkerson)
- Indications/hints pour chaque niveau

## Structure du projet
- `app.py` : serveur Flask + point d'entrée. Lancé avec Waitress pour la mise en production.
- `requirements.txt` : dépendances Python (Flask, Waitress, ...)
- `templates/index.html` : interface utilisateur principale
- `static/game.js` : logique côté client, rendu canvas, éditeur de graphe
- `static/style.css` : styles et thèmes

## Dépendances
Le projet utilise Python 3.8+ (ou supérieur). Les dépendances sont listées dans `requirements.txt`.

## Installation
1. (Optionnel) Créez et activez un environnement virtuel :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # PowerShell
```

2. Installez les dépendances :

```powershell
pip install -r requirements.txt
```

## Lancer l'application
L'application est configurée pour être servie par Waitress (WSGI). Pour démarrer :

```powershell
python app.py
```

Par défaut le serveur écoute sur `http://localhost:8080`. Ouvrez cette URL dans votre navigateur.

