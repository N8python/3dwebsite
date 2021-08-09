let mainScene;
const easeInOut = x => x < .5 ? 2 * x * x : -1 + (4 - 2 * x) * x;

function angleDifference(angle1, angle2) {
    const diff = ((angle2 - angle1 + Math.PI) % (Math.PI * 2)) - Math.PI;
    return (diff < -Math.PI) ? diff + (Math.PI * 2) : diff;
}
const insertAt = (source, target, toInsert) => {
    return source.slice(0, source.indexOf(target) + target.length) +
        toInsert +
        source.slice(source.indexOf(target) + target.length);
}
class MainScene extends Scene3D {
    constructor() {
        super({ key: 'MainScene' })
    }

    init() {
        this.accessThirdDimension()
    }

    async create() {
        mainScene = this;
        this.third.warpSpeed("-sky", "-ground", '-orbitControls');
        this.player = new ExtendedObject3D();
        this.player.velocity = new THREE.Vector3();
        this.player.acceleration = new THREE.Vector3();
        this.player.position.y = 2;
        this.firstPersonControls = new FirstPersonControls(this.third.camera, this.player, {});
        this.input.on('pointerdown', () => {
            if (mainScene.input.mousePointer.locked) {
                if (this.targetWeaponPositions.length === 0 && this.targetWeaponRotations.length === 0) {
                    this.targetWeaponRotations.push({ x: -0.85, y: 0, z: 0.2, time: 200, progress: 0 });
                    this.targetWeaponPositions.push({ x: -0.3, y: 0.25, z: 0.5, time: 200, progress: 0 });
                    this.targetWeaponRotations.push({ x: 0, y: 0, z: 0, time: 200, progress: 0 });
                    this.targetWeaponPositions.push({ x: 0, y: 0, z: 0, time: 200, progress: 0 });
                    console.time();
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera({ x: 0, y: 0 }, this.third.camera);
                    let minDist = 3;
                    let chosenMesh;
                    this.agents.forEach(agent => {
                        const mesh = agent.testModel;
                        const meshBox = new THREE.Box3().setFromObject(mesh);
                        if (raycaster.ray.intersectsBox(meshBox)) {
                            const distanceFromSource = this.third.camera.position.distanceTo(mesh.getWorldPosition());
                            if (distanceFromSource < minDist) {
                                minDist = distanceFromSource;
                                chosenMesh = agent;
                            }
                        }
                    });
                    if (chosenMesh) {
                        displayText(chosenMesh.name, chosenMesh.message, chosenMesh.arrow);
                    } else {
                        minDist = 5;
                        this.links.forEach(link => {
                            const mesh = link;
                            const meshBox = new THREE.Box3().setFromObject(mesh);
                            if (raycaster.ray.intersectsBox(meshBox)) {
                                const distanceFromSource = this.third.camera.position.distanceTo(mesh.getWorldPosition());
                                if (distanceFromSource < minDist) {
                                    minDist = distanceFromSource;
                                    chosenMesh = link;
                                }
                            }
                        });
                        if (chosenMesh) {
                            window.open(chosenMesh.link);
                        }
                    }
                }
            }
            this.input.mouse.requestPointerLock();
        });
        this.input.on('pointermove', pointer => {
            if (this.input.mouse.locked) {
                this.firstPersonControls.update(pointer.movementX, pointer.movementY);
            }
        });
        this.events.on('update', () => {
            this.firstPersonControls.update(0, 0);
        });
        this.ground = makeBox(10, 1, 10);
        this.third.add.existing(this.ground);
        this.paths = [];
        this.agents = [];
        this.walls = [];
        this.links = [];
        this.arrowTexture = await this.third.load.texture("arrow.png");
        const breathAnim = await this.third.load.fbx("Breathing Idle (14).fbx");
        const oldStuff = await createPath("Old Stuff", {
            agentHeader: "Nostalgic Agent",
            agentMessage: "Be wary, visitor - this path contains all of N8's old projects. And by old we mean bad. There's some really crappy stuff down there. Explore at your own risk. Or if you are one of N8's nonexistent OG fans, enjoy the nostalgia.",
            agentAnim: breathAnim
        })
        oldStuff.position.x = 7.5;
        const coolStuff = await createPath("Cool Stuff", {
            agentHeader: "Plain Agent",
            agentMessage: "Down this path lies... well all of N8's projects that are somewhat decent but didn't fit in the other two categories. Games, applications, fun experiments. Pretty much just a miscellaneous \"good\" section.",
            agentAnim: breathAnim
        })
        coolStuff.position.x = -7.5;
        coolStuff.rotation.y = Math.PI;
        const aiStuff = await createPath("AI Stuff", {
            agentHeader: "Solemn Agent",
            agentMessage: "Down this path lies an assortment of various machine learning projects - with various levels of success. Tread carefully, for this path is wrought with bugs, syntax, tears, and dialogue that takes itself too seriously.",
            agentAnim: breathAnim
        })
        aiStuff.rotation.y = -Math.PI / 2;
        aiStuff.position.z = 7.5;
        const dStuff = await createPath("3D Stuff", {
            agentHeader: "Self-Deprecating Agent",
            agentMessage: "Discover a rich world of half-finished three dimensional games - with various levels of quality. Play at your own risk. No refunds. Follow this path now - 5% off your first walk!",
            agentAnim: breathAnim
        })
        dStuff.rotation.y = Math.PI / 2;
        dStuff.position.z = -7.5;
        this.paths.push(oldStuff);
        this.paths.push(coolStuff);
        this.paths.push(aiStuff);
        this.paths.push(dStuff);
        this.paths.forEach(path => {
            this.third.add.existing(path);
        })
        const planeGeo = new THREE.PlaneGeometry(30, 100);
        const planeMaterial = new THREE.ShaderMaterial({

            uniforms: {

                time: { value: Math.round(Math.random() * 10000) },
                //resolution: { value: new THREE.Vector2() }

            },

            vertexShader: `
            varying vec3 v_Position;
            varying vec3 v_Normal;
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                v_Position = position;
                v_Normal = normal;
            }
            `,

            fragmentShader: `
            varying vec3 v_Position;
            varying vec3 v_Normal;
            uniform float time;
            vec3 random3(vec3 c) {
                float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
                vec3 r;
                r.z = fract(512.0*j);
                j *= .125;
                r.x = fract(512.0*j);
                j *= .125;
                r.y = fract(512.0*j);
                return r-0.5;
            }
            
            /* skew constants for 3d simplex functions */
            const float F3 =  0.3333333;
            const float G3 =  0.1666667;
            
            /* 3d simplex noise */
            float simplex3d(vec3 p) {
                 /* 1. find current tetrahedron T and it's four vertices */
                 /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
                 /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/
                 
                 /* calculate s and x */
                 vec3 s = floor(p + dot(p, vec3(F3)));
                 vec3 x = p - s + dot(s, vec3(G3));
                 
                 /* calculate i1 and i2 */
                 vec3 e = step(vec3(0.0), x - x.yzx);
                 vec3 i1 = e*(1.0 - e.zxy);
                 vec3 i2 = 1.0 - e.zxy*(1.0 - e);
                     
                 /* x1, x2, x3 */
                 vec3 x1 = x - i1 + G3;
                 vec3 x2 = x - i2 + 2.0*G3;
                 vec3 x3 = x - 1.0 + 3.0*G3;
                 
                 /* 2. find four surflets and store them in d */
                 vec4 w, d;
                 
                 /* calculate surflet weights */
                 w.x = dot(x, x);
                 w.y = dot(x1, x1);
                 w.z = dot(x2, x2);
                 w.w = dot(x3, x3);
                 
                 /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
                 w = max(0.6 - w, 0.0);
                 
                 /* calculate surflet components */
                 d.x = dot(random3(s), x);
                 d.y = dot(random3(s + i1), x1);
                 d.z = dot(random3(s + i2), x2);
                 d.w = dot(random3(s + 1.0), x3);
                 
                 /* multiply d by w^4 */
                 w *= w;
                 w *= w;
                 d *= w;
                 
                 /* 3. return the sum of the four surflets */
                 return dot(d, vec4(52.0));
            }
            
            /* const matrices for 3d rotation */
            const mat3 rot1 = mat3(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
            const mat3 rot2 = mat3(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
            const mat3 rot3 = mat3(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);
            
            /* directional artifacts can be reduced by rotating each octave */
            float simplex3d_fractal(vec3 m) {
                return   0.5333333*simplex3d(m*rot1)
                        +0.2666667*simplex3d(2.0*m*rot2)
                        +0.1333333*simplex3d(4.0*m*rot3)
                        +0.0666667*simplex3d(8.0*m);
            }            
            void main() {
                float normal = (1.0 - abs(v_Normal.y));
                if (normal < 1.0) {
                    normal = 1.0;
                }
                float noise_intensity = simplex3d_fractal(vec3(((v_Position.x+v_Position.y * 0.25) * 1.0), ((v_Position.y - time) * 1.0 * normal), ((v_Position.z+v_Position.y * 0.1) * 1.0)));
                float final_intensity = pow(noise_intensity, 1.0);
                if (final_intensity > 0.3) {
                    final_intensity = pow(final_intensity, 0.33);
                } else {
                    final_intensity = 0.0;
                }
                gl_FragColor = vec4(vec3(final_intensity), 1.0);
            }
            `,
            side: THREE.DoubleSide,
            transparent: true
        });
        this.torch = createTorch(false, true);
        this.torch.scale.set(0.2, 0.2, 0.2);
        this.third.add.existing(this.torch);
        const wallTorches = []
        const torch1 = createTorch();
        torch1.position.x = -4.75;
        torch1.position.z = -4.75;
        torch1.position.y = 0.5;
        torch1.scale.set(1, 1.5, 1);
        wallTorches.push(torch1);
        const torch2 = createTorch();
        torch2.position.x = 4.75;
        torch2.position.z = -4.75;
        torch2.position.y = 0.5;
        torch2.scale.set(1, 1.5, 1);
        wallTorches.push(torch2);
        const torch3 = createTorch();
        torch3.position.x = 4.75;
        torch3.position.z = 4.75;
        torch3.position.y = 0.5;
        torch3.scale.set(1, 1.5, 1);
        wallTorches.push(torch3);
        const torch4 = createTorch();
        torch4.position.x = -4.75;
        torch4.position.z = 4.75;
        torch4.position.y = 0.5;
        torch4.scale.set(1, 1.5, 1);
        wallTorches.push(torch4);
        wallTorches.forEach(torch => {
            this.ground.add(torch);
        });
        this.wallTorches = wallTorches;
        this.planeMaterial = planeMaterial;
        this.fireMat = this.torch.fireMat;
        const edgeGeo = new THREE.SphereGeometry(12.5, 16, 16);
        const edgeSphere = new THREE.Mesh(edgeGeo, planeMaterial);
        this.edgeSphere = edgeSphere;
        this.third.add.existing(edgeSphere);
        this.ground.renderOrder = 3;
        this.walls.forEach(wall => {
            wall.renderOrder = 1;
        });
        /*const testPlane = await makeWebsiteWindow("AI", {
            title: "Cat Creator",
            image: "catCreator.png",
            description: "A convolutional autoencoder trained on cats... sliders to modify the latent space... you can make tons of CUSTOM CATS! Use the sliders in this app to create any cat you could possibly *imagine! *if that cats that you imagine are all 64x64 pixels and very blurry."
        });
        testPlane.position.y = 2;
        this.third.add.existing(testPlane);*/
        this.third.renderer.setPixelRatio(2);
        this.third.renderer.transparency = THREE.OrderIndependentTransperancy;
        this.third.scene.background = new THREE.Color(0);
        this.third.composer = new EffectComposer(this.third.renderer);
        const renderPass = new RenderPass(this.third.scene, this.third.camera);
        this.third.composer.addPass(renderPass);
        this.third.composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 1.5, 0.4, 0.6));
        this.outlinePass = new THREE.OutlinePass(new THREE.Vector2(1, 1), this.third.scene, this.third.camera);
        this.outlinePass.edgeStrength = 8;
        this.outlinePass.edgeGlow = 1;
        this.outlinePass.edgeThickness = 2;
        this.outlinePass.pulsePeriod = 2.5;
        this.outlinePass.visibleEdgeColor.set('#ffffff');
        this.outlinePass.hiddenEdgeColor.set('#ffffff');
        this.targetWeaponRotations = [
            // { x: 0.3, y: 0, z: -0.2, time: 2, progress: 0 }
        ];
        this.currWeaponRotation = { x: 0, y: 0, z: 0 };
        this.targetWeaponPositions = [

        ];
        this.currWeaponPosition = { x: 0, y: 0, z: 0 };
        this.move = {};
        //this.third.composer.addPass(this.outlinePass);
        //this.outlinePass.selectedObjects = [agent1.testModel, agent2.testModel, agent3.testModel, agent4.testModel];
        this.third.camera.fov = 50;
        this.third.camera.updateProjectionMatrix();
        this.keys = {
            w: this.input.keyboard.addKey('w'),
            a: this.input.keyboard.addKey('a'),
            s: this.input.keyboard.addKey('s'),
            d: this.input.keyboard.addKey('d'),
            space: this.input.keyboard.addKey('Space'),
            enter: this.input.keyboard.addKey("Enter")
        };
        this.raycaster = new THREE.Raycaster();
        if (!localStorage._nw__controls) {
            displayText("Controls & Navigation", "Click to lock the pointer and use the mouse to look around. WASD to move, space to jump. Click to use your torch. Interact with the humanoid figures to explore the website. Standard FPS controls. Have fun!")
            localStorage._nw__controls = "true";
        }
        this.initiated = true;
    }
    update(time, delta) {
        if (!this.initiated) {
            return;
        }
        stats.end();
        this.delta = delta;
        this.timeScale = (delta) / (1000 / 60);
        this.planeMaterial.uniforms.time.value += 0.01 * this.timeScale;
        this.fireMat.uniforms.time.value += 0.01 * this.timeScale;
        this.wallTorches.forEach(torch => {
            torch.fireMat.uniforms.time.value += 0.01 * this.timeScale;
        });
        if (this.onPath) {
            if (this.ground.position.y < -15) {
                this.ground.visible = false;
            } else {
                this.ground.position.y -= 0.1 * this.timeScale;
                this.ground.position.y *= 1.1;
                if (this.chosenPath.position.x > 0) {
                    this.edgeSphere.position.x += (30 - this.edgeSphere.position.x) / 10;
                    this.edgeSphere.scale.x += (3 - this.edgeSphere.scale.x) / 10;
                } else if (this.chosenPath.position.x < 0) {
                    this.edgeSphere.position.x += (-30 - this.edgeSphere.position.x) / 10;
                    this.edgeSphere.scale.x += (3 - this.edgeSphere.scale.x) / 10;
                }
                if (this.chosenPath.position.z > 0) {
                    this.edgeSphere.position.z += (30 - this.edgeSphere.position.z) / 10;
                    this.edgeSphere.scale.z += (3 - this.edgeSphere.scale.z) / 10;
                } else if (this.chosenPath.position.z < 0) {
                    this.edgeSphere.position.z += (-30 - this.edgeSphere.position.z) / 10;
                    this.edgeSphere.scale.z += (3 - this.edgeSphere.scale.z) / 10;
                }
            }
            this.paths.forEach(path => {
                if (path !== this.chosenPath) {
                    if (path.position.y < -15) {
                        path.visible = false;
                    } else {
                        path.position.y -= 0.1 * this.timeScale;
                        path.position.y *= 1.1;
                    }
                }
            })
            this.pathTick += this.timeScale * 1;
        } else {
            this.edgeSphere.position.multiplyScalar(0.9);
            this.edgeSphere.scale.x += (1 - this.edgeSphere.scale.x) / 10;
            this.edgeSphere.scale.z += (1 - this.edgeSphere.scale.z) / 10;
            this.ground.visible = true;
            this.ground.position.y *= 0.9;
            if (this.ground.position.y > -0.1) {
                this.ground.position.y = 0;
            }
            this.paths.forEach(path => {
                path.position.y *= 0.9;
                if (path.position.y > -0.1) {
                    path.position.y = 0;
                }
                path.visible = true;
            })
        }
        const raycaster = new THREE.Raycaster()
            // x and y are normalized device coordinates from -1 to +1
        if (this.keys.w.isDown || this.keys.s.isDown || this.keys.a.isDown || this.keys.d.isDown) {
            this.move.x = Math.sin(time * -0.015) * 0.02;
            this.move.y = Math.sin(time * 0.015) * 0.02;
            this.move.z = Math.sin(time * 0.015) * 0.02;
        } else {
            this.move.x = Math.sin(time * -0.003) * 0.01;
            this.move.y = Math.sin(time * 0.003) * 0.01;
            this.move.z = Math.sin(time * 0.003) * 0.01;
        }
        if (this.keys.enter.isDown && canDismiss) {
            textBar.style.display = "none";
        }
        const deltaRot = new THREE.Vector3();
        if (this.targetWeaponRotations.length > 0) {
            const target = this.targetWeaponRotations[0];
            target.progress += this.delta;
            const percent = easeInOut(target.progress / target.time);
            const rp = target.progress / target.time;
            deltaRot.x = angleDifference(this.currWeaponRotation.x, target.x) * percent;
            deltaRot.y = angleDifference(this.currWeaponRotation.y, target.y) * percent;
            deltaRot.z = angleDifference(this.currWeaponRotation.z, target.z) * percent;
            if (rp >= 1) {
                deltaRot.multiplyScalar(0);
                this.currWeaponRotation = this.targetWeaponRotations.shift();
            }
        }
        const weaponChange = new THREE.Vector3();
        if (this.targetWeaponPositions.length > 0) {
            const target = this.targetWeaponPositions[0];
            target.progress += this.delta;
            const percent = easeInOut(target.progress / target.time);
            const rp = target.progress / target.time;
            //this.sword.rotateX((target.x - this.currWeaponPosition.x) * percent);
            //this.sword.rotateY((target.y - this.currWeaponPosition.y) * percent);
            // this.sword.rotateZ((target.z - this.currWeaponPosition.z) * percent);
            weaponChange.x = (target.x - this.currWeaponPosition.x) * percent;
            weaponChange.y = (target.y - this.currWeaponPosition.y) * percent;
            weaponChange.z = (target.z - this.currWeaponPosition.z) * percent;
            if (rp >= 1) {
                weaponChange.multiplyScalar(0);
                this.currWeaponPosition = this.targetWeaponPositions.shift();
            }
        }
        raycaster.setFromCamera({ x: 0.6 + this.currWeaponPosition.x - this.move.x + weaponChange.x, y: -1 + this.currWeaponPosition.y - this.move.y + weaponChange.y }, this.third.camera);
        const pos = new THREE.Vector3();
        pos.copy(raycaster.ray.direction);
        pos.multiplyScalar(1 + this.currWeaponPosition.z + this.move.z + weaponChange.z);
        pos.add(this.player.position);
        //pos.y += 1.7;
        //pos.z += 0.05;
        this.torch.position.copy(pos);
        this.torch.rotation.copy(this.third.camera.rotation);
        this.torch.rotateX(this.currWeaponRotation.x + deltaRot.x);
        this.torch.rotateY(this.currWeaponRotation.y + deltaRot.y);
        this.torch.rotateZ(this.currWeaponRotation.z + deltaRot.z);
        if (this.player.position.y > 2.5) {
            this.player.velocity.y -= 0.01;
        } else {
            this.player.velocity.y *= 0.8;
            this.player.position.y += (2 - this.player.position.y) / 3;
            if (this.keys.space.isDown) {
                this.player.acceleration.y = 0.5;
            }
        }
        const speed = 0.025;
        const direction = new THREE.Vector3();
        const rotation = this.third.camera.getWorldDirection(direction);
        const theta = Math.atan2(rotation.x, rotation.z);
        if (this.keys.w.isDown) {
            this.player.velocity.x += Math.sin(theta) * speed
            this.player.velocity.z += Math.cos(theta) * speed
        } else if (this.keys.s.isDown) {
            this.player.velocity.x -= Math.sin(theta) * speed
            this.player.velocity.z -= Math.cos(theta) * speed
        }

        // move sideways
        if (this.keys.a.isDown) {
            this.player.velocity.x += Math.sin(theta + Math.PI * 0.5) * speed
            this.player.velocity.z += Math.cos(theta + Math.PI * 0.5) * speed
        } else if (this.keys.d.isDown) {
            this.player.velocity.x += Math.sin(theta - Math.PI * 0.5) * speed
            this.player.velocity.z += Math.cos(theta - Math.PI * 0.5) * speed
        }
        this.player.velocity.multiplyScalar(0.9);
        this.player.position.add(this.player.velocity.clone().multiplyScalar(this.timeScale));
        this.player.acceleration.multiplyScalar(0.9);
        this.player.position.add(this.player.acceleration);
        if ((this.player.position.x <= -10 || this.player.position.x >= 10 || this.player.position.z >= 10 || this.player.position.z <= -10) && !this.chosenPath) {
            const closestPath = this.paths.find(path => {
                if (Math.abs(this.player.position.x - path.position.x) < 5 && Math.abs(this.player.position.z - path.position.z) < 5) {
                    return true;
                }
            });
            if (closestPath.arrow.visible === true && closestPath.arrow.material.opacity >= 1) {
                this.chosenPath = closestPath;
                this.onPath = true;
                this.pathTick = 0;
                if (this.chosenPath.state !== "active") {
                    this.chosenPath.state = "active";
                    this.chosenPath.addPath();
                }
            }
        }
        if (this.chosenPath) {
            let goBack = false;
            if (this.chosenPath.position.x !== 0) {
                if (this.player.position.x >= -5 && this.player.position.x <= 5) {
                    goBack = true;
                }
            }
            if (this.chosenPath.position.z !== 0) {
                if (this.player.position.z >= -5 && this.player.position.z <= 5) {
                    goBack = true;
                }
            }
            if (goBack) {
                this.chosenPath = undefined;
                this.onPath = false;
                this.pathTick = 0;
            }
        }
        const startPoint = new THREE.Vector3(this.player.position.x, 2, this.player.position.z);
        const endPoint = new THREE.Vector3(startPoint.x, startPoint.y - 2.5, startPoint.z);
        this.raycaster.set(endPoint, startPoint.sub(endPoint).normalize());
        if (this.raycaster.intersectObjects([this.ground, ...this.walls]).length === 0) {
            this.player.velocity.x *= -1;
            this.player.velocity.z *= -1;
            this.player.position.x += this.player.velocity.x * 3;
            this.player.position.z += this.player.velocity.z * 3;
            //this.player.position.add(this.player.velocity);
            //this.player.position.add(this.player.velocity);
            //this.player.position.add(this.player.velocity);
        }
        stats.begin();
    }
}
const textBar = document.getElementById("textBar");
const textHeader = document.getElementById("textHeader");
const textPriority = document.getElementById("textPriority");
const sleep = (time) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, time);
    })
}
let canDismiss = false;
let last = [];
const displayText = async(header, text, meshToVisible) => {
    last = []
    let id = Math.random();
    last.push(id);
    canDismiss = false;
    if (!meshToVisible) {
        canDismiss = true;
    }
    text += " (Enter to dismiss text box)."
    textBar.style.display = "block";
    textHeader.innerHTML = header;
    textPriority.innerHTML = "";
    for (let i = 0; i <= text.length; i++) {
        if (!last.includes(id)) {
            break;
        }
        await sleep(10 + Math.random() * 20);
        textPriority.innerHTML = text.slice(0, i);
        if (textPriority.innerHTML.endsWith("(Ent")) {
            if (meshToVisible) {
                meshToVisible.visible = true;
                let visibleInterval = setInterval(() => {
                    if (meshToVisible.material.opacity >= 1) {
                        clearInterval(visibleInterval);
                        return;
                    }
                    meshToVisible.material.opacity += 0.05;
                }, 16)
            }
            canDismiss = true;
        }
    }

}
const config = {
    type: Phaser.WEBGL,
    transparent: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth * Math.max(1, window.devicePixelRatio / 2),
        height: window.innerHeight * Math.max(1, window.devicePixelRatio / 2)
    },
    scene: [MainScene],
    ...Canvas()
}

window.addEventListener('load', () => {
    enable3d(() => new Phaser.Game(config)).withPhysics('./lib')
})
var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);