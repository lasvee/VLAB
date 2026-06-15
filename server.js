// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');           // Pour manipuler les fichiers et dossiers
const { exec } = require('child_process');  // Pour exécuter Docker
const { v4: uuidv4 } = require('uuid');    // Pour générer des noms uniques

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// FONCTION: Sauvegarder le code et compiler esp32 avec Docker
async function compileESP32(code, socket) {
    // generer un ID unique pour cette compilation
    const buildId = uuidv4();
    const buildDir = path.join(__dirname, 'temp', buildId);
    
    // creer le dossier de build
    fs.mkdirSync(buildDir, { recursive: true });
    socket.emit('log', `[INFO] Dossier créé : ${buildDir}`);
    
    // sauvegarder le code utilisateur dans main.cpp
    const mainCppPath = path.join(buildDir, 'main.cpp');
    fs.writeFileSync(mainCppPath, code);
    socket.emit('log', '[INFO] Code sauvegardé dans main.cpp');
    
    // créer le CMakeLists.txt (obligatoire pour ESP-IDF)
    const cmakeContent = `
cmake_minimum_required(VERSION 3.5)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(remote_lab)
    `;
    const cmakePath = path.join(buildDir, 'CMakeLists.txt');
    fs.writeFileSync(cmakePath, cmakeContent);
    socket.emit('log', '[INFO] CMakeLists.txt créé');
    
    // créer un dossier main (ESP-IDF s'attend à cette structure)
    const mainDir = path.join(buildDir, 'main');
    fs.mkdirSync(mainDir, { recursive: true });
    
    const mainCmakePath = path.join(mainDir, 'CMakeLists.txt');
    fs.writeFileSync(mainCmakePath, `idf_component_register(SRCS "main.cpp" INCLUDE_DIRS ".")`);
    socket.emit('log', '[INFO] main/CMakeLists.txt créé');

    // deplacer main.cpp dans le dossier main/
    fs.renameSync(mainCppPath, path.join(mainDir, 'main.cpp'));
    
    const mainCMakeContent = `idf_component_register(SRCS "main.cpp"
                    INCLUDE_DIRS ".")`;
    fs.writeFileSync(path.join(mainDir, 'CMakeLists.txt'), mainCMakeContent);

    socket.emit('log', '[INFO] Structure de projet ESP-IDF prête');
    
    // Lancer la compilation avec Docker
    socket.emit('log', '[INFO] Lancement de la compilation avec Docker...');
    socket.emit('log', '[INFO] Cela peut prendre plusieurs secondes...');
    
    // Commande Docker :
    // docker run --rm -v <dossier_local>:/project -w /project espressif/idf idf.py build
    const dockerCmd = `docker run --rm -v "${buildDir}:/project" -w /project espressif/idf idf.py build`;    socket.emit('log', `[DEBUG] Commande : ${dockerCmd}`);
    
    // Exécuter la commande
    const dockerProcess = exec(dockerCmd);
    
    // Capturer la sortie standard (stdout) en temps réel
    dockerProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                socket.emit('log', `[BUILD] ${line}`);
            }
        });
    });
    
    // Capturer les erreurs (stderr)
    dockerProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                socket.emit('log', `[BUILD ERR] ${line}`);
            }
        });
    });
    
    // Quand la compilation est terminée
    return new Promise((resolve, reject) => {
        dockerProcess.on('close', (code) => {
            if (code === 0) {
                socket.emit('log', '[SUCCÈS] Compilation terminée !');
                
                // Vérifier si le binaire a été généré
                const binPath = path.join(buildDir, 'build', 'remote_lab.bin');
                if (fs.existsSync(binPath)) {
                    socket.emit('log', `[SUCCÈS] Binaire généré : ${binPath}`);
                    resolve(binPath);
                } else {
                    socket.emit('log', '[ERREUR] Binaire non trouvé après compilation');
                    reject(new Error('Binaire non trouvé'));
                }
            } else {
                socket.emit('log', `[ERREUR] Compilation échouée (code ${code})`);
                reject(new Error(`Compilation échouée avec le code ${code}`));
            }
        });
    });
}

// AJOUTÉ : Fonction de compilation STM32
async function compileSTM32(code, socket) {
    const buildId = uuidv4();
    const buildDir = path.join(__dirname, 'temp', buildId);
    fs.mkdirSync(buildDir, { recursive: true });
    socket.emit('log', `[INFO] Dossier créé : ${buildDir}`);

    // Sauvegarder le code
    fs.writeFileSync(path.join(buildDir, 'main.cpp'), code);
    socket.emit('log', '[INFO] Code sauvegardé dans main.cpp');

    // CMakeLists.txt pour STM32
    const cmakeContent = `
    cmake_minimum_required(VERSION 3.16)

    set(CMAKE_SYSTEM_NAME Generic)
    set(CMAKE_SYSTEM_PROCESSOR arm)
    set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

    set(CMAKE_C_COMPILER arm-none-eabi-gcc)
    set(CMAKE_CXX_COMPILER arm-none-eabi-g++)
    set(CMAKE_ASM_COMPILER arm-none-eabi-gcc)

    set(CMAKE_C_FLAGS "-mcpu=cortex-m4 -mthumb")
    set(CMAKE_CXX_FLAGS "-mcpu=cortex-m4 -mthumb -fno-exceptions -fno-rtti")
    set(CMAKE_EXE_LINKER_FLAGS "-specs=nosys.specs")

    project(remote_lab C CXX ASM)

    add_executable(remote_lab.elf main.cpp)
        `;
    fs.writeFileSync(path.join(buildDir, 'CMakeLists.txt'), cmakeContent);
    socket.emit('log', '[INFO] CMakeLists.txt STM32 créé');

    // Commande Docker STM32
    const dockerCmd = `docker run --rm -v "${buildDir}:/project" -w /project srzzumix/arm-none-eabi sh -c "cmake -G 'Unix Makefiles' -DCMAKE_BUILD_TYPE=Release -B build && cmake --build build"`;
    socket.emit('log', `[DEBUG] Commande : ${dockerCmd}`);

    const dockerProcess = exec(dockerCmd);

    dockerProcess.stdout.on('data', (data) => {
        data.toString().split('\n').forEach(line => {
            if (line.trim()) socket.emit('log', `[BUILD] ${line}`);
        });
    });

    dockerProcess.stderr.on('data', (data) => {
        data.toString().split('\n').forEach(line => {
            if (line.trim()) socket.emit('log', `[BUILD ERR] ${line}`);
        });
    });

    return new Promise((resolve, reject) => {
        dockerProcess.on('close', (code) => {
            if (code === 0) {
                socket.emit('log', '[SUCCÈS] Compilation STM32 terminée !');
                const elfPath = path.join(buildDir, 'build', 'remote_lab.elf');
                if (fs.existsSync(elfPath)) {
                    socket.emit('log', `[SUCCÈS] Binaire généré : ${elfPath}`);
                    resolve(elfPath);
                } else {
                    socket.emit('log', '[ERREUR] Binaire .elf non trouvé');
                    reject(new Error('Binaire non trouvé'));
                }
            } else {
                socket.emit('log', `[ERREUR] Compilation échouée (code ${code})`);
                reject(new Error(`Compilation échouée avec le code ${code}`));
            }
        });
    });
}

// GESTION DES CONNEXIONS SOCKET.IO
io.on('connection', (socket) => {
    console.log('Un client est connecté !');
    
    // ecouter l'event "code-submit"
    socket.on('code-submit', async (data) => {
    console.log('Code reçu, début de la compilation...');
    const code = data.code;
    // MODIFIÉ : récupérer la cible
    const target = data.target || 'esp32';
    socket.emit('log', `[INFO] Cible : ${target.toUpperCase()}`);

    try {
        // MODIFIÉ : appeler la bonne fonction selon la cible
        const binPath = target === 'stm32' 
            ? await compileSTM32(code, socket)
            : await compileESP32(code, socket);
        socket.emit('log', `[INFO] Compilation réussie ! Binaire : ${binPath}`);
    } catch (error) {
        console.error(error);
        socket.emit('log', `[ERREUR] ${error.message}`);
    }
});
    
    socket.on('disconnect', () => {
        console.log('Un client s\'est déconnecté');
    });
});

// Démarrer le serveur
server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});