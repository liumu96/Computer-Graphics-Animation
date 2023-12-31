let threeScene;
let renderer;
let camera;
let cameraControl;

function initThreeScene() {
  threeScene = new THREE.Scene();

  // Lights

  threeScene.add(new THREE.AmbientLight(0x505050));
  threeScene.fog = new THREE.Fog(0x000000, 0, 15);

  const spotLight = new THREE.SpotLight(0xffffff);
  spotLight.angle = Math.PI / 5;
  spotLight.penumbra = 0.2;
  spotLight.position.set(2, 3, 3);
  spotLight.castShadow = true;
  spotLight.shadow.camera.near = 3;
  spotLight.shadow.camera.far = 10;
  spotLight.shadow.mapSize.width = 1024;
  spotLight.shadow.mapSize.height = 1024;
  threeScene.add(spotLight);

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
  threeScene.add(dirLight);

  // Geometry

  const ground = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(20, 20, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0xa0adaf, shininess: 150 })
  );

  ground.rotation.x = -Math.PI / 2; // rotates X/Y to X/Z
  ground.receiveShadow = true;
  threeScene.add(ground);

  const helper = new THREE.GridHelper(20, 20);
  helper.material.opacity = 1.0;
  helper.material.transparent = true;
  helper.position.set(0, 0.002, 0);
  threeScene.add(helper);

  // Renderer

  renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", onWindowResize, false);
  container.appendChild(renderer.domElement);

  // Camera

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );
  camera.position.set(0, 1, 1);
  camera.updateMatrixWorld();

  threeScene.add(camera);

  cameraControl = new THREE.OrbitControls(camera, renderer.domElement);
  cameraControl.zoomSpeed = 2.0;
  cameraControl.panSpeed = 0.4;
  cameraControl.target = new THREE.Vector3(0.0, 0.8, 0.0);
  cameraControl.update();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

initThreeScene();

onWindowResize();
