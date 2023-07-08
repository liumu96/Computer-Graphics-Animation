// physics scene
let gPhysicsScene = {
  gravity: new THREE.Vector3(0.0, -10.0, 0.0),
  dt: 1.0 / 3.0,
  tankSize: { x: 2.5, y: 1.0, z: 3.0 },
  tankBorder: 0.03,
  waterHeight: 0.8,
  waterSpacing: 0.02,
  paused: true,
  waterSurface: null,
  objects: [],
};

// globals variables
let gThreeScene;
let gRenderer;
let gRenderTarget;
let gCamera;
let gCameraControl;
let gWaterMaterial;
let gGrabber;
let gPrevTime = 0.0;

// Water Surface
class WaterSurface {
  constructor(sizeX, sizeZ, depth, spacing, visMaterial) {
    // physics data
    this.waveSpeed = 2.0;
    this.posDamping = 1.0;
    this.velDamping = 0.3;
    this.alpha = 0.5;
    this.time = 0.0;

    this.numX = Math.floor(sizeX / spacing) + 1;
    this.numZ = Math.floor(sizeZ / spacing) + 1;
    this.spacing = spacing;
    this.numCells = this.numX * this.numZ;
    this.heights = new Float32Array(this.numCells);
    this.bodyHeights = new Float32Array(this.numCells);
    this.prevHeights = new Float32Array(this.numCells);
    this.velocities = new Float32Array(this.numCells);
    this.heights.fill(depth);
    this.velocities.fill(0.0);

    // visual mesh
    let positions = new Float32Array(this.numCells * 3);
    let uvs = new Float32Array(this.numCells * 2);
    let cx = Math.floor(this.numX / 2.0);
    let cz = Math.floor(this.numZ / 2.0);

    for (let i = 0; i < this.numX; i++) {
      for (let j = 0; j < this.numZ; j++) {
        positions[3 * (i * this.numZ + j)] = (i - cx) * spacing;
        positions[3 * (i * this.numZ + j) + 2] = (j - cz) * spacing;

        uvs[2 * (i * this.numZ + j)] = i / this.numX;
        uvs[2 * (i * this.numZ + j) + 1] = j / this.numZ;
      }
    }

    var index = new Uint32Array((this.numX - 1) * (this.numZ - 1) * 2 * 3);
    let pos = 0;
    for (let i = 0; i < this.numX - 1; i++) {
      for (let j = 0; j < this.numZ - 1; j++) {
        let id0 = i * this.numZ + j;
        let id1 = i * this.numZ + j + 1;
        let id2 = (i + 1) * this.numZ + j + 1;
        let id3 = (i + 1) * this.numZ + j;

        index[pos++] = id0;
        index[pos++] = id1;
        index[pos++] = id2;

        index[pos++] = id0;
        index[pos++] = id2;
        index[pos++] = id3;
      }
    }
    var geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.visMesh = new THREE.Mesh(geometry, visMaterial);
    this.visMesh.name = "water-surface";

    this.updateVisMesh();

    gThreeScene.add(this.visMesh);
  }

  simulateCoupling() {
    let cx = Math.floor(this.numX / 2.0);
    let cz = Math.floor(this.numZ / 2.0);
    let h1 = 1.0 / this.spacing;

    this.prevHeights.set(this.bodyHeights);
    this.bodyHeights.fill(0.0);

    for (let i = 0; i < gPhysicsScene.objects.length; i++) {}
  }

  simulateSurface() {
    this.waveSpeed = Math.min(
      this.waveSpeed,
      (0.5 * this.spacing) / gPhysicsScene.dt
    );
    let c = (this.waveSpeed * this.waveSpeed) / this.spacing / this.spacing;
    let pd = Math.min(this.posDamping * gPhysicsScene.dt, 1.0);
    let vd = Math.max(0.0, 1.0 - this.velDamping * gPhysicsScene.dt);

    for (let i = 0; i < this.numX; i++) {
      for (let j = 0; j < this.numZ; j++) {
        let id = i * this.numZ + j;
        let h = this.heights[id];
        let sumH = 0.0;
        sumH += i > 0 ? this.heights[id - this.numZ] : h;
        sumH += i < this.numX - 1 ? this.heights[id + this.numZ] : h;
        sumH += j > 0 ? this.heights[id - 1] : h;
        sumH += j < this.numZ ? this.heights[id + 1] : h;
        this.velocities[id] += gPhysicsScene.dt * c * (sumH - 4.0 * h);
        this.heights[id] += (0.25 * sumH - h) * pd; // positional damping
      }
    }

    for (let i = 0; i < this.numCells; i++) {
      this.velocities[i] *= vd; // velocity damping
      this.heights[i] += this.velocities[i] * gPhysicsScene.dt;
    }
  }

  simulate() {
    this.time += gPhysicsScene.dt;
    this.simulateCoupling();
    this.simulateSurface();
    this.updateVisMesh();
  }

  updateVisMesh() {
    const positions = this.visMesh.geometry.attributes.position.array;
    for (let i = 0; i < this.numCells; i++) {
      positions[3 * i + 1] = this.heights[i];
    }
    this.visMesh.geometry.attributes.position.needsUpdate = true;
    this.visMesh.geometry.computeVertexNormals();
    this.visMesh.geometry.computeBoundingSphere();
  }

  setVisible(visible) {
    this.visMesh.visible = visible;
  }
}

class Ball {
  constructor(pos, radius, density, color = 0xff0000) {
    // physics data
    this.pos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.radius = radius;
    this.mass = ((4.0 * Math.PI) / 3.0) * radius * radius * radius * density;
    this.vel = new THREE.Vector3(0.0, 0.0, 0.0);
    this.grabbed = false;
    this.restitution = 0.1;

    // visual mesh
    let geometry = new THREE.SphereGeometry(radius, 32, 32);
    let material = new THREE.MeshPhongMaterial({ color: color });
    this.visMesh = new THREE.Mesh(geometry, material);
    this.visMesh.position.copy(pos);
    this.visMesh.userData = this; // for raycasting
    this.visMesh.layers.enable(1);
    gThreeScene.add(this.visMesh);
  }

  handleCollision(other) {}

  simulate() {}

  applyforce(force) {}

  startGrab(pos) {}

  moveGrab(pos, vel) {}

  endGrab(pos, vel) {}
}

function initScene(scene) {
  // water surface
  let wx = gPhysicsScene.tankSize.x;
  let wy = gPhysicsScene.tankSize.y;
  let wz = gPhysicsScene.tankSize.z;
  let b = gPhysicsScene.tankBorder;

  let waterSurface = new WaterSurface(
    wx,
    wz,
    gPhysicsScene.waterHeight,
    gPhysicsScene.waterSpacing,
    gWaterMaterial
  );

  gPhysicsScene.waterSurface = waterSurface;

  // tank

  let tankMaterial = new THREE.MeshPhongMaterial({ color: 0x909090 });
  let boxLeftGeometry = new THREE.BoxGeometry(b, wy, wz);
  let boxL = new THREE.Mesh(boxLeftGeometry, tankMaterial);
  boxL.position.set(-0.5 * wx, wy * 0.5, 0.0);
  gThreeScene.add(boxL);
  let boxR = boxL.clone();
  boxR.position.set(0.5 * wx, 0.5 * wy, 0.0);
  gThreeScene.add(boxR);
  let boxFrontGeometry = new THREE.BoxGeometry(wx, wy, b);
  let boxF = new THREE.Mesh(boxFrontGeometry, tankMaterial);
  boxF.position.set(0.0, 0.5 * wy, -wz * 0.5);
  gThreeScene.add(boxF);
  let boxB = boxF.clone();
  boxB.position.set(0.0, 0.5 * wy, wz * 0.5);
  gThreeScene.add(boxB);

  // ball

  gPhysicsScene.objects.push(
    new Ball({ x: -0.5, y: 1.0, z: -0.5 }, 0.2, 2.0, 0xffff00)
  );
  gPhysicsScene.objects.push(
    new Ball({ x: 0.5, y: 1.0, z: -0.5 }, 0.3, 0.7, 0xff8000)
  );
  gPhysicsScene.objects.push(
    new Ball({ x: 0.5, y: 1.0, z: 0.5 }, 0.25, 0.2, 0xff0000)
  );
}

function simulate() {
  if (gPhysicsScene.paused) return;

  gPhysicsScene.waterSurface.simulate();

  for (let i = 0; i < gPhysicsScene.objects.length; i++) {}
}

function render() {
  gPhysicsScene.waterSurface.setVisible(false);
  gRenderer.setRenderTarget(gRenderTarget);
  gRenderer.clear();
  gRenderer.render(gThreeScene, gCamera);

  gPhysicsScene.waterSurface.setVisible(true);
  gRenderer.setRenderTarget(null);
  gRenderer.render(gThreeScene, gCamera);
}

function initThreeScene() {
  gThreeScene = new THREE.Scene();

  // Lights
  gThreeScene.add(new THREE.AmbientLight(0x505050));
  gThreeScene.fog = new THREE.Fog(0x000000, 0, 15);

  const spotLight = new THREE.SpotLight(0xffffff);
  spotLight.angle = Math.PI / 5;
  spotLight.penumbra = 0.2;
  spotLight.position.set(2, 3, 3);
  spotLight.castShadow = true;
  spotLight.shadow.camera.near = 1;
  spotLight.shadow.camera.far = 10;
  spotLight.shadow.mapSize.width = 1024;
  spotLight.shadow.mapSize.height = 1024;
  gThreeScene.add(spotLight);

  const dirLight = new THREE.DirectionalLight(0x55505a, 1);
  dirLight.position.set(0, 3, 0);
  dirLight.castShadow = true;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 10;

  dirLight.shadow.camera.right = 1;
  dirLight.shadow.camera.left = -1;
  dirLight.shadow.camera.top = 1;
  dirLight.shadow.camera.bottom = -1;

  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  gThreeScene.add(dirLight);

  // Geometry
  const ground = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(20, 20, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0xaadaf, shininess: 150 })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  gThreeScene.add(ground);

  const helper = new THREE.GridHelper(20, 20);
  helper.material.opacity = 1.0;
  helper.material.transparent = true;
  helper.position.set(0, 0.002, 0);
  gThreeScene.add(helper);

  // gRenderer
  gRenderer = new THREE.WebGLRenderer();
  gRenderer.shadowMap.enabled = true;
  gRenderer.setPixelRatio(window.devicePixelRatio);
  gRenderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", onWindowResize, false);
  container.appendChild(gRenderer.domElement);

  gRenderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    }
  );
  gWaterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      background: {
        value: gRenderTarget.texture,
      },
    },
    vertexShader: document.getElementById("waterVertexShader").textContent,
    fragmentShader: document.getElementById("waterFragmentShader").textContent,
  });

  // gCamera
  gCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );
  gCamera.position.set(0.0, 2.1, 1.5);
  gCamera.updateMatrixWorld();

  gThreeScene.add(gCamera);

  // Controls
  gCameraControl = new THREE.OrbitControls(gCamera, gRenderer.domElement);
  gCameraControl.zoomSpeed = 2.0;
  gCameraControl.panSpeed = 0.4;
  gCameraControl.target.set(0.0, 0.8, 0.0);

  // Grabber
}

class Grabber {
  constructor() {}

  increaseTime(dt) {}

  updateRaycaster(x, y) {}

  start(x, y) {}

  move(x, y) {}

  end(x, y) {}
}

function onPointer(evt) {}

function onWindowResize() {
  gCamera.aspect = window.innerWidth / window.innerHeight;
  gCamera.updateProjectionMatrix();
  gRenderer.setSize(window.innerWidth, window.innerHeight);
  gRenderTarget.setSize(window.innerWidth, window.innerHeight);
}

function run() {}

function restart() {}

function update() {
  let time = performance.now();
  let dt = (time - gPrevTime) / 1000.0;
  gPrevTime = time;

  simulate();
  render();
  gCameraControl.update();

  requestAnimationFrame(update);
}

initThreeScene();
initScene();
update();
