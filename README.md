# VLAB — Virtual Innovation Lab (Web to Silicon)

VLAB est une plateforme web permettant d'écrire, compiler et tester du code embarqué pour microcontrôleurs **ESP32** et **STM32**, sans avoir besoin de matériel physique. L'objectif : rendre le développement embarqué accessible directement depuis un navigateur.

## Sommaire

- [Présentation](#présentation)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Détails techniques](#détails-techniques)
- [Problèmes connus / pièges](#problèmes-connus--pièges)
- [Pistes d'amélioration](#pistes-damélioration)
- [Auteurs](#auteurs)

## Présentation

VLAB permet à un développeur d'écrire du code (C/C++) dans un éditeur intégré au navigateur, de le compiler à distance via des conteneurs Docker dédiés à chaque cible (ESP32 / STM32), puis de récupérer le binaire ou les logs de compilation, sans avoir à installer de toolchain en local ni à posséder la carte physique.

## Architecture

Le projet repose sur trois grands blocs :

1. **Frontend** — éditeur de code basé sur **Monaco Editor** (le moteur de VS Code), interface de sélection de cible (ESP32/STM32), affichage des logs et résultats en temps réel.
2. **Backend** — serveur **Node.js**, orchestration des sessions de compilation, communication temps réel avec le frontend via **Socket.io**, exposition d'une **API REST** pour les opérations ponctuelles (récupération de fichiers, statut, etc.).
3. **Conteneurs Docker** — chaque cible de compilation tourne dans son propre conteneur isolé contenant la toolchain adaptée :
   - ESP32 : toolchain FreeRTOS / ESP-IDF
   - STM32 : image `srzzumix/arm-none-eabi`

```
Navigateur (Monaco Editor)
        │  Socket.io / REST
        ▼
   Serveur Node.js
        │  spawn / exec
        ▼
  Conteneurs Docker (par cible)
   ├── ESP32 toolchain
   └── STM32 (arm-none-eabi)
```

## Stack technique

| Composant              | Technologie                       |
|------------------------|-----------------------------------|
| Backend                | Node.js                           |
| Serveur HTTP           | Express 5.2.1                     |
| Communication temps réel | Socket.io 4.8.3               |
| Conteneurisation       | Docker                            |
| Éditeur de code        | Monaco Editor 0.53.0              |
| Identifiants de session| UUID 13.0.0                       |
| Build système STM32    | CMake                             |
| Image STM32            | `srzzumix/arm-none-eabi`          |
| Image ESP32            | `espressif/idf` (FreeRTOS/ESP-IDF)|

## Prérequis

- Node.js (version 18+ recommandée)
- Docker installé et démarré
- Accès réseau pour le pull des images Docker (ESP32 / `srzzumix/arm-none-eabi`)
- Port disponible pour le serveur (configurable dans le fichier de configuration JSON)

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/lasvee/VLAB.git
cd VLAB

# Installer les dépendances
npm install

# Récupérer les images Docker nécessaires
docker pull srzzumix/arm-none-eabi
docker pull espressif/idf
```

## Utilisation

```bash
node server.js
# ou
npm start
```

Puis ouvrir le navigateur à l'adresse `http://localhost:3000` ou `http://127.0.0.1:3000`.

1. Sélectionner la cible (ESP32 ou STM32).
2. Écrire ou importer le code dans l'éditeur Monaco.
3. Lancer la compilation.
4. Consulter les logs de build en temps réel via Socket.io.
5. Récupérer le binaire généré si la compilation réussit.

## Détails techniques

### Compilation ESP32 (FreeRTOS)

La compilation ESP32 repose sur la toolchain FreeRTOS / ESP-IDF. Un point de vigilance majeur a été le code initial fourni dans l'éditeur Monaco : certains *includes* manquants empêchaient la compilation FreeRTOS dès le premier essai. Le template de code par défaut a été corrigé pour inclure les en-têtes nécessaires avant transmission au conteneur.

### Compilation STM32 (CMake + Docker)

L'image Docker `srzzumix/arm-none-eabi` a été retenue après plusieurs tests d'images alternatives, pour sa compatibilité et sa stabilité avec la toolchain `arm-none-eabi-gcc`.

Un correctif clé du `CMakeLists.txt` a été nécessaire :

```cmake
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
```

Cette ligne doit être positionnée **avant** la déclaration du projet (`project(...)`) et avant tout test de compilateur. Sans ce positionnement, CMake tente de lier un exécutable complet lors de ses tests de compilateur internes, ce qui échoue dans un environnement cross-compilation bare-metal (pas de `main`/runtime standard disponible). Le forcer en `STATIC_LIBRARY` permet à CMake de valider le compilateur sans nécessiter de lien complet.

## Problèmes connus / pièges

- **ESP32** : si le code FreeRTOS échoue à la compilation dès le premier lancement, vérifier que les includes par défaut du template Monaco n'ont pas été altérés.
- **Docker** : s'assurer que le démon Docker est lancé et accessible depuis le serveur Node.js (droits sur le socket).

## Pistes d'amélioration

- Support de cibles microcontrôleurs additionnelles
- Gestion de projets multi-fichiers
- Sauvegarde des sessions utilisateur
- File d'attente de compilation pour la gestion de charge
- Permettre de changer de cible (ESP32 ↔ STM32) sans perdre le code déjà écrit dans l'éditeur (actuellement le code semble perdu si l'utilisateur change de cible après coup)

## Auteur

Abir Benzid
