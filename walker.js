class Walker {
    constructor(object, name, message, {
        xVel = 0,
        zVel = 0,
        x = 0,
        z = 0,
        angle = 0
    } = {}) {
        this.name = name;
        this.message = message;
        this.xVel = xVel;
        this.zVel = zVel;
        this.x = x;
        this.z = z;
        this.angle = angle;
        this.testModel = new ExtendedObject3D();
        this.testModel.add(THREE.SkeletonUtils.clone(object));
        mainScene.third.animationMixers.add(this.testModel.animation.mixer)
        this.testModel.position.y = 0.5;
        this.testModel.traverse(child => {
            if (child.isMesh) {
                child.material = new THREE.MeshPhongMaterial({ color: new THREE.Color(0.3, 0.3, 0.3), skinning: true });
                child.material.onBeforeCompile = (shader) => {
                        shader.uniforms.time = { value: 0 };
                        let startTime = Date.now();
                        setInterval(() => {
                            shader.uniforms.time.value = Date.now() - startTime;
                        })
                        shader.vertexShader = "varying vec3 fragPosition;\nvarying float distToCamera;\n" + shader.vertexShader;
                        shader.vertexShader = insertAt(shader.vertexShader, "#include <fog_vertex>", "\nfragPosition = vec3(transformed.x, transformed.y, transformed.z);\nvec4 cs_position = modelViewMatrix * vec4(position, 1.0);\ndistToCamera = -cs_position.z;");
                        shader.fragmentShader = "varying vec3 fragPosition;\nvarying float distToCamera;\nuniform float time;\n" + shader.fragmentShader;
                        shader.fragmentShader = shader.fragmentShader.replace("gl_FragColor = vec4( outgoingLight, diffuseColor.a );", `
                        float e = length(fwidth(outgoingLight.x));
                        e = 1.0/(1.0+exp(-(e-0.2)*32.0)); 
                        float camera_activation = min(3.0 * max(0.3 - (distToCamera * 0.05), 0.0), 1.0);
                        if (e > max(0.005 - 0.0045 * camera_activation + 0.00015 * sin(time / 100.0), 0.002)) {
                            gl_FragColor = vec4( vec3(1.0), diffuseColor.a );
                        } else {
                            gl_FragColor = vec4(outgoingLight, diffuseColor.a );
                        }
                    `)
                    }
                    //child.material.color = new THREE.Color(0.3, 0.3, 0.3);
                child.castShadow = true;
                //child.material.transparent = true;
                //child.material.opacity = 0.25;
            }
        })
        this.testModel.scale.set(0.01, 0.01, 0.01);
        this.testModelReflection = new ExtendedObject3D();
        this.testModelReflection.add(THREE.SkeletonUtils.clone(object));
        this.testModelReflection.position.y = -0.5;
        this.testModelReflection.scale.set(0.01, 0.01, 0.01);
        //this.testModelReflection.rotation.z = Math.PI;
        //this.testModelReflection.rotation.x = 0;
        this.testModelReflection.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1));
        //this.testModelReflection.applyMatrix(new THREE.Matrix4().makeScale(0, 1, 1));
        //this.testModelReflection.scale.z = -1;
        //this.testModelReflection.rotation.y = Math.PI;
        mainScene.third.animationMixers.add(this.testModelReflection.animation.mixer);
        const animsToLoad = ["walk"];
        for (const anim of animsToLoad) {
            const animText = mainScene.anims[anim];
            const animJson = animText;
            const clip = THREE.AnimationClip.parse(animJson);
            clip.animName = anim;
            this.testModel.animation.add(anim, clip);
            this.testModelReflection.animation.add(anim, clip);
        }
        this.testModel.animation.play('walk');
        this.testModelReflection.animation.play('walk');
        this.testModelReflection.traverse(child => {
            if (child.isMesh) {

                child.material = new THREE.MeshPhongMaterial({ skinning: true });
                child.material.onBeforeCompile = (shader) => {
                    shader.vertexShader = "varying vec3 fragPosition;\n" + shader.vertexShader;
                    shader.vertexShader = insertAt(shader.vertexShader, "#include <fog_vertex>", "\nfragPosition = vec3(transformed.x, transformed.y, transformed.z);");
                    shader.fragmentShader = "varying vec3 fragPosition;\n" + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace("gl_FragColor = vec4( outgoingLight, diffuseColor.a );", `
                        // gl_FragColor = vec4(max(vec3(0.3) - 5.0 * vec3((fragPosition.y - 0.75) * 0.0005 ), 0.0), 1.0);
                        vec3 reflect_vec = vec3(0.3 - pow(fragPosition.y, 0.33) * 0.06);
                        gl_FragColor = vec4(min(reflect_vec, outgoingLight * reflect_vec), diffuseColor.a);
                        `)
                }
            }
        })
    }
    update() {
        this.testModel.position.x = this.x;
        this.testModel.position.z = this.z;
        this.testModelReflection.position.x = this.x;
        this.testModelReflection.position.z = this.z;
        this.x += this.xVel * mainScene.timeScale;
        this.z += this.zVel * mainScene.timeScale;
        this.testModel.rotation.y = this.angle;
        this.testModelReflection.rotation.y = this.angle;
    }
    move(x, z) {
        this.testModel.position.x = x;
        this.testModel.position.z = z;
        this.testModelReflection.position.x = x;
        this.testModelReflection.position.z = z;
    }
    rotate(angle) {
        this.testModel.rotation.y = angle;
        this.testModelReflection.rotation.y = angle;
    }
}