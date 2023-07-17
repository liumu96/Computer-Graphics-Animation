class Balls {
  constructor(radius, pos, vel, scene) {
    // physics data
    this.radius = radius;
    this.pos = pos;
    this.prevPos = pos;
    this.vel = vel;
    this.matrix = new THREE.Matrix4();
    this.numBalls = Math.floor(pos.length / 3);
    this.hash = new Hash(spacing, this.numBalls);
    this.showCollisions = false;

    this.normal = new Float32Array(3);

    // visual mesh
    const geometry = new THREE.SphereGeometry(radius, 8, 8);
    const material = new THREE.MeshPhongMaterial();

    this.visMesh = new THREE.InstancedMesh(geometry, material, this.numBalls);

    this.visMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.ballColor = new THREE.Color(0xff0000);
    this.ballCollisionColor = new THREE.Color(0xff8000);

    const colors = new Float32Array(3 * this.numBalls);
    this.visMesh.instanceColor = new THREE.InstancedBufferAttribute(
      colors,
      3,
      false,
      1
    );
    for (let i = 0; i < this.numBalls; i++) {
      this.visMesh.setColorAt(i, this.ballColor);
    }

    threeScene.add(this.visMesh);

    this.updateMesh();
  }

  updateMesh() {
    for (let i = 0; i < this.numBalls; i++) {
      this.matrix.makeTranslation(
        this.pos[3 * i],
        this.pos[3 * i + 1],
        this.pos[3 * i + 2]
      );
      this.visMesh.setMatrixAt(i, this.matrix);
    }

    this.visMesh.instanceMatrix.needsUpdate = true;
    this.visMesh.instanceColor.needsUpdate = true;
  }

  simulate(dt, gravity, worldBounds) {
    const minDist = 2.0 * this.radius;

    // integrate
    for (let i = 0; i < this.numBalls; i++) {
      vecAdd(this.vel, i, gravity, 0, dt);
      vecCopy(this.prevPos, i, this.pos, i);
      vecAdd(this.pos, i, this.vel, i, dt);
    }

    this.hash.create(this.pos);

    // handle collisions
    for (let i = 0; i < this.numBalls; i++) {
      this.visMesh.setColorAt(i, this.ballColor);
      // world collision
      for (let dim = 0; dim < 3; dim++) {
        const nr = 3 * i + dim;
        const minLimit = worldBounds[dim] + this.radius;
        const maxLimit = worldBounds[dim + 3] - this.radius;
        if (this.pos[nr] < minLimit || this.pos[nr] > maxLimit) {
          this.pos[nr] = this.pos[nr] < minLimit ? minLimit : maxLimit;
          this.vel[nr] = -this.vel[nr];
          if (this.showCollisions) {
            this.visMesh.setColorAt(i, this.ballCollisionColor);
          }
        }
      }

      // interball collision
      this.hash.query(this.pos, i, 2.0 * this.radius);

      for (let nr = 0; nr < this.hash.querySize; nr++) {
        const j = this.hash.queryIds[nr];

        vecSetDiff(this.normal, 0, this.pos, i, this.pos, j);
        const d2 = vecLengthSquared(this.normal, 0);

        // are the balls overlapping?
        if (d2 > 0.0 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          vecScale(this.normal, 0, 1.0 / d);

          // separate the balls
          const corr = (minDist - d) * 0.5;

          vecAdd(this.pos, i, this.normal, 0, corr);
          vecAdd(this.pos, j, this.normal, 0, -corr);

          // reflect velocities along normal
          const vi = vecDot(this.vel, i, this.normal, 0);
          const vj = vecDot(this.vel, j, this.normal, 0);

          vecAdd(this.vel, i, this.normal, 0, vj - vi);
          vecAdd(this.vel, j, this.normal, 0, vi - vj);

          if (this.showCollisions) {
            this.visMesh.setColorAt(i, this.ballCollisionColor);
          }
        }
      }
    }

    this.updateMesh();
  }
}
