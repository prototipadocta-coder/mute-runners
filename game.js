// MUTE_RUNNERS - Core Gameplay Logic
let scene, camera, renderer;
let player, playerVelocity = new THREE.Vector3();
let moveState = { forward: false, backward: false, left: false, right: false };
let noiseSources = [];
let silencePulses = [];

let playerStress = 0;
const MAX_STRESS = 100;
let totalSources = 8;
let silencedCount = 0;
let gameActive = false;

// Web Audio API Synth setup
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(freq, duration, type='sine') {
    if (!audioCtx) return;
    try {
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);
    scene.fog = new THREE.FogExp2(0x0a0a14, 0.025);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('render-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x222244, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    // Ground
    const gridHelper = new THREE.GridHelper(200, 50, 0xff007f, 0x00f0ff);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Player Object Container
    player = new THREE.Group();
    player.position.set(0, 1, 0);
    player.add(camera);
    scene.add(player);

    // Create City Environment
    createCity();

    // Spawn Noise Sources
    spawnNoiseSources();

    // Events
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', (e) => handleKey(e, true));
    document.addEventListener('keyup', (e) => handleKey(e, false));
    document.addEventListener('mousedown', onShoot);

    // Start loop
    animate();
}

function createCity() {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const matBuilding = new THREE.MeshStandardMaterial({ color: 0x151528, roughness: 0.3 });

    for (let i = 0; i < 40; i++) {
        let h = 10 + Math.random() * 30;
        let w = 8 + Math.random() * 10;
        let d = 8 + Math.random() * 10;
        
        let building = new THREE.Mesh(boxGeo, matBuilding);
        building.scale.set(w, h, d);
        
        let x = (Math.random() - 0.5) * 160;
        let z = (Math.random() - 0.5) * 160;
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue; // Keep center free
        
        building.position.set(x, h/2, z);
        scene.add(building);
    }
}

function spawnNoiseSources() {
    const speakerGeo = new THREE.CylinderGeometry(1.5, 1.5, 4, 16);
    
    for (let i = 0; i < totalSources; i++) {
        let matSpeaker = new THREE.MeshStandardMaterial({
            color: 0xff0055,
            emissive: 0xff0055,
            emissiveIntensity: 0.6
        });

        let source = new THREE.Mesh(speakerGeo, matSpeaker);
        let angle = (i / totalSources) * Math.PI * 2;
        let radius = 25 + Math.random() * 35;

        source.position.set(Math.cos(angle) * radius, 2, Math.sin(angle) * radius);
        source.userData = { isSilenced: false, id: i };

        // Visual Wave Ring
        let waveGeo = new THREE.RingGeometry(0.5, 2, 32);
        let waveMat = new THREE.MeshBasicMaterial({ color: 0xff0055, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        let wave = new THREE.Mesh(waveGeo, waveMat);
        wave.rotation.x = Math.PI / 2;
        source.add(wave);
        source.userData.wave = wave;

        scene.add(source);
        noiseSources.push(source);
    }
}

function handleKey(e, isDown) {
    if (!gameActive) return;
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = isDown; break;
        case 'KeyS': case 'ArrowDown': moveState.backward = isDown; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = isDown; break;
        case 'KeyD': case 'ArrowRight': moveState.right = isDown; break;
        case 'Space':
            if (isDown && player.position.y <= 1.05) {
                playerVelocity.y = 8;
                playSound(300, 0.2, 'triangle');
            }
            break;
    }
}

// Simple Mouse Look
let isPointerLocked = false;
document.getElementById('render-canvas').addEventListener('click', () => {
    if (gameActive) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body && gameActive) {
        player.rotation.y -= e.movementX * 0.0025;
        camera.rotation.x -= e.movementY * 0.0025;
        camera.rotation.x = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, camera.rotation.x));
    }
});

function onShoot() {
    if (!gameActive) return;

    initAudio();
    playSound(880, 0.15, 'sine'); // High pulse tone

    let pulseGeo = new THREE.SphereGeometry(0.5, 16, 16);
    let pulseMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
    let pulse = new THREE.Mesh(pulseGeo, pulseMat);

    pulse.position.copy(player.position);
    
    // Direction vector
    let dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    pulse.userData = { dir: dir, speed: 30, lifetime: 0 };

    scene.add(pulse);
    silencePulses.push(pulse);

    // Combo indicator feedback
    let combo = document.getElementById('combo-display');
    combo.classList.remove('combo-hidden');
    setTimeout(() => combo.classList.add('combo-hidden'), 400);
}

function updateGame(delta) {
    if (!gameActive) return;

    // Movement
    let speed = 12 * delta;
    let moveVector = new THREE.Vector3();

    if (moveState.forward) moveVector.z -= 1;
    if (moveState.backward) moveVector.z += 1;
    if (moveState.left) moveVector.x -= 1;
    if (moveState.right) moveVector.x += 1;

    moveVector.normalize();
    moveVector.applyQuaternion(player.quaternion);

    player.position.x += moveVector.x * speed;
    player.position.z += moveVector.z * speed;

    // Gravity
    playerVelocity.y -= 20 * delta;
    player.position.y += playerVelocity.y * delta;
    if (player.position.y < 1) {
        player.position.y = 1;
        playerVelocity.y = 0;
    }

    // Process Pulses
    for (let i = silencePulses.length - 1; i >= 0; i--) {
        let p = silencePulses[i];
        p.position.addScaledVector(p.userData.dir, p.userData.speed * delta);
        p.scale.addScalar( delta * 5 );
        p.userData.lifetime += delta;

        // Hit Detection with Noise Sources
        noiseSources.forEach(source => {
            if (!source.userData.isSilenced && p.position.distanceTo(source.position) < 4) {
                silenceSource(source);
            }
        });

        if (p.userData.lifetime > 1.2) {
            scene.remove(p);
            silencePulses.splice(i, 1);
        }
    }

    // Noise Sources & Stress Logic
    let currentNoiseLevel = 0;
    noiseSources.forEach(source => {
        if (!source.userData.isSilenced) {
            let wave = source.userData.wave;
            wave.scale.addScalar(delta * 2);
            if (wave.scale.x > 5) wave.scale.set(1, 1, 1);

            let dist = player.position.distanceTo(source.position);
            if (dist < 20) {
                currentNoiseLevel += (20 - dist) * 1.5;
            }
        }
    });

    // Update Stress
    if (currentNoiseLevel > 0) {
        playerStress += currentNoiseLevel * delta * 0.8;
    } else {
        playerStress = Math.max(0, playerStress - 10 * delta);
    }

    // UI Updates
    document.getElementById('stress-bar').style.width = Math.min(100, playerStress) + '%';
    document.getElementById('stress-text').innerText = Math.round(70 + playerStress * 0.5) + ' dB';

    if (playerStress >= MAX_STRESS) {
        triggerGameOver();
    }
}

function silenceSource(source) {
    source.userData.isSilenced = true;
    source.material.color.setHex(0x00ffaa);
    source.material.emissive.setHex(0x00ffaa);
    source.userData.wave.material.color.setHex(0x00ffaa);

    silencedCount++;
    playSound(523.25, 0.4, 'sine'); // C5 melody tone

    let purityPercent = Math.round((silencedCount / totalSources) * 100);
    document.getElementById('purity-bar').style.width = purityPercent + '%';
    document.getElementById('purity-text').innerText = purityPercent + '%';
    document.getElementById('score-text').innerText = `${silencedCount} / ${totalSources}`;

    if (silencedCount >= totalSources) {
        triggerVictory();
    }
}

function triggerGameOver() {
    gameActive = false;
    document.exitPointerLock();
    document.getElementById('final-score').innerText = `${silencedCount} / ${totalSources}`;
    document.getElementById('gameover-overlay').classList.remove('hidden');
}

function triggerVictory() {
    gameActive = false;
    document.exitPointerLock();
    document.getElementById('victory-overlay').classList.remove('hidden');
}

function startGame() {
    initAudio();
    playerStress = 0;
    silencedCount = 0;
    gameActive = true;

    document.getElementById('start-overlay').classList.add('hidden');
    document.getElementById('gameover-overlay').classList.add('hidden');
    document.getElementById('victory-overlay').classList.add('hidden');

    document.getElementById('purity-bar').style.width = '0%';
    document.getElementById('purity-text').innerText = '0%';
    document.getElementById('score-text').innerText = `0 / ${totalSources}`;

    // Reset sources
    noiseSources.forEach(s => {
        s.userData.isSilenced = false;
        s.material.color.setHex(0xff0055);
        s.material.emissive.setHex(0xff0055);
        s.userData.wave.material.color.setHex(0xff0055);
    });
}

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016; // Approx 60fps
    updateGame(delta);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Event Listeners for UI Buttons
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-win-restart').addEventListener('click', startGame);

window.onload = init;
