# How to write a Water Simulator HeightFieldWater

Youtube: [How to write a Height-Field Water Simulator with 100 lines of code](https://www.youtube.com/watch?v=hswBi5wcqAA)

Materials: [How to write a Water Simulator](https://matthias-research.github.io/pages/tenMinutePhysics/20-heightFieldWater.pdf)

WebSite: [Ten Minute Physics](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)

Author: [Matthias Müller](https://matthias-research.github.io/pages/index.html)

Tags: Fluids, Water, Animation

## Basics

**Water as an Array of Columns**

![1.5D](./images/Untitled.png)

1.5D

![2.5D](./images/Untitled%201.png)

2.5D

Pros:

- Simple to simulate
- Fast
- Easy to extract the surface

Cons:

- No overturning waves
- No splashes (add particles)

**Grid Setup**

![Untitled](./images/Untitled%202.png)

- Each column stores a height `h` and a velocity `v`
- Both needed for a dynamic simulation
- The width `s` is the same for all columns

## Simulation

![Untitled](./images/Untitled%203.png)

![Untitled](./images/Untitled%204.png)

**Archimedes’ principle:**

Any object, totally or partially immersed in a fluid or liquid, is buoyed up by a force equal to the weight of the fluid displaced by the object.

- From Archimedes:
  $$
  f_1 \sim h_2 - h_1
  $$
- From Newton’s second law:
  $$
  a_1 \sim f_1
  $$
- From conservation of volume:
  $$
  a_2 = -a_1
  $$
- In the 1.5D Grid

  ![Untitled](./images/Untitled%205.png)

- Contribution from both neighbors:
  $$
  a_i \sim (h_{i+1} - h_i) - (h_i - h_{i-1}) \\
  a_i \sim h_{i-1} + h_{i+1} - 2h_i
  $$
  $$
  a_i = k(h_{i-1} + h_{i+1}-2h_i)
  $$
- From the discretization of the wave equation:

  $$
  k = \frac{c^2}{s^2}
  $$

  ```glsl
  let c = (this.waveSpeed * this.waveSpeed) / this.spacing / this.spacing;
  ```

- The constant `c` is the wave speed, `s` the column width.

- In the 2.5D Grid

  ![Untitled](./images/Untitled%206.png)

- With four neighbors:
  $$
  a_{i,j} \sim h_{i-1, j} + h_{i + 1, j} + h_{i, j-1} + h_{i, j+1} - 4h_{i, j}
  $$
- With the constant of proportionality
  $$
  a_{i,j} = \frac{c^2}{s^2}(h_{i-1, j} + h_{i + 1, j} + h_{i, j-1} + h_{i, j+1} - 4h_{i, j})
  $$
- Reflecting boundary condition:
  - If the neighbor $h_{i\pm 1, j\pm1}$ lays outside the domain replace it with $h_{i,j}$
- The Simulation Algorithms

  - For all cells $i,j$ in the domain:
    $$
    a_{i,j} \leftarrow \frac{c^2}{s^2}(h_{i-1, j} + h_{i + 1, j} + h_{i, j-1} + h_{i, j+1} - 4h_{i, j}) \\
    v_{i,j} \leftarrow v_{i,j} + \Delta t *a_{i,j}
    $$
  - For all cells $i,j$ in the domain:
    $$
    h_{i,j} \leftarrow h_{i,j} + \Delta t *v_{i,j}
    $$
  - Semi implicit Euler integration with time step size $\Delta t$
  - Stability criterion(CFD): $\Delta t * c < s$

  Code implementation: update water column height $h_{i,j}$

  ```glsl
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
            sumH += j < this.numZ - 1 ? this.heights[id + 1] : h;
            this.velocities[id] += gPhysicsScene.dt * c * (sumH - 4.0 * h);
            this.heights[id] += (0.25 * sumH - h) * pd; // positional damping
          }
        }

        for (let i = 0; i < this.numCells; i++) {
          this.velocities[i] *= vd; // velocity damping
          this.heights[i] += this.velocities[i] * gPhysicsScene.dt;
        }
  ```

## Object Interaction

- Object To Water First Try
  ![Untitled](./images/Untitled%207.png)
  Push columns down
  - Volume loss
  - Does not work for submerged bodies
- Object To Water - my solution
  ![Untitled](./images/Untitled%208.png)
  Use an additional field $b_{i,j}$

  $$
  h_{i, j}
  $$

  stores the total height of the column

  $$
  b_{i,j}
  $$

  stores the height. covered by objects

  Code implementation: **compute bodyHeight**

  ```glsl
  for (let i = 0; i < gPhysicsScene.objects.length; i++) {
        let ball = gPhysicsScene.objects[i];
        let pos = ball.pos;
        let br = ball.radius;
        let h2 = this.spacing * this.spacing;
        // grids intersect with the ball
        let x0 = Math.max(0, cx + Math.floor((pos.x - br) * h1));
        let x1 = Math.min(this.numX - 1, cx + Math.floor((pos.x + br) * h1));
        let z0 = Math.max(0, cz + Math.floor((pos.z - br) * h1));
        let z1 = Math.min(this.numZ - 1, cz + Math.floor((pos.z + br) * h1));

        for (let xi = x0; xi <= x1; xi++) {
          for (let zi = z0; zi < z1; zi++) {
            let x = (xi - cx) * this.spacing;
            let z = (zi - cz) * this.spacing;
            // the distance between the current grid and the ball center
            let r2 = (pos.x - x) * (pos.x - x) + (pos.z - z) * (pos.z - z);
            if (r2 < br * br) { //
              let bodyHalfHeight = Math.sqrt(br * br - r2);
              let waterHeight = this.heights[xi * this.numZ + zi];

              let bodyMin = Math.max(pos.y - bodyHalfHeight, 0.0);
              let bodyMax = Math.min(pos.y + bodyHalfHeight, waterHeight);
              var bodyHeight = Math.max(bodyMax - bodyMin, 0.0);
              if (bodyHeight > 0.0) {
                ball.applyForce(-bodyHeight * h2 * gPhysicsScene.gravity.y);
                this.bodyHeights[xi * this.numZ + zi] += bodyHeight;
              }
            }
          }
        }
      }
  ```

- Water Update

  - For all cells $i,j$ in the domain:

    $$
    h_{i,j} \leftarrow h_{i,j} + \alpha(b_{i,j} - b_{i,j}^{prev})
    $$

    ````glsl
        for (let i = 0; i < this.numCells; i++) {
        	let bodyChange = this.bodyHeights[i] - this.prevHeights[i];
        	this.heights[i] += this.alpha * bodyChange;
        }
        ```
    ````

  - Add the **change** of $b_{i,j}$ to the heights
  - Can be positive or negative, bo bias, volume conservation
  - The parameter $0 \le \alpha \le 1$ defines the intensity of the effect
  - Smooth $b_{i,j}$ to prevent spikes and instabilities

        ```glsl
        for (let iter = 0; iter < 2; iter++) {
              for (let xi = 0; xi < this.numX; xi++) {
                for (let zi = 0; zi < this.numZ; zi++) {
                  let id = xi * this.numZ + zi;

                  let num = xi > 0 && xi < this.numX - 1 ? 2 : 1;
                  num += zi > 0 && zi < this.numZ - 1 ? 2 : 1;
                  let avg = 0.0;
                  if (xi > 0) avg += this.bodyHeights[id - this.numZ];
                  if (xi < this.numX - 1) avg += this.bodyHeights[id + this.numZ];
                  if (zi > 0) avg += this.bodyHeights[id - 1];
                  if (zi < this.numZ - 1) avg += this.bodyHeights[id + 1];
                  avg /= num;
                  this.bodyHeights[id] = avg;
                }
              }
            }
        ```

- Water to Object
  ![Untitled](./images/Untitled%209.png)
  For each overlap of an object with a water column:
  apply the force $f = mg = \rho_{water}os^2g$
  to the object at the position of the column, where $g$ is the gravitational acceleration.

## Rendering

- Render a Transparent Plane
  ![Untitled](./images/Untitled%2010.png)
  - Render the scene behind the plane to the texture
    using the current camera
  - Use the screen coordinates of the fragment to locate the color in the texture
- Add Refraction Effect
  ![Untitled](./images/Untitled%2011.png)
  - Use the screen coordinates of the fragment plus an offset to locate the color in the texture.
  - Make direction of the offset dependent on the surface normal.
  - Make length of the offset dependent the distance to the camera.
