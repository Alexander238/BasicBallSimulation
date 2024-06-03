/**
 * Credit to https://joshbradley.me/object-collisions-with-canvas/ for the base of this code.
 *
 *  ToDo: Friction?, No-Clip into the rotating circles.
 */

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(vector) {
        return new Vector(this.x + vector.x, this.y + vector.y);
    }

    subtract(vector) {
        return new Vector(this.x - vector.x, this.y - vector.y);
    }

    multiply(scalar) {
        return new Vector(this.x * scalar, this.y * scalar);
    }

    dotProduct(vector) {
        return this.x * vector.x + this.y * vector.y;
    }

    get magnitude() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
    }

    get direction() {
        return Math.atan2(this.x, this.y);
    }
}

let balls = [];

let worldGravityY = 0.00005;
const worldGravity = new Vector(0, worldGravityY);

class Canvas {
    constructor(parent = document.body, width = 800, height = 800) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        parent.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    reload(state) {
        this.clearDisplay();
        this.drawActors(state.actors);
    }

    clearDisplay() {
        this.ctx.fillStyle = 'rgba(255,255,255,.4)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawActors(actors) {
        for (let actor of actors) {
            if (actor.type === 'ball') {
                this.drawBall(actor);
            }

            if (actor.type === 'circle') {
                this.drawHollowCircle(actor);
            }
        }
    }

    drawBall(actor) {
        this.ctx.beginPath();
        this.ctx.arc(actor.position.x, actor.position.y, actor.radius, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fillStyle = actor.color;
        this.ctx.fill();
    }

    /*
    1/2 * Math.PI, Math.PI * 2
        this.openAngleRange = config.openAngleRange || Math.PI / 2;
        this.openGapStart = config.openGapStart || 0;
        this.openGapEnd = this.openGapStart + this.openAngleRange;
     */

    drawHollowCircle(actor) {
        const startAngle = actor.openGapStart + actor.openAngleRange;
        const endAngle = actor.openGapEnd - actor.openAngleRange

        this.ctx.beginPath();
        this.ctx.arc(actor.position.x, actor.position.y, actor.radius, startAngle, endAngle);
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = actor.color;
        this.ctx.stroke();
    }
}

class State {
    constructor(display, actors) {
        this.display = display;
        this.actors = actors;
        this.updateId = 0;
    }

    update(time) {
        this.updateId++;
        const actors = this.actors.map(actor => actor.update(this, time, this.updateId));
        return new State(this.display, actors);
    }
}

class Ball {
    // Config is used to be able to override default values
    constructor(config = {}) {
        this.type = 'ball';
        this.position = config.position || new Vector(20, 20);
        this.velocity = config.velocity || new Vector(0.75, 1.5);
        this.radius = config.radius || 10;
        this.color = config.color || 'red';

        this.mass = Math.PI * this.radius ** 2;
        this.gravityForce = config.gravityForce || worldGravity.multiply(this.mass);

        this.id = 0;
        this.collisions = [];
    }

    get sphereArea() {
        return 4 * Math.PI * this.radius ** 2;
    }

    applyGravity() {
        this.velocity = this.velocity.add(this.gravityForce);
    }

    checkBallCollision(state, updateId) {
        for (let actor of state.actors) {
            if (this === actor || this.collisions.includes(actor.id + updateId) || actor.type !== 'ball') {
                continue;
            }

            /**
             * Check collision in next frame and update them as if they'd collide in this frame.
             * Balls can't collide with each other in the same frame, thus never getting the chance of overlapping at all.
             */
            const distance = this.position.add(this.velocity)
                .subtract(actor.position.add(actor.velocity))
                .magnitude;

            if (distance <= this.radius + actor.radius) {
                const v1 = collisionVector(this, actor);
                const v2 = collisionVector(actor, this);
                this.velocity = v1;
                actor.velocity = v2;
                this.collisions.push(actor.id + updateId);
                actor.collisions.push(this.id + updateId);
            }
        }
    }

    checkHollowCircleCollision(state, updateId) {
        for (let actor of state.actors) {
            if (actor.type !== 'circle') {
                continue;
            }

            // Distance between the ball and the center of the circle
            const distanceToCenter = this.position.add(this.velocity)
                .subtract(actor.position.add(actor.velocity))
                .magnitude;

            // Angle of the ball relative to the center of the circle
            const angle = Math.atan2(
                this.position.y - actor.position.y,
                this.position.x - actor.position.x
            );
            const normalizedAngle = (angle + 2 * Math.PI) % (2 * Math.PI);

            const inOpenGap = normalizedAngle >= actor.openGapStart && normalizedAngle <= actor.openGapEnd;

            // distance >= actor.radius - this.radius && distance <= actor.radius + 3
            if (distanceToCenter >= actor.radius - this.radius && distanceToCenter <= actor.radius + 9 && !inOpenGap) {
                this.velocity = hollowCircleCollisionVector(this, actor);
                this.collisions.push(actor.id + updateId);
            }
        }
    }

    update(state, time, updateId) {
        document.getElementById("ballPosition").innerText = `Ball position: ${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}`;

        // prevent memory issues, could cause lags otherwise.
        let cLength = this.collisions.length;
        if (cLength > 10) {
            this.collisions.slice(cLength - 3);
        }

        const upperLimit = new Vector(
            state.display.canvas.width - this.radius,
            state.display.canvas.height - this.radius
        );
        const lowerLimit = new Vector(0 + this.radius, 0 + this.radius);

        this.applyGravity();

        // Check if hitting left or right of display
        if (this.position.x >= upperLimit.x || this.position.x <= lowerLimit.x) {
            this.velocity = new Vector(-this.velocity.x, this.velocity.y);
        }

        // Check if hitting top or bottom of display
        if (this.position.y >= upperLimit.y || this.position.y <= lowerLimit.y) {
            this.velocity = new Vector(this.velocity.x, -this.velocity.y + (this.gravityForce.y * 1.5));
        }

        this.checkBallCollision(state, updateId);
        this.checkHollowCircleCollision(state, updateId);

        /**
         * Balls cannot clip through the walls with this anymore.
         */
        let newX = Math.max(
            Math.min(this.position.x + this.velocity.x, upperLimit.x),
            lowerLimit.x
        );

        let newY = Math.max(
            Math.min(this.position.y + this.velocity.y, upperLimit.y),
            lowerLimit.y
        );

        return new Ball({
            ...this,
            position: new Vector(newX, newY),
        });

    }
}

class Circle {
    constructor(config = {}) {
        this.type = 'circle';
        this.position = config.position || new Vector(0, 0);
        this.velocity = config.velocity || new Vector(0, 0);
        this.radius = config.radius || 100;
        this.color = config.color || 'red';

        this.rotationSpeed = config.rotationSpeed || 0.003;
        this.rotationDirection = config.rotationDirection || 1;

        this.openAngleRange = config.openAngleRange || Math.PI / 2;
        this.openGapStart = config.openGapStart || 0;
        this.openGapEnd = this.openGapStart + this.openAngleRange;

        this.ctx = config.ctx || null;

        this.id = 0;
        this.collisions = [];
    }

    // rotate this circle by a certain amount of radians
    rotate() {
        this.openGapStart += this.rotationSpeed * this.rotationDirection;
        this.openGapEnd += this.rotationSpeed * this.rotationDirection;

        if (this.openGapEnd > Math.PI * 2) {
            this.openGapEnd = this.openGapEnd - Math.PI * 2;
        } else if (this.openGapEnd < 0) {
            this.openGapEnd = this.openGapEnd + Math.PI * 2;
        }

        if (this.openGapStart > Math.PI * 2) {
            this.openGapStart = this.openGapStart - Math.PI * 2;
        } else if (this.openGapStart < 0) {
            this.openGapStart = this.openGapStart + Math.PI * 2;
        }
    }

    update(state, time) {
        this.rotate()

        return new Circle( {
            ...this,
        });
    }

}

function hollowCircleCollisionVector(ball, circle) {
    const normalVector = circle.position.subtract(ball.position);
    const distance = normalVector.magnitude;

    const normalizedNormalVector = new Vector(normalVector.x / distance, normalVector.y / distance);

    // Calculate the velocity vector perpendicular to the normalVector vector
    const perpendicularVelocityMagnitude = ball.velocity.dotProduct(normalizedNormalVector);
    const perpendicularVelocity = normalizedNormalVector.multiply(perpendicularVelocityMagnitude);

    // Calculate the final velocity vector after the collision
    return ball.velocity.subtract(perpendicularVelocity.multiply(2));
}

function collisionVector(b1, b2) {
    return b1.velocity.subtract(
        // Subtract the positions
        b1.position.subtract(b2.position)
            /**
             * Multiply by the dot product of
             * the difference between the velocity
             * and position of both vectors
             **/
            .multiply(b1.velocity.subtract(b2.velocity).dotProduct(b1.position.subtract(b2.position))
                / b1.position.subtract(b2.position).magnitude ** 2)
            /**
             * Multiply by the amount of mass the
             * object represents in the collision.
             **/
            .multiply((2 * b2.sphereArea) / (b1.sphereArea + b2.sphereArea))
    );
}

function runAnimation(animation) {
    let lastTime = null;

    function frame(time) {
        if (lastTime !== null) {
            const timeStep = Math.min(100, time - lastTime) / 1000;

            animation(timeStep);
        }
        lastTime = time;

        // Schedule the next frame
        requestAnimationFrame(frame);
    }

// Start the animation loop by calling requestAnimationFrame and passing the frame function
    requestAnimationFrame(frame);
}

function startGame() {
    const display = new Canvas();

/*
    for (let i = 0; i < 9; i++) {
        let ball = new Ball({
            position: new Vector(Math.random() * display.canvas.width, Math.random() * display.canvas.height),
            velocity: new Vector(Math.random() * 2, 1),
            // radius need a min size
            radius: Math.max(10, Math.random() * 20),
            color: `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`
        });
        balls.push(ball);
    }
 */

    const ball = new Ball({
        position: new Vector(display.canvas.width / 2, display.canvas.height / 2),
        velocity: new Vector(0.5, 0.6),
        radius: 6,
        color: 'purple'
    });

    const circle1 = new Circle({
        color: "green",
        radius: 60,
        openGapStart: Math.PI,
        openAngleRange: Math.PI / 4,
        ctx: display.ctx,
        position: new Vector(display.canvas.height / 2, display.canvas.height / 2),
        rotationDirection: -1,
    });

    const circle2 = new Circle({
        color: "blue",
        radius: 120,
        openGapStart: 1.5 * Math.PI,
        openAngleRange: Math.PI / 4,
        ctx: display.ctx,
        position: new Vector(display.canvas.height / 2, display.canvas.height / 2),
    });

    const circle3 = new Circle({
        radius: 180,
        openGapStart: 2 * Math.PI,
        openAngleRange: Math.PI / 4,
        ctx: display.ctx,
        position: new Vector(display.canvas.height / 2, display.canvas.height / 2),
        rotationSpeed: 0.006,
        rotationDirection: -1,
    });

    const actors = [ball, circle1, circle2, circle3];

    for (let ball of balls) {
        actors.push(ball);
    }
    let state = new State(display, actors);

    runAnimation(time => {
        state = state.update(time);
        display.reload(state);
    });
}

startGame();

document.getElementById("startButton").addEventListener("click", function () {
    startGame();
    this.disabled = true;
});