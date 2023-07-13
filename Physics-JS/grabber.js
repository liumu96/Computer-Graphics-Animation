let gGrabber;

let gMouseDown = false;

//   Grabber
class Grabber {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(1);
    this.raycaster.params.Line.threshold = 0.1;
    this.physicsObject = null;
    this.distance = 0.0;
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.time = 0.0;
  }
  increaseTime(dt) {
    this.time += dt;
  }
  updateRaycaster(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    this.mousePos = new THREE.Vector2();
    this.mousePos.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mousePos.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mousePos, camera);
  }

  start(x, y) {
    this.physicsObject = null;
    this.updateRaycaster(x, y);
    const intersects = this.raycaster.intersectObjects(threeScene.children);
    if (intersects.length > 0) {
      const obj = intersects[0].object.userData;
      if (obj) {
        this.physicsObject = obj;
        this.distance = intersects[0].distance;
        const pos = this.raycaster.ray.origin.clone();
        pos.addScaledVector(this.raycaster.ray.direction, this.distance);
        this.physicsObject.startGrab(pos);
        this.prevPos.copy(pos);
        this.vel.set(0.0, 0.0, 0.0);
        this.time = 0.0;
        if (gPhysicsScene.paused) run();
      }
    }
  }

  move(x, y) {
    if (this.physicsObject) {
      this.updateRaycaster(x, y);
      const pos = this.raycaster.ray.origin.clone();
      pos.addScaledVector(this.raycaster.ray.direction, this.distance);
      this.vel.copy(pos);
      this.vel.sub(this.prevPos);
      if (this.time > 0.0) this.vel.divideScalar(this.time);
      else this.vel.set(0.0, 0.0, 0.0);
      this.prevPos.copy(pos);
      this.time = 0.0;
      this.physicsObject.moveGrabbed(pos, this.vel);
    }
  }

  end(x, y) {
    if (this.physicsObject) {
      this.physicsObject.endGrab(this.prevPos, this.vel);
      this.physicsObject = null;
    }
  }
}

function onPointer(evt) {
  evt.preventDefault();
  if (evt.type == "pointerdown") {
    gGrabber.start(evt.clientX, evt.clientY);
    gMouseDown = true;
    if (gGrabber.physicsObject) {
      cameraControl.saveState();
      cameraControl.enabled = false;
    }
  } else if (evt.type == "pointermove" && gMouseDown) {
    gGrabber.move(evt.clientX, evt.clientY);
  } else if (evt.type == "pointerup") {
    if (gGrabber.physicsObject) {
      gGrabber.end();
      cameraControl.reset();
    }
    gMouseDown = false;
    cameraControl.enabled = true;
  }
}

function initGrabber() {
  gGrabber = new Grabber();
  container.addEventListener("pointerdown", onPointer, false);
  container.addEventListener("pointermove", onPointer, false);
  container.addEventListener("pointerup", onPointer, false);
}

initGrabber();
