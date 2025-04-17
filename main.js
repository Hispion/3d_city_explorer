// Configuration parameters
let CAMERA_HEIGHT = 0.53;
let MODEL_SCALE = 1.74; 
let FOG_COLOR = 0xffffff; 
let FOG_NEAR = -33.9;  
let FOG_FAR = 82.0;   
let AMBIENT_INTENSITY = 0;
let DIRECTIONAL_INTENSITY = 0;
let FOG_DENSITY = 0.00;
let FOG_ALPHA = 1.00;
let FOG_SETTINGS_VISIBLE = false;
let PARTICLE_COUNT = 500;
let PARTICLE_SIZE = 0.05;
let PARTICLE_SPEED = 0.2;
let PARTICLE_MAX_HEIGHT = 5; // Maximum height for particles

import * as THREE from 'three';
import { GLTFLoader } from 'three/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let camera, scene, renderer;
let controls;
let ambientLight, directionalLight;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let composer;
let particleSystem;

// Function to load HDRI with progress tracking
function loadHDRI() {
  return new Promise((resolve, reject) => {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dalkey_view_1k.hdr', 
      function(texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resolve(texture);
      },
      function(xhr) {
        // Update HDRI loading progress
        const loadingProgress = document.getElementById('loading-progress');
        const hdriProgress = (xhr.loaded / xhr.total * 100).toFixed(0);
        loadingProgress.textContent = `HDRI: ${hdriProgress}%`;
      },
      function(error) {
        reject(error);
      }
    );
  });
}

// Function to load city model with progress tracking
function loadCityModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      '/city.glb',
      function(gltf) {
        const model = gltf.scene;
        // Adjusted model scale and position
        model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
        model.position.y = -1;

        // Add collision floor with larger dimensions
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(2000, 2000), 
          new THREE.MeshStandardMaterial({ visible: false })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.5;

        scene.add(floor);
        scene.add(model);
        resolve();
      },
      function(xhr) {
        const loadingProgress = document.getElementById('loading-progress');
        if (xhr.total > 0) {
          const modelProgress = (xhr.loaded / xhr.total * 100).toFixed(0);
          loadingProgress.textContent = `City Model: ${modelProgress}%`;
        } else {
          // Fallback to avoid Infinity%
          loadingProgress.textContent = 'City Model: 0%';
        }
      },
      function(error) {
        reject(error);
      }
    );
  });
}

function createParticleTexture() {
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Create transparent background
  ctx.clearRect(0, 0, size, size);
   
  // Draw a soft white circular gradient for the particle
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  
  return texture;
}

function createParticles() {
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Random positions starting from ground level up to player height
    positions[i * 3] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = Math.random() * CAMERA_HEIGHT * 2; // Spawn around player height
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

    // Random sizes
    sizes[i] = PARTICLE_SIZE * (0.5 + Math.random() * 0.5);

    // Dark gray to black colors
    colors[i * 3] = Math.random() * 0.1;
    colors[i * 3 + 1] = Math.random() * 0.1;
    colors[i * 3 + 2] = Math.random() * 0.1;
  }

  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const particleMaterial = new THREE.PointsMaterial({
    size: PARTICLE_SIZE,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    fog: true,
    alphaTest: 0.1,
    blending: THREE.NormalBlending,
    map: createParticleTexture()
  });

  const particleSystem = new THREE.Points(particles, particleMaterial);
  scene.add(particleSystem);

  return particleSystem;
}

// Initialize the scene
async function init() {
  try {
    // Setup renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    document.getElementById('container').appendChild(renderer.domElement);

    // Setup scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR); 
    scene.background = new THREE.Color(FOG_COLOR); 
  
    // Setup camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, CAMERA_HEIGHT, 20);

    // Update loading text
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = 'Loading HDRI...';

    // Load HDRI
    const texture = await loadHDRI();
    scene.environment = texture;

    // Update loading text
    loadingText.textContent = 'Loading City Model...';

    // Load city model
    await loadCityModel();

    // Adjust lights to be configurable
    ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);  
    scene.add(ambientLight);
    
    directionalLight = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_INTENSITY);  
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Setup pointer lock controls
    setupPointerLockControls();

    // Setup keyboard controls
    setupKeyboardControls();

    // Setup fog settings controls
    setupFogControls();

    particleSystem = createParticles();

    // Update initial UI values to match new defaults
    document.getElementById('fog-color').value = '#ffffff';
    document.getElementById('fog-near').value = FOG_NEAR;
    document.getElementById('fog-far').value = FOG_FAR;
    document.getElementById('ambient-intensity').value = AMBIENT_INTENSITY;
    document.getElementById('directional-intensity').value = DIRECTIONAL_INTENSITY;
    document.getElementById('fog-density').value = FOG_DENSITY;
    document.getElementById('fog-alpha').value = FOG_ALPHA;

    // Update value displays
    document.getElementById('fog-near-value').textContent = FOG_NEAR.toFixed(1);
    document.getElementById('fog-far-value').textContent = FOG_FAR.toFixed(1);
    document.getElementById('ambient-intensity-value').textContent = AMBIENT_INTENSITY.toFixed(1);
    document.getElementById('directional-intensity-value').textContent = DIRECTIONAL_INTENSITY.toFixed(1);
    document.getElementById('fog-density-value').textContent = FOG_DENSITY.toFixed(2);
    document.getElementById('fog-alpha-value').textContent = FOG_ALPHA.toFixed(2);

    // Add key listener for fog settings toggle
    document.addEventListener('keydown', (event) => {
      if (event.key === 'p' || event.key === 'P') {
        FOG_SETTINGS_VISIBLE = !FOG_SETTINGS_VISIBLE;
        document.getElementById('fog-settings').style.display = FOG_SETTINGS_VISIBLE ? 'block' : 'none';
        
        // Update toggle indicator
        document.getElementById('toggle-settings').textContent = FOG_SETTINGS_VISIBLE ? '🔓' : '🔒';
      }
    });

    // Initially hide fog settings
    document.getElementById('fog-settings').style.display = 'none';
    document.getElementById('toggle-settings').textContent = '🔒';

    if (!controls) {
      console.error('Failed to create controls');
      return;
    }

    // Setup effect composer after renderer is created
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Custom lens distortion shader with improved distortion algorithm and edge protection
    const distortionShader = {
      uniforms: {
        tDiffuse: { value: null },
        distortion: { value: 0.8 },  
        scale: { value: 0.92 }       
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float distortion;
        uniform float scale;
        varying vec2 vUv;

        vec2 barrel(vec2 uv) {
          // Center coordinates
          vec2 cc = uv - 0.5;
          float dist = dot(cc, cc);
          
          // Apply smoother distortion with roll-off at edges
          float factor = 1.0 + dist * (distortion - distortion * dist * 0.15);
          
          // Scale down to prevent edge stretching
          return 0.5 + (cc * factor * scale);
        }

        void main() {
          vec2 distortedUv = barrel(vUv);
          
          // Add boundary check to prevent sampling outside texture
          if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || 
              distortedUv.y < 0.0 || distortedUv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); 
          } else {
            gl_FragColor = texture2D(tDiffuse, distortedUv);
          }
          
          // Add stronger vignette effect to hide edge artifacts
          float vignette = smoothstep(0.95, 0.5, length(vUv - 0.5));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.7, vignette * 0.6);
        }
      `
    };

    // Chromatic aberration shader with reduced values
    const chromaShader = {
      uniforms: {
        tDiffuse: { value: null },
        redOffset: { value: 0.001 },  
        greenOffset: { value: 0.0 },
        blueOffset: { value: -0.001 } 
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float redOffset;
        uniform float greenOffset;
        uniform float blueOffset;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;
          
          // Add boundary checks for chromatic aberration too
          vec2 redUv = uv + vec2(redOffset, 0.0);
          vec2 greenUv = uv + vec2(greenOffset, 0.0);
          vec2 blueUv = uv + vec2(blueOffset, 0.0);
          
          // Clamp UVs to prevent sampling outside
          redUv = clamp(redUv, vec2(0.0), vec2(1.0));
          greenUv = clamp(greenUv, vec2(0.0), vec2(1.0));
          blueUv = clamp(blueUv, vec2(0.0), vec2(1.0));
          
          float r = texture2D(tDiffuse, redUv).r;
          float g = texture2D(tDiffuse, greenUv).g;
          float b = texture2D(tDiffuse, blueUv).b;
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `
    };

    const distortionPass = new ShaderPass(distortionShader);
    const chromaPass = new ShaderPass(chromaShader);

    composer.addPass(distortionPass);
    composer.addPass(chromaPass);
  } catch (error) {
    console.error('Initialization failed:', error);
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = 'Loading failed. Please refresh.';
  }

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Remove preloader
  const preloader = document.getElementById('preloader');
  preloader.style.opacity = '0';
  setTimeout(() => {
    preloader.style.display = 'none';
  }, 500);
}

// Function to setup pointer lock controls
function setupPointerLockControls() {
  controls = new PointerLockControls(camera, renderer.domElement);
  
  const instructions = document.getElementById('instructions');
  
  instructions.addEventListener('click', function() {
    controls.lock();
  });
  
  controls.addEventListener('lock', function() {
    instructions.classList.add('hidden');
  });
  
  controls.addEventListener('unlock', function() {
    instructions.classList.remove('hidden');
  });
  
  scene.add(controls.getObject());
}

// Function to setup keyboard controls
function setupKeyboardControls() {
  const onKeyDown = function(event) {
    switch(event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = true;
        break;
      case 'Space':
        // Reduced jump velocity by 20%
        if (canJump === true) velocity.y += 20;  
        canJump = false;
        break;
    }
  };
  
  const onKeyUp = function(event) {
    switch(event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = false;
        break;
    }
  };
  
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
}

// Function to setup fog settings controls
function setupFogControls() {
  const fogColorInput = document.getElementById('fog-color');
  const fogNearInput = document.getElementById('fog-near');
  const fogFarInput = document.getElementById('fog-far');
  const ambientIntensityInput = document.getElementById('ambient-intensity');
  const directionalIntensityInput = document.getElementById('directional-intensity');
  const fogDensityInput = document.getElementById('fog-density');
  const fogAlphaInput = document.getElementById('fog-alpha');

  // Color input
  fogColorInput.addEventListener('input', (e) => {
    const color = parseInt(e.target.value.replace('#', ''), 16);
    FOG_COLOR = color;
    
    const rgbaColor = `rgba(${parseInt(color >> 16 & 255)}, ${parseInt(color >> 8 & 255)}, ${parseInt(color & 255)}, ${FOG_ALPHA})`;
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(color, FOG_NEAR, FOG_FAR);
    
    renderer.setClearColor(color, FOG_ALPHA);
  });

  // Fog Near input
  fogNearInput.addEventListener('input', (e) => {
    FOG_NEAR = parseFloat(e.target.value);
    document.getElementById('fog-near-value').textContent = FOG_NEAR.toFixed(1);
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  });

  // Fog Far input
  fogFarInput.addEventListener('input', (e) => {
    FOG_FAR = parseFloat(e.target.value);
    document.getElementById('fog-far-value').textContent = FOG_FAR.toFixed(1);
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  });

  // Ambient Light Intensity input
  ambientIntensityInput.addEventListener('input', (e) => {
    AMBIENT_INTENSITY = parseFloat(e.target.value);
    document.getElementById('ambient-intensity-value').textContent = AMBIENT_INTENSITY.toFixed(1);
    ambientLight.intensity = AMBIENT_INTENSITY;
  });

  // Directional Light Intensity input
  directionalIntensityInput.addEventListener('input', (e) => {
    DIRECTIONAL_INTENSITY = parseFloat(e.target.value);
    document.getElementById('directional-intensity-value').textContent = DIRECTIONAL_INTENSITY.toFixed(1);
    directionalLight.intensity = DIRECTIONAL_INTENSITY;
  });

  // Fog Density input
  fogDensityInput.addEventListener('input', (e) => {
    FOG_DENSITY = parseFloat(e.target.value);
    document.getElementById('fog-density-value').textContent = FOG_DENSITY.toFixed(2);
    
    // Custom fog shader to control opacity
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    renderer.shadowMap.needsUpdate = true;
  });

  // Fog Alpha input
  fogAlphaInput.addEventListener('input', (e) => {
    FOG_ALPHA = parseFloat(e.target.value);
    document.getElementById('fog-alpha-value').textContent = FOG_ALPHA.toFixed(2);
    
    // Update fog color with alpha
    const rgbaColor = `rgba(${parseInt(FOG_COLOR >> 16 & 255)}, ${parseInt(FOG_COLOR >> 8 & 255)}, ${parseInt(FOG_COLOR & 255)}, ${FOG_ALPHA})`;
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    
    // Optional: Apply fog color with alpha to renderer
    renderer.setClearColor(FOG_COLOR, FOG_ALPHA);
  });
}

// Function to handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation function
function animate() {
  requestAnimationFrame(animate);
  
  // Add a null check for controls
  if (controls && controls.isLocked === true) {
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    
    // Gravity
    velocity.y -= 9.8 * 10.0 * delta;
    
    // Movement
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    
    // REDUCED MOVEMENT SPEED: Lowered velocity multipliers from 400.0 to 200.0
    if (moveForward || moveBackward) velocity.z -= direction.z * 100.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 100.0 * delta;
    
    // Slightly increased friction to further reduce speed
    velocity.x *= 0.85;
    velocity.z *= 0.85;
    
    // Apply friction
    // velocity.x *= 0.9;
    // velocity.z *= 0.9;
    
    // Safely move the camera only if controls exist
    if (controls) {
      controls.moveRight(-velocity.x * delta);
      controls.moveForward(-velocity.z * delta);
      
      // Vertical movement (gravity and jumping)
      const controlObject = controls.getObject();
      if (controlObject) {
        controlObject.position.y += (velocity.y * delta);
        
        // Stop falling if we hit the ground
        if (controlObject.position.y < CAMERA_HEIGHT) {  
          velocity.y = 0;
          controlObject.position.y = CAMERA_HEIGHT;     
          canJump = true;
        }
      }
    }
    
    prevTime = time;
  }
  
  if (particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Gentle floating movement
      positions[i * 3] += (Math.random() - 0.5) * 0.01 * PARTICLE_SPEED;
      positions[i * 3 + 1] += (Math.random() - 0.1) * 0.01 * PARTICLE_SPEED;
      positions[i * 3 + 2] += (Math.random() - 0.5) * 0.01 * PARTICLE_SPEED;

      // Reset particles that float too high
      if (positions[i * 3 + 1] > PARTICLE_MAX_HEIGHT) {
        // Respawn at ground level
        positions[i * 3] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = Math.random() * 0.5; // Just above ground
        positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
      
      // Respawn particles that drift too far horizontally
      if (Math.abs(positions[i * 3]) > 25 || Math.abs(positions[i * 3 + 2]) > 25) {
        positions[i * 3] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 1] = Math.random() * CAMERA_HEIGHT * 2; // Maintain height variety
        positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      }
      
      // Randomly respawn some particles to keep the effect fresh
      if (Math.random() < 0.001) { // 0.1% chance per frame
        positions[i * 3] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = Math.random() * 0.5; // Just above ground
        positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  // Use composer instead of direct renderer render
  if (scene && camera && composer) {
    composer.render();
  }
}

// Call init when the script loads
init();

// Start the animation loop
animate();