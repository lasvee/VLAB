// public/client.js

console.log('client.js chargé');

// exemples de code pour chaque cible
const ESP32_EXAMPLE = `#include <stdio.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "MAIN";

extern "C" void app_main(void)
    {
    printf("Hello from Remote Lab!\\n");
    ESP_LOGI(TAG, "ESP32 est prêt !");
    
    int counter = 0;
    while (1) {
        printf("Compteur: %d\\n", counter++);
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}`;

const STM32_EXAMPLE = `#include <stdint.h>

int main(void)
{
    volatile uint32_t counter = 0;
    while (1) {
        counter++;
    }
    return 0;
}`;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded');
    
    // INITIALISATION DE Xterm.js
    let term = null;
    try {
        term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#0c0c0c',
                foreground: '#f0f0f0'
            },
            fontSize: 13
        });
        term.open(document.getElementById('terminal'));
        term.writeln('VLAB - Web to Silicon');
        term.writeln('✓ Terminal prêt');
        term.writeln('');
        console.log('Xterm.js OK');
    } catch(e) {
        console.error('Erreur Xterm:', e);
    }
    
    // ATTENDRE QUE L'EDITEUR SOIT DISPO
    function waitForEditor() {
        console.log('Recherche de window.editor...');
        
        if (window.editor && typeof window.editor.getValue === 'function') {
            console.log('✅ Éditeur trouvé et prêt !');
            if (term) term.writeln('✓ Éditeur prêt');
        } else {
            console.log('Éditeur pas encore prêt, réessai dans 100ms...');
            setTimeout(waitForEditor, 100);
        }
    }
    waitForEditor();
    
    // CONNEXION SOCKET.IO
    const socket = io();
    
    const targetSelect = document.getElementById('targetSelect');
    targetSelect.addEventListener('change', () => {
        if (!window.editor) return;
        const target = targetSelect.value;
        const example = target === 'esp32' ? ESP32_EXAMPLE : STM32_EXAMPLE;
        window.editor.setValue(example);
        if (term) term.writeln(`🎯 Cible changée : ${target.toUpperCase()}`);
    });

    socket.on('connect', () => {
        console.log('Socket.io connecté');
        if (term) {
            term.writeln('✅ Connecté au serveur WebSocket');
            term.writeln('📝 Cliquez sur "Compiler"');
        }
    });

    socket.on('log', (message) => {
        console.log('Log reçu:', message);
        if (term) {
            term.writeln(message);
            term.scrollToBottom();
        }
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.innerHTML = '📡 ' + (message.substring(0, 60) || '');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Erreur socket:', err);
        if (term) term.writeln(`❌ Erreur connexion: ${err.message}`);
    });

    
    // BOUTON COMPILER
    const compileBtn = document.getElementById('compileBtn');
    
    if (compileBtn) {
        compileBtn.addEventListener('click', () => {
            console.log('Bouton cliqué');
            
            if (!window.editor || typeof window.editor.getValue !== 'function') {
                if (term) term.writeln('⏳ Éditeur pas encore prêt, attendez...');
                return;
            }
            
            const code = window.editor.getValue();
            console.log('Code longueur:', code.length);
            if (term) {
                term.writeln('\r\n📤 ENVOI AU SERVEUR');
                term.writeln(`📦 ${code.length} caractères`);
            }

            socket.emit('code-submit', { code: code, target: targetSelect.value });
            
            compileBtn.disabled = true;
            compileBtn.textContent = '⏳ Compilation...';
            setTimeout(() => {
                compileBtn.disabled = false;
                compileBtn.textContent = '🚀 Compiler';
            }, 10000);
        });
    } else {
        console.error('Bouton #compileBtn non trouvé !');
    }
});