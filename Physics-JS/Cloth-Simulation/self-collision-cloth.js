class Cloth {
  constructor(scene, numX, numY, spacing, thickness, bendingCompliance = 1.0) {
    // particles
    const jitter = 0.001 * spacing;

    this.numParticles = numX * numY;
    this.pos = new Float32Array(3 * this.numParticles);
    this.prevPos = new Float32Array(3 * this.numParticles);
    this.restPos = new Float32Array(3 * this.numParticles);
    this.vel = new Float32Array(3 * this.numParticles);
    this.invMass = new Float32Array(this.numParticles);
    this.thickness = thickness;
    this.handleCollisions = true;
    this.vecs = new Float32Array(4 * 3);

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numY; j++) {
        const id = i * numY + j;
        this.pos[3 * id] = -numX * spacing * 0.5 + i * spacing;
        this.pos[3 * id + 1] = 0.2 + j * spacing;
        this.pos[3 * id + 2] = 0.0;
        this.invMass[id] = 1.0;
      }
    }

    for (let i = 0; i < this.pos.length; i++) {
      this.pos[i] += -jitter * 2.0 * jitter * Math.random();
    }

    this.hash = new Hash(spacing, this.numParticles);

    this.restPos.set(this.pos);
    this.vel.fill(0.0);

    // constraints ?? not completely understand
    const numConstraintTypes = 6;

    this.ids = new Int32Array(this.numParticles * numConstraintTypes * 2);
    this.compliances = new Float32Array(this.numParticles * numConstraintTypes);
    const offsets = [
      0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 2, 0, 0, 2, 0,
    ];

    let num = 0;
    const stretchCompliance = 0.0;
    const shearCompliance = 0.0001;

    const compliances = [
      stretchCompliance,
      stretchCompliance,
      shearCompliance,
      shearCompliance,
      bendingCompliance,
      bendingCompliance,
    ];

    for (let constType = 0; constType < numConstraintTypes; constType++) {
      for (let i = 0; i < numX; i++) {
        for (let j = 0; j < numY; j++) {
          const p = 4 * constType;

          const i0 = i + offsets[p];
          const j0 = j + offsets[p + 1];
          const i1 = i + offsets[p + 2];
          const j1 = j + offsets[p + 3];
          if (i0 < numX && j0 < numY && i1 < numX && j1 < numY) {
            this.ids[num++] = i0 * numY + j0;
            this.ids[num++] = i1 * numY + j1;
            this.compliances[Math.floor(num / 2)] = compliances[constType];
          }
        }
      }
    }

    // randomize
    this.numConstraints = Math.floor(num / 2);

    // pre-compute rest lengths
    this.restLens = new Float32Array(this.numConstraints);
    for (let i = 0; i < this.numConstraints; i++) {
      const id0 = this.ids[2 * i];
      const id1 = this.ids[2 * i + 1];
      this.restLens[i] = Math.sqrt(
        vecDistSquared(this.pos, id0, this.pos, id1)
      );
    }

    // visual meshes
    const triIds = [];
    const edgeIds = [];

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numY; j++) {
        const id = i * numY + j;
        if (i < numX - 1 && j < numY - 1) {
          triIds.push(id + 1);
          triIds.push(id);
          triIds.push(id + 1 + numY);
          triIds.push(id + 1 + numY);
          triIds.push(id);
          triIds.push(id + numY);
        }
        if (i < numX - 1) {
          edgeIds.push(id);
          edgeIds.push(id + numY);
        }
        if (j < numY - 1) {
          edgeIds.push(id);
          edgeIds.push(id + 1);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geometry.setIndex(triIds);
    const visMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      side: THREE.FrontSide,
    });
    this.triMesh = new THREE.Mesh(geometry, visMaterial);
    this.triMesh.castShadow = true;
    this.triMesh.userData = this; // for raycasting
    this.triMesh.layers.enable(1);
    scene.add(this.triMesh);

    const backMaterial = new THREE.MeshPhongMaterial({
      color: 0xff8000,
      side: THREE.BackSide,
    });
    this.backMesh = new THREE.Mesh(geometry, backMaterial);
    this.backMesh.userData = this; // for raycasting
    this.backMesh.layers.enable(1);

    scene.add(this.backMesh);
    geometry.computeVertexNormals();

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3)
    );
    edgeGeometry.setIndex(edgeIds);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
    });
    this.edgeMesh = new THREE.LineSegments(geometry, lineMaterial);
    this.edgeMesh.visible = false;
    scene.add(this.edgeMesh);
    this.updateVisMeshes();
  }

  updateVisMeshes() {
    this.triMesh.geometry.computeVertexNormals();
    this.triMesh.geometry.attributes.position.needsUpdate = true;
    this.triMesh.geometry.computeBoundingSphere();

    this.edgeMesh.geometry.attributes.position.needsUpdate = true;
  }

  simulate(frameDt, numSubSteps, gravity) {
    const dt = frameDt / numSubSteps;
    const maxVelocity = (0.2 * this.thickness) / dt;

    if (this.handleCollisions) {
      this.hash.create(this.pos);
      const maxTravelDist = maxVelocity * frameDt;
      this.hash.queryAll(this.pos, maxTravelDist);
    }

    for (let step = 0; step < numSubSteps; step++) {
      // integrate
      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] > 0.0) {
          vecAdd(this.vel, i, gravity, 0, dt);
          const v = Math.sqrt(vecLengthSquared(this.vel, i));
          const maxV = (0.2 * this.thickness) / dt;
          if (v > maxV) {
            vecScale(this.vel, i, maxV / v);
          }
          vecCopy(this.prevPos, i, this.pos, i);
          vecAdd(this.pos, i, this.vel, i, dt);
        }
      }
      // solve
      this.solveGroundCollisions();

      this.solveConstraints(dt);

      if (this.handleCollisions) this.solveCollisions(dt);

      // update velocities
      for (let i = 0; i < this.numParticles; i++) {
        if (this.invMass[i] > 0.0) {
          vecSetDiff(this.vel, i, this.pos, i, this.prevPos, i, 1.0 / dt);
        }
      }
    }
    this.updateVisMeshes();
  }

  solveConstraints(dt) {
    for (let i = 0; i < this.numConstraints; i++) {
      const id0 = this.ids[2 * i];
      const id1 = this.ids[2 * i + 1];
      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w == 0.0) continue;
      vecSetDiff(this.vecs, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.vecs, 0));
      if (len == 0.0) continue;
      vecScale(this.vecs, 0, 1.0 / len);
      const restLen = this.restLens[i];
      const C = len - restLen;
      const alpha = this.compliances[i] / dt / dt;
      const s = -C / (w + alpha);
      vecAdd(this.pos, id0, this.vecs, 0, s * w0);
      vecAdd(this.pos, id1, this.vecs, 0, -s * w1);
    }
  }

  solveGroundCollisions() {
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      const y = this.pos[3 * i + 1];
      if (y < 0.5 * this.thickness) {
        const damping = 1.0;
        vecSetDiff(this.vecs, 0, this.pos, i, this.prevPos, i);
        vecAdd(this.pos, i, this.vecs, 0, -damping);
        this.pos[3 * i + 1] = 0.5 * this.thickness;
      }
    }
  }

  solveCollisions(dt) {
    const thickness2 = this.thickness * this.thickness;

    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      const id0 = i;
      const first = this.hash.firstAdjId[i];
      const last = this.hash.firstAdjId[i + 1];

      for (let j = first; j < last; j++) {
        const id1 = this.hash.adjIds[j];
        if (this.invMass[id1] == 0.0) continue;
        vecSetDiff(this.vecs, 0, this.pos, id1, this.pos, id0);
        const dist2 = vecLengthSquared(this.vecs, 0);
        if (dist2 > thickness2 || dist2 == 0.0) continue;
        const restDist2 = vecDistSquared(this.restPos, id0, this.restPos, id1);
        let minDist = this.thickness;
        if (dist2 > restDist2) continue;
        if (restDist2 < thickness2) minDist = Math.sqrt(restDist2);
        // position correction
        const dist = Math.sqrt(dist2);
        vecScale(this.vecs, 0, (minDist - dist) / dist);
        vecAdd(this.pos, id0, this.vecs, 0, -0.5);
        vecAdd(this.pos, id1, this.vecs, 0, 0.5);

        // velocities
        vecSetDiff(this.vecs, 0, this.pos, id0, this.prevPos, id0);
        vecSetDiff(this.vecs, 1, this.pos, id1, this.prevPos, id1);

        // average velocity
        vecSetSum(this.vecs, 2, this.vecs, 0, this.vecs, 1, 0.5);

        // velocity corrections
        vecSetDiff(this.vecs, 0, this.vecs, 2, this.vecs, 0);
        vecSetDiff(this.vecs, 1, this.vecs, 2, this.vecs, 1);

        // add corrections
        var friction = 0.0;
        vecAdd(this.pos, id0, this.vecs, 0, friction);
        vecAdd(this.pos, id1, this.vecs, 1, friction);
      }
    }
  }

  startGrab(pos) {
    const p = [pos.x, pos.y, pos.z];
    let minD2 = Number.MAX_VALUE;
    this.grabId = -1;
    for (let i = 0; i < this.numParticles; i++) {
      const d2 = vecDistSquared(p, 0, this.pos, i);
      if (d2 < minD2) {
        minD2 = d2;
        this.grabId = i;
      }
    }
    if (this.grabId >= 0) {
      this.grabInvMass = this.invMass[this.grabId];
      this.invMass[this.grabId] = 0.0;
      vecCopy(this.pos, this.grabId, p, 0);
    }
  }

  moveGrabbed(pos) {
    if (this.grabId >= 0) {
      const p = [pos.x, pos.y, pos.z];
      vecCopy(this.pos, this.grabId, p, 0);
    }
  }

  endGrab(pos, vel) {
    if (this.grabId >= 0) {
      this.invMass[this.grabId] = this.grabInvMass;
      const v = [vel.x, vel.y, vel.z];
      vecCopy(this.vel, this.grabId, v, 0);
    }
    this.grabId = -1;
  }
}
