class Cloth {
  constructor(mesh, scene, bendingCompliance = 1.0) {
    // particles
    this.numParticles = mesh.vertices.length / 3;
    this.pos = new Float32Array(mesh.vertices);
    this.prevPos = new Float32Array(mesh.vertices);
    this.restPos = new Float32Array(mesh.vertices);
    this.vel = new Float32Array(3 * this.numParticles);
    this.invMass = new Float32Array(this.numParticles);

    // stretching and bending constraints
    const neighbors = findTriNeighbors(mesh.faceTriIds);
    const numTris = mesh.faceTriIds.length / 3;
    const edgeIds = [];
    const triPairIds = [];

    for (let i = 0; i < numTris; i++) {
      for (let j = 0; j < 3; j++) {
        const id0 = mesh.faceTriIds[3 * i + j];
        const id1 = mesh.faceTriIds[3 * i + ((j + 1) % 3)];

        // each edge only once
        const n = neighbors[3 * i + j];
        if (n < 0 || id0 < id1) {
          edgeIds.push(id0);
          edgeIds.push(id1);
        }

        // tri pair
        if (n >= 0) {
          // opposite ids
          const ni = Math.floor(n / 3);
          const nj = n % 3;
          const id2 = mesh.faceTriIds[3 * i + ((j + 2) % 3)];
          const id3 = mesh.faceTriIds[3 * ni + ((nj + 2) % 3)];
          triPairIds.push(id0);
          triPairIds.push(id1);
          triPairIds.push(id2);
          triPairIds.push(id3);
        }
      }
    }

    this.stretchingIds = new Int32Array(edgeIds);
    this.bendingIds = new Int32Array(triPairIds);
    this.stretchingLengths = new Float32Array(this.stretchingIds.length / 2);
    this.bendingLengths = new Float32Array(this.bendingIds.length / 4);

    this.stretchingCompliance = 0.0;
    this.bendingCompliance = bendingCompliance;

    this.temp = new Float32Array(4 * 3);
    this.grads = new Float32Array(4 * 3);

    this.grabId = -1;
    this.grabInvMass = 0.0;

    this.initPhysics(mesh.faceTriIds);

    // visual edge mesh
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
    this.edgeMesh = new THREE.LineSegments(edgeGeometry, lineMaterial);
    this.edgeMesh.visible = false;
    scene.add(this.edgeMesh);

    //  visual tri mesh
    const faceGeometry = new THREE.BufferGeometry();
    faceGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3)
    );
    faceGeometry.setIndex(mesh.faceTriIds);
    const visMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
    });
    this.triMesh = new THREE.Mesh(faceGeometry, visMaterial);
    this.triMesh.castShadow = true;
    this.triMesh.userData = this; // for raycasting

    this.triMesh.layers.enable(1);
    scene.add(this.triMesh);
    faceGeometry.computeVertexNormals();

    this.updateMeshes();

    this.volIdOrder = [
      [1, 3, 2],
      [0, 2, 3],
      [0, 3, 1],
      [0, 1, 2],
    ];
  }

  initPhysics(triIds) {
    this.invMass.fill(0.0);

    const numTris = triIds.length / 3;
    const e0 = [0.0, 0.0, 0.0];
    const e1 = [0.0, 0.0, 0.0];
    const c = [0.0, 0.0, 0.0];

    for (let i = 0; i < numTris; i++) {
      const id0 = triIds[3 * i];
      const id1 = triIds[3 * i + 1];
      const id2 = triIds[3 * i + 2];
      vecSetDiff(e0, 0, this.pos, id1, this.pos, id0);
      vecSetDiff(e1, 0, this.pos, id2, this.pos, id0);
      vecSetCross(c, 0, e0, 0, e1, 0);
      const A = 0.5 * Math.sqrt(vecLengthSquared(c, 0));
      const pInvMass = A > 0.0 ? 1.0 / A / 3.0 : 0.0;
      this.invMass[id0] += pInvMass;
      this.invMass[id1] += pInvMass;
      this.invMass[id2] += pInvMass;
    }

    for (let i = 0; i < this.stretchingLengths.length; i++) {
      const id0 = this.stretchingIds[2 * i];
      const id1 = this.stretchingIds[2 * i + 1];
      this.stretchingLengths[i] = Math.sqrt(
        vecDistSquared(this.pos, id0, this.pos, id1)
      );
    }

    for (let i = 0; i < this.bendingLengths; i++) {
      const id0 = this.bendingIds[4 * i + 2];
      const id2 = this.bendingIds[4 * i + 3];
      this.bendingLengths[i] = Math.sqrt(
        vecDistSquared(this.pos, id0, this.pos, id1)
      );
    }

    // two attach points
    let minX = Number.MAX_VALUE;
    let maxX = -Number.MAX_VALUE;
    let maxY = -Number.MAX_VALUE;

    for (let i = 0; i < this.numParticles; i++) {
      minX = Math.min(minX, this.pos[3 * i]);
      maxX = Math.max(maxX, this.pos[3 * i]);
      maxY = Math.max(maxY, this.pos[3 * i + 1]);
    }

    const eps = 0.0001;

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.pos[3 * i];
      const y = this.pos[3 * i + 1];
      if (y > maxY - eps && (x < minX + eps || x > maxX - eps)) {
        this.invMass[i] = 0.0;
      }
    }
  }

  preSolve(dt, gravity) {
    for (var i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      vecAdd(this.vel, i, gravity, 0, dt);
      vecCopy(this.prevPos, i, this.pos, i);
      vecAdd(this.pos, i, this.vel, i, dt);
      var y = this.pos[3 * i + 1];
      if (y < 0.0) {
        vecCopy(this.pos, i, this.prevPos, i);
        this.pos[3 * i + 1] = 0.0;
      }
    }
  }

  solve(dt) {
    this.solveStretching(this.stretchingCompliance, dt);
    // this.solveBending(this.bendingCompliance, dt);
  }

  postSolve(dt) {
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      vecSetDiff(this.vel, i, this.pos, i, this.prevPos, i, 1.0 / dt);
    }
  }

  solveStretching(compliance, dt) {
    const alpha = compliance / dt / dt;

    for (let i = 0; i < this.stretchingLengths.length; i++) {
      const id0 = this.stretchingIds[2 * i];
      const id1 = this.stretchingIds[2 * i + 1];
      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w == 0.0) continue;

      vecSetDiff(this.grads, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.grads, 0));
      if (len == 0.0) continue;
      vecScale(this.grads, 0, 1.0 / len);
      const restLen = this.stretchingLengths[i];
      const C = len - restLen;
      const s = -C / (w + alpha);
      vecAdd(this.pos, id0, this.grads, 0, s * w0);
      vecAdd(this.pos, id1, this.grads, 0, -s * w1);
    }
  }

  solveBending(compliance, dt) {
    const alpha = compliance / dt / dt;

    for (let i = 0; i < this.bendingLengths.length; i++) {
      const id0 = this.bendingIds[4 * i + 2];
      const id1 = this.bendingIds[4 * i + 3];
      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w == 0.0) continue;

      vecSetDiff(this.grads, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.grads, 0));
      if (len == 0.0) continue;
      vecScale(this.grads, 0, 1.0 / len);
      const restLen = this.bendingLengths[i];
      const C = len - restLen;
      const s = -C / (w + alpha);
      vecAdd(this.pos, id0, this.grads, 0, s * w0);
      vecAdd(this.pos, id1, this.grads, 0, -s * w1);
    }
  }

  updateMeshes() {
    this.triMesh.geometry.computeVertexNormals();
    this.triMesh.geometry.attributes.position.needsUpdate = true;
    this.triMesh.geometry.computeBoundingSphere();

    this.edgeMesh.geometry.attributes.position.needsUpdate = true;
  }

  endFrame() {
    this.updateMeshes();
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

  moveGrabbed(pos, vel) {
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

function findTriNeighbors(triIds) {
  // create common edges

  var edges = [];
  var numTris = triIds.length / 3;

  for (var i = 0; i < numTris; i++) {
    for (var j = 0; j < 3; j++) {
      var id0 = triIds[3 * i + j];
      var id1 = triIds[3 * i + ((j + 1) % 3)];
      edges.push({
        id0: Math.min(id0, id1),
        id1: Math.max(id0, id1),
        edgeNr: 3 * i + j,
      });
    }
  }

  // sort so common edges are next to each other

  edges.sort((a, b) =>
    a.id0 < b.id0 || (a.id0 == b.id0 && a.id1 < b.id1) ? -1 : 1
  );

  // find matchign edges

  neighbors = new Float32Array(3 * numTris);
  neighbors.fill(-1); // open edge

  var nr = 0;
  while (nr < edges.length) {
    var e0 = edges[nr];
    nr++;
    if (nr < edges.length) {
      var e1 = edges[nr];
      if (e0.id0 == e1.id0 && e0.id1 == e1.id1) {
        neighbors[e0.edgeNr] = e1.edgeNr;
        neighbors[e1.edgeNr] = e0.edgeNr;
      }
      nr++;
    }
  }

  return neighbors;
}
