const makeBox = (width, height, depth) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry, 90);
    const lineGeo = new THREE.LineGeometry(edges);
    const poses = [
        [-width / 2, height / 2, -depth / 2],
        [-width / 2, -height / 2, -depth / 2],
        [-width / 2, -height / 2, depth / 2],
        [-width / 2, height / 2, depth / 2],
        [-width / 2, height / 2, -depth / 2],
        [width / 2, height / 2, -depth / 2],
        [width / 2, -height / 2, -depth / 2],
        [-width / 2, -height / 2, -depth / 2],
        [width / 2, -height / 2, -depth / 2],
        [width / 2, -height / 2, depth / 2],
        [width / 2, height / 2, depth / 2],
        [width / 2, height / 2, -depth / 2],
        [-width / 2, height / 2, -depth / 2],
        [-width / 2, height / 2, depth / 2],
        [width / 2, height / 2, depth / 2],
        [width / 2, -height / 2, depth / 2],
        [-width / 2, -height / 2, depth / 2],
        [-width / 2, height / 2, depth / 2],
    ]
    lineGeo.setPositions(poses.flat()
        /*[
                    -5,
                    0.5, -5,

                    5,
                    0.5, -5,
                    5,
                    0.5,
                    5, -5,
                    0.5, 5, -5,
                    0.5, -5,

                    -5, -0.5, -5,
                    5, -0.5, -5,
                    5, -0.5,
                    5, -5, -0.5, 5, -5, -0.5, -5
                ]*/
    )
    const matLine = new THREE.LineMaterial({

        color: 0xffffff,
        linewidth: 0.003, // in pixels
        //resolution:  // to be set by renderer, eventually
        dashed: false

    });
    const wireframe = new THREE.Line2(lineGeo, matLine);
    const mat = new THREE.MeshPhongMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
    const box = new THREE.Mesh(geometry, mat);
    box.receiveShadow = true;
    box.add(wireframe);
    return box;
}
const createTorch = (shadow = true, light = false) => {
    const torch = new ExtendedObject3D();
    const fireGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const fireMat = new THREE.ShaderMaterial({

        uniforms: {
            time: { value: 0.0 },
        },
        vertexShader: `
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
                float normal_compression = 1.0;
                float simplex_add = 0.2 * simplex3d_fractal(vec3(position.x + time, position.y + time / 2.0 + 100.0, position.z + time * 2.0 + 100.0));
                if (normal.y > 0.0) {
                    simplex_add *= 3.0;
                    normal_compression = max(1.0 - normal.y, 0.0) + (0.1 * pow(simplex_add, 2.0) - 0.05);
                } else {
                    simplex_add *= 3.0 + normal.y * 3.0;
                    normal_compression = 0.9 + 0.1 * pow(simplex_add, 3.0);
                }
                gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(position.x * normal_compression, position.y + 0.5 * max(normal.y, 0.0) + simplex_add, position.z * normal_compression), 1.0);
                v_Position = position;
                v_Normal = normal;
            }
            `,
        fragmentShader: `
            varying vec3 v_Position;
            varying vec3 v_Normal;
            void main() {
                float fireLevel = (v_Normal.y + 1.0) / 2.0;
                gl_FragColor = vec4(1.0, 0.55 + 0.45 * fireLevel, 0.5 - fireLevel * 0.5, 1.0);
            }
            `
    });
    const fireTest = new THREE.Mesh(fireGeo, fireMat);
    fireTest.position.y = 1.75;
    const tbGeo = new THREE.CylinderGeometry(0.25, 0.15, 1);
    const thGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.5);
    const grayPhong = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const torchBase = new THREE.Mesh(tbGeo, grayPhong);
    const torchHolder = new THREE.Mesh(thGeo, grayPhong);
    torchBase.position.y = 0.5;
    torchHolder.position.y = 1.25;
    torchBase.castShadow = shadow;
    torchHolder.castShadow = shadow;
    fireTest.castShadow = shadow;
    if (light) {
        const light = mainScene.third.lights.pointLight({ color: 0xFFC832, intensity: 1, distance: 5 });
        light.castShadow = false;
        fireTest.add(light);
    }
    torch.add(torchBase);
    torch.add(torchHolder);
    //this.third.lights.helper.pointLightHelper(this.point);
    //this.point.position.set(fireTest.position);
    //this.point.castShadow = false;
    //this.point.position = fireTest.position;
    torch.add(fireTest);
    torch.fireMat = fireMat;
    return torch;
}
const createArrow = (arrowTexture) => {
    const arrowPlane = new THREE.PlaneGeometry(1, 1);
    const arrowMat = new THREE.MeshPhongMaterial({
        map: arrowTexture,
        alphaMap: arrowTexture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const arrowMesh = new THREE.Mesh(arrowPlane, arrowMat);
    arrowMesh.scale.set(3, 3, 3);
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.y = 0.51;
    arrowMesh.receiveShadow = true;
    //arrowMesh.rotation.z = Math.PI;
    return arrowMesh;
}
const makeText3d = (str) => {
    const texture = new FLAT.TextTexture(str, { fillStyle: "lightgrey" });
    const text3d = new FLAT.TextSprite(texture);
    text3d.renderOrder = 4;
    text3d.setScale(0.025);
    return text3d;
}

function wrapStr(str, options) {
    options = options || {};
    if (str == null) {
        return str;
    }

    var width = options.width || 50;
    var indent = (typeof options.indent === 'string') ?
        options.indent :
        '';

    var newline = options.newline || '\n' + indent;
    var escape = typeof options.escape === 'function' ?
        options.escape :
        identity;

    var regexString = '.{1,' + width + '}';
    if (options.cut !== true) {
        regexString += '([\\s\u200B]+|$)|[^\\s\u200B]+?([\\s\u200B]+|$)';
    }

    var re = new RegExp(regexString, 'g');
    var lines = str.match(re) || [];
    var result = indent + lines.map(function(line) {
        if (line.slice(-1) === '\n') {
            line = line.slice(0, line.length - 1);
        }
        return escape(line);
    }).join(newline);

    if (options.trim === true) {
        result = result.replace(/[ \t]*$/gm, '');
    }
    return result;
};

function identity(str) {
    return str;
}
const makeCrow = (crowMat) => {
    const crowPlane = new THREE.Sprite(crowMat);
    crowPlane.scale.x = 1.3;
    crowPlane.renderOrder = 1001 + Math.floor(Math.random() * 10000);
    return crowPlane;
}
const makeWebsiteWindow = async(parentDir, {
    title,
    image,
    link,
    description
}) => {
    const tex = await mainScene.third.load.texture(`./projectThumbnails/${parentDir}/${image}`)
    const texMat = new THREE.MeshPhongMaterial({ map: tex, side: THREE.DoubleSide, color: 0x999999 });
    const texPlane = new THREE.PlaneGeometry(4, 2);
    const edges = new THREE.EdgesGeometry(texPlane, 90);
    const lineGeo = new THREE.LineGeometry(edges);
    lineGeo.setPositions([
        [-2, -1, 0],
        [2, -1, 0],
        [2, 1, 0],
        [-2, 1, 0],
        [-2, -1, 0]
    ].flat());
    const matLine = new THREE.LineMaterial({

        color: 0xffffff,
        linewidth: 0.003, // in pixels
        //resolution:  // to be set by renderer, eventually
        dashed: false

    });
    const wireframe = new THREE.Line2(lineGeo, matLine);
    const texMesh = new THREE.Mesh(texPlane, texMat);
    const texture = new FLAT.TextTexture(title, { fillStyle: "rgb(200, 200, 200)" });
    const titleTex = new THREE.MeshBasicMaterial({ map: texture, alphaMap: texture, transparent: true, side: THREE.DoubleSide });
    const titlePlane = new THREE.PlaneGeometry(4, 1);
    const titleMesh = new THREE.Mesh(titlePlane, titleTex);
    const textureDesc = new FLAT.TextTexture(wrapStr(description, { width: 55 }), { fillStyle: "rgb(155, 155, 155)" });
    const descTex = new THREE.MeshBasicMaterial({ map: textureDesc, alphaMap: textureDesc, /* transparent: true,*/ side: THREE.DoubleSide });
    const descPlane = new THREE.PlaneGeometry(4, 0.9);
    const descMesh = new THREE.Mesh(descPlane, descTex);
    titleMesh.position.y = 3;
    titleMesh.renderOrder = 1000;
    descMesh.renderOrder = 1000;
    texMesh.position.y = 1.5;
    wireframe.position.y = 1.5;
    descMesh.position.y = -0.125;
    const window = new ExtendedObject3D();
    window.add(texMesh);
    window.add(titleMesh);
    window.add(descMesh);
    window.add(wireframe);
    window.link = link;
    mainScene.links.push(window);
    return window;

}
const createPath = async(title, {
    agentHeader,
    agentMessage,
    agentAnim
}) => {
    const dir = title.replace(" Stuff", "");
    const ps = projects[dir];
    const path = new ExtendedObject3D();
    path.ground = makeBox(5, 1, 2.5);
    path.parts = [];
    for (let i = 0; i < 10; i++) {
        const pathPart = makeBox(5, 1, 2.5);
        pathPart.position.x = 5 * i;
        pathPart.renderOrder = 2 + i;
        if (ps[i - 2] && i > 1) {
            const websiteWindow = await makeWebsiteWindow(dir, ps[i - 2]);
            websiteWindow.position.y = 2;
            if (i % 2 === 0) {
                websiteWindow.position.z = -3.5;
            } else {
                websiteWindow.rotation.y = Math.PI;
                websiteWindow.position.z = 3.5;
            }
            pathPart.add(websiteWindow);
        }
        path.parts.push(pathPart);
        path.add(pathPart);
    }
    path.addPath = () => {
        path.parts.forEach(part => {
            mainScene.walls.push(part);
        })
    }
    path.state = "dormant";
    path.agent = new Agent(agentAnim, agentHeader, agentMessage);
    path.agent.move(2, 0);
    path.agent.rotate(-Math.PI / 2);
    //path.agent.testModelReflection.position.z -= 0.075;
    path.text = makeText3d(title);
    path.text.position.set(2, 4, 0);
    path.arrow = createArrow(mainScene.arrowTexture);
    path.arrow.renderOrder = 100;
    path.arrow.rotation.z = -Math.PI / 2;
    path.arrow.visible = false;
    path.arrow.material.opacity = 0;
    path.arrow.name = title;
    if (localProxy.arrowsUnlocked.includes(path.arrow.name)) {
        path.arrow.visible = true;
        path.arrow.material.opacity = 1;
    }
    path.agent.arrow = path.arrow;
    path.add(path.ground);
    path.add(path.agent.testModel);
    path.add(path.agent.testModelReflection);
    path.add(path.text);
    path.add(path.arrow);
    mainScene.agents.push(path.agent);
    mainScene.walls.push(path.ground);
    path.title = title;
    return path;
}