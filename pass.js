(function() {

    class Pass {

        constructor() {

            // if set to true, the pass is processed by the composer
            this.enabled = true; // if set to true, the pass indicates to swap read and write buffer after rendering

            this.needsSwap = true; // if set to true, the pass clears its buffer before rendering

            this.clear = false; // if set to true, the result of the pass is rendered to screen. This is set automatically by EffectComposer.

            this.renderToScreen = false;

        }

        setSize() {}

        render() {

            console.error('THREE.Pass: .render() must be implemented in derived pass.');

        }

    } // Helper for passes that need to fill the viewport with a single quad.


    const _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // https://github.com/mrdoob/three.js/pull/21358


    const _geometry = new THREE.BufferGeometry();

    _geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));

    _geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));

    class FullScreenQuad {

        constructor(material) {

            this._mesh = new THREE.Mesh(_geometry, material);

        }

        dispose() {

            this._mesh.geometry.dispose();

        }

        render(renderer) {

            renderer.render(this._mesh, _camera);

        }

        get material() {

            return this._mesh.material;

        }

        set material(value) {

            this._mesh.material = value;

        }

    }

    THREE.FullScreenQuad = FullScreenQuad;
    THREE.Pass = Pass;

})();
(function() {

    class BloomPass extends THREE.Pass {

        constructor(strength = 1, kernelSize = 25, sigma = 4, resolution = 256) {

            super(); // render targets

            const pars = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            };
            this.renderTargetX = new THREE.WebGLRenderTarget(resolution, resolution, pars);
            this.renderTargetX.texture.name = 'BloomPass.x';
            this.renderTargetY = new THREE.WebGLRenderTarget(resolution, resolution, pars);
            this.renderTargetY.texture.name = 'BloomPass.y'; // copy material

            if (THREE.CopyShader === undefined) console.error('THREE.BloomPass relies on THREE.CopyShader');
            const copyShader = THREE.CopyShader;
            this.copyUniforms = THREE.UniformsUtils.clone(copyShader.uniforms);
            this.copyUniforms['opacity'].value = strength;
            this.materialCopy = new THREE.ShaderMaterial({
                uniforms: this.copyUniforms,
                vertexShader: copyShader.vertexShader,
                fragmentShader: copyShader.fragmentShader,
                blending: THREE.AdditiveBlending,
                transparent: true
            }); // convolution material

            if (THREE.ConvolutionShader === undefined) console.error('THREE.BloomPass relies on THREE.ConvolutionShader');
            const convolutionShader = THREE.ConvolutionShader;
            this.convolutionUniforms = THREE.UniformsUtils.clone(convolutionShader.uniforms);
            this.convolutionUniforms['uImageIncrement'].value = BloomPass.blurX;
            this.convolutionUniforms['cKernel'].value = THREE.ConvolutionShader.buildKernel(sigma);
            this.materialConvolution = new THREE.ShaderMaterial({
                uniforms: this.convolutionUniforms,
                vertexShader: convolutionShader.vertexShader,
                fragmentShader: convolutionShader.fragmentShader,
                defines: {
                    'KERNEL_SIZE_FLOAT': kernelSize.toFixed(1),
                    'KERNEL_SIZE_INT': kernelSize.toFixed(0)
                }
            });
            this.needsSwap = false;
            this.fsQuad = new THREE.FullScreenQuad(null);

        }

        render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {

            if (maskActive) renderer.state.buffers.stencil.setTest(false); // Render quad with blured scene into texture (convolution pass 1)

            this.fsQuad.material = this.materialConvolution;
            this.convolutionUniforms['tDiffuse'].value = readBuffer.texture;
            this.convolutionUniforms['uImageIncrement'].value = BloomPass.blurX;
            renderer.setRenderTarget(this.renderTargetX);
            renderer.clear();
            this.fsQuad.render(renderer); // Render quad with blured scene into texture (convolution pass 2)

            this.convolutionUniforms['tDiffuse'].value = this.renderTargetX.texture;
            this.convolutionUniforms['uImageIncrement'].value = BloomPass.blurY;
            renderer.setRenderTarget(this.renderTargetY);
            renderer.clear();
            this.fsQuad.render(renderer); // Render original scene with superimposed blur to texture

            this.fsQuad.material = this.materialCopy;
            this.copyUniforms['tDiffuse'].value = this.renderTargetY.texture;
            if (maskActive) renderer.state.buffers.stencil.setTest(true);
            renderer.setRenderTarget(readBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);

        }

    }

    BloomPass.blurX = new THREE.Vector2(0.001953125, 0.0);
    BloomPass.blurY = new THREE.Vector2(0.0, 0.001953125);

    THREE.BloomPass = BloomPass;

})();
(function() {

    /**
     * Full-screen textured quad shader
     */
    var CopyShader = {
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'opacity': {
                value: 1.0
            }
        },
        vertexShader:
        /* glsl */
            `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		uniform float opacity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;
		}`
    };

    THREE.CopyShader = CopyShader;

})();
(function() {

    /**
     * Convolution shader
     * ported from o3d sample to WebGL / GLSL
     * http://o3d.googlecode.com/svn/trunk/samples/convolution.html
     */

    const ConvolutionShader = {
        defines: {
            'KERNEL_SIZE_FLOAT': '25.0',
            'KERNEL_SIZE_INT': '25'
        },
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'uImageIncrement': {
                value: new THREE.Vector2(0.001953125, 0.0)
            },
            'cKernel': {
                value: []
            }
        },
        vertexShader:
        /* glsl */
            `
		uniform vec2 uImageIncrement;
		varying vec2 vUv;
		void main() {
			vUv = uv - ( ( KERNEL_SIZE_FLOAT - 1.0 ) / 2.0 ) * uImageIncrement;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		uniform float cKernel[ KERNEL_SIZE_INT ];
		uniform sampler2D tDiffuse;
		uniform vec2 uImageIncrement;
		varying vec2 vUv;
		void main() {
			vec2 imageCoord = vUv;
			vec4 sum = vec4( 0.0, 0.0, 0.0, 0.0 );
			for( int i = 0; i < KERNEL_SIZE_INT; i ++ ) {
				sum += texture2D( tDiffuse, imageCoord ) * cKernel[ i ];
				imageCoord += uImageIncrement;
			}
			gl_FragColor = sum;
		}`,
        buildKernel: function(sigma) {

            // We lop off the sqrt(2 * pi) * sigma term, since we're going to normalize anyway.
            const kMaxKernelSize = 25;
            let kernelSize = 2 * Math.ceil(sigma * 3.0) + 1;
            if (kernelSize > kMaxKernelSize) kernelSize = kMaxKernelSize;
            const halfWidth = (kernelSize - 1) * 0.5;
            const values = new Array(kernelSize);
            let sum = 0.0;

            for (let i = 0; i < kernelSize; ++i) {

                values[i] = gauss(i - halfWidth, sigma);
                sum += values[i];

            } // normalize the kernel


            for (let i = 0; i < kernelSize; ++i) values[i] /= sum;

            return values;

        }
    };

    function gauss(x, sigma) {

        return Math.exp(-(x * x) / (2.0 * sigma * sigma));

    }

    THREE.ConvolutionShader = ConvolutionShader;

})();
(function() {

    /**
     * UnrealBloomPass is inspired by the bloom pass of Unreal Engine. It creates a
     * mip map chain of bloom textures and blurs them with different radii. Because
     * of the weighted combination of mips, and because larger blurs are done on
     * higher mips, this effect provides good quality and performance.
     *
     * Reference:
     * - https://docs.unrealengine.com/latest/INT/Engine/Rendering/PostProcessEffects/Bloom/
     */

    class UnrealBloomPass extends THREE.Pass {

        constructor(resolution, strength, radius, threshold) {

            super();
            this.strength = strength !== undefined ? strength : 1;
            this.radius = radius;
            this.threshold = threshold;
            this.resolution = resolution !== undefined ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256); // create color only once here, reuse it later inside the render function

            this.clearColor = new THREE.Color(0, 0, 0); // render targets

            const pars = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            };
            this.renderTargetsHorizontal = [];
            this.renderTargetsVertical = [];
            this.nMips = 5;
            let resx = Math.round(this.resolution.x / 2);
            let resy = Math.round(this.resolution.y / 2);
            this.renderTargetBright = new THREE.WebGLRenderTarget(resx, resy, pars);
            this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
            this.renderTargetBright.texture.generateMipmaps = false;

            for (let i = 0; i < this.nMips; i++) {

                const renderTargetHorizonal = new THREE.WebGLRenderTarget(resx, resy, pars);
                renderTargetHorizonal.texture.name = 'UnrealBloomPass.h' + i;
                renderTargetHorizonal.texture.generateMipmaps = false;
                this.renderTargetsHorizontal.push(renderTargetHorizonal);
                const renderTargetVertical = new THREE.WebGLRenderTarget(resx, resy, pars);
                renderTargetVertical.texture.name = 'UnrealBloomPass.v' + i;
                renderTargetVertical.texture.generateMipmaps = false;
                this.renderTargetsVertical.push(renderTargetVertical);
                resx = Math.round(resx / 2);
                resy = Math.round(resy / 2);

            } // luminosity high pass material


            if (THREE.LuminosityHighPassShader === undefined) console.error('THREE.UnrealBloomPass relies on THREE.LuminosityHighPassShader');
            const highPassShader = THREE.LuminosityHighPassShader;
            this.highPassUniforms = THREE.UniformsUtils.clone(highPassShader.uniforms);
            this.highPassUniforms['luminosityThreshold'].value = threshold;
            this.highPassUniforms['smoothWidth'].value = 0.01;
            this.materialHighPassFilter = new THREE.ShaderMaterial({
                uniforms: this.highPassUniforms,
                vertexShader: highPassShader.vertexShader,
                fragmentShader: highPassShader.fragmentShader,
                defines: {}
            }); // Gaussian Blur Materials

            this.separableBlurMaterials = [];
            const kernelSizeArray = [3, 5, 7, 9, 11];
            resx = Math.round(this.resolution.x / 2);
            resy = Math.round(this.resolution.y / 2);

            for (let i = 0; i < this.nMips; i++) {

                this.separableBlurMaterials.push(this.getSeperableBlurMaterial(kernelSizeArray[i]));
                this.separableBlurMaterials[i].uniforms['texSize'].value = new THREE.Vector2(resx, resy);
                resx = Math.round(resx / 2);
                resy = Math.round(resy / 2);

            } // Composite material


            this.compositeMaterial = this.getCompositeMaterial(this.nMips);
            this.compositeMaterial.uniforms['blurTexture1'].value = this.renderTargetsVertical[0].texture;
            this.compositeMaterial.uniforms['blurTexture2'].value = this.renderTargetsVertical[1].texture;
            this.compositeMaterial.uniforms['blurTexture3'].value = this.renderTargetsVertical[2].texture;
            this.compositeMaterial.uniforms['blurTexture4'].value = this.renderTargetsVertical[3].texture;
            this.compositeMaterial.uniforms['blurTexture5'].value = this.renderTargetsVertical[4].texture;
            this.compositeMaterial.uniforms['bloomStrength'].value = strength;
            this.compositeMaterial.uniforms['bloomRadius'].value = 0.1;
            this.compositeMaterial.needsUpdate = true;
            const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
            this.compositeMaterial.uniforms['bloomFactors'].value = bloomFactors;
            this.bloomTintColors = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)];
            this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors; // copy material

            if (THREE.CopyShader === undefined) {

                console.error('THREE.UnrealBloomPass relies on THREE.CopyShader');

            }

            const copyShader = THREE.CopyShader;
            this.copyUniforms = THREE.UniformsUtils.clone(copyShader.uniforms);
            this.copyUniforms['opacity'].value = 1.0;
            this.materialCopy = new THREE.ShaderMaterial({
                uniforms: this.copyUniforms,
                vertexShader: copyShader.vertexShader,
                fragmentShader: copyShader.fragmentShader,
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false,
                transparent: true
            });
            this.enabled = true;
            this.needsSwap = false;
            this._oldClearColor = new THREE.Color();
            this.oldClearAlpha = 1;
            this.basic = new THREE.MeshBasicMaterial();
            this.fsQuad = new THREE.FullScreenQuad(null);

        }

        dispose() {

            for (let i = 0; i < this.renderTargetsHorizontal.length; i++) {

                this.renderTargetsHorizontal[i].dispose();

            }

            for (let i = 0; i < this.renderTargetsVertical.length; i++) {

                this.renderTargetsVertical[i].dispose();

            }

            this.renderTargetBright.dispose();

        }

        setSize(width, height) {

            let resx = Math.round(width / 2);
            let resy = Math.round(height / 2);
            this.renderTargetBright.setSize(resx, resy);

            for (let i = 0; i < this.nMips; i++) {

                this.renderTargetsHorizontal[i].setSize(resx, resy);
                this.renderTargetsVertical[i].setSize(resx, resy);
                this.separableBlurMaterials[i].uniforms['texSize'].value = new THREE.Vector2(resx, resy);
                resx = Math.round(resx / 2);
                resy = Math.round(resy / 2);

            }

        }

        render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {

            renderer.getClearColor(this._oldClearColor);
            this.oldClearAlpha = renderer.getClearAlpha();
            const oldAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            renderer.setClearColor(this.clearColor, 0);
            if (maskActive) renderer.state.buffers.stencil.setTest(false); // Render input to screen

            if (this.renderToScreen) {

                this.fsQuad.material = this.basic;
                this.basic.map = readBuffer.texture;
                renderer.setRenderTarget(null);
                renderer.clear();
                this.fsQuad.render(renderer);

            } // 1. Extract Bright Areas


            this.highPassUniforms['tDiffuse'].value = readBuffer.texture;
            this.highPassUniforms['luminosityThreshold'].value = this.threshold;
            this.fsQuad.material = this.materialHighPassFilter;
            renderer.setRenderTarget(this.renderTargetBright);
            renderer.clear();
            this.fsQuad.render(renderer); // 2. Blur All the mips progressively

            let inputRenderTarget = this.renderTargetBright;

            for (let i = 0; i < this.nMips; i++) {

                this.fsQuad.material = this.separableBlurMaterials[i];
                this.separableBlurMaterials[i].uniforms['colorTexture'].value = inputRenderTarget.texture;
                this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionX;
                renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
                renderer.clear();
                this.fsQuad.render(renderer);
                this.separableBlurMaterials[i].uniforms['colorTexture'].value = this.renderTargetsHorizontal[i].texture;
                this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionY;
                renderer.setRenderTarget(this.renderTargetsVertical[i]);
                renderer.clear();
                this.fsQuad.render(renderer);
                inputRenderTarget = this.renderTargetsVertical[i];

            } // Composite All the mips


            this.fsQuad.material = this.compositeMaterial;
            this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
            this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
            this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;
            renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
            renderer.clear();
            this.fsQuad.render(renderer); // Blend it additively over the input texture

            this.fsQuad.material = this.materialCopy;
            this.copyUniforms['tDiffuse'].value = this.renderTargetsHorizontal[0].texture;
            if (maskActive) renderer.state.buffers.stencil.setTest(true);

            if (this.renderToScreen) {

                renderer.setRenderTarget(null);
                this.fsQuad.render(renderer);

            } else {

                renderer.setRenderTarget(readBuffer);
                this.fsQuad.render(renderer);

            } // Restore renderer settings


            renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
            renderer.autoClear = oldAutoClear;

        }

        getSeperableBlurMaterial(kernelRadius) {

            return new THREE.ShaderMaterial({
                defines: {
                    'KERNEL_RADIUS': kernelRadius,
                    'SIGMA': kernelRadius
                },
                uniforms: {
                    'colorTexture': {
                        value: null
                    },
                    'texSize': {
                        value: new THREE.Vector2(0.5, 0.5)
                    },
                    'direction': {
                        value: new THREE.Vector2(0.5, 0.5)
                    }
                },
                vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
                fragmentShader: `#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;
				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}
				void main() {
					vec2 invSize = 1.0 / texSize;
					float fSigma = float(SIGMA);
					float weightSum = gaussianPdf(0.0, fSigma);
					vec3 diffuseSum = texture2D( colorTexture, vUv).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianPdf(x, fSigma);
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`
            });

        }

        getCompositeMaterial(nMips) {

            return new THREE.ShaderMaterial({
                defines: {
                    'NUM_MIPS': nMips
                },
                uniforms: {
                    'blurTexture1': {
                        value: null
                    },
                    'blurTexture2': {
                        value: null
                    },
                    'blurTexture3': {
                        value: null
                    },
                    'blurTexture4': {
                        value: null
                    },
                    'blurTexture5': {
                        value: null
                    },
                    'dirtTexture': {
                        value: null
                    },
                    'bloomStrength': {
                        value: 1.0
                    },
                    'bloomFactors': {
                        value: null
                    },
                    'bloomTintColors': {
                        value: null
                    },
                    'bloomRadius': {
                        value: 0.0
                    }
                },
                vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
                fragmentShader: `varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform sampler2D dirtTexture;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];
				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}
				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`
            });

        }

    }

    UnrealBloomPass.BlurDirectionX = new THREE.Vector2(1.0, 0.0);
    UnrealBloomPass.BlurDirectionY = new THREE.Vector2(0.0, 1.0);

    THREE.UnrealBloomPass = UnrealBloomPass;

})();
(function() {

    /**
     * Luminosity
     * http://en.wikipedia.org/wiki/Luminosity
     */

    const LuminosityHighPassShader = {
        shaderID: 'luminosityHighPass',
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'luminosityThreshold': {
                value: 1.0
            },
            'smoothWidth': {
                value: 1.0
            },
            'defaultColor': {
                value: new THREE.Color(0x000000)
            },
            'defaultOpacity': {
                value: 0.0
            }
        },
        vertexShader:
        /* glsl */
            `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;
		varying vec2 vUv;
		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			vec3 luma = vec3( 0.299, 0.587, 0.114 );
			float v = dot( texel.xyz, luma );
			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );
			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );
			gl_FragColor = mix( outputColor, texel, alpha );
		}`
    };

    THREE.LuminosityHighPassShader = LuminosityHighPassShader;

})();
(function() {

    class OutlinePass extends THREE.Pass {

        constructor(resolution, scene, camera, selectedObjects) {

            super();
            this.renderScene = scene;
            this.renderCamera = camera;
            this.selectedObjects = selectedObjects !== undefined ? selectedObjects : [];
            this.visibleEdgeColor = new THREE.Color(1, 1, 1);
            this.hiddenEdgeColor = new THREE.Color(0.1, 0.04, 0.02);
            this.edgeGlow = 0.0;
            this.usePatternTexture = false;
            this.edgeThickness = 1.0;
            this.edgeStrength = 3.0;
            this.downSampleRatio = 2;
            this.pulsePeriod = 0;
            this._visibilityCache = new Map();
            this.resolution = resolution !== undefined ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256);
            const pars = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            };
            const resx = Math.round(this.resolution.x / this.downSampleRatio);
            const resy = Math.round(this.resolution.y / this.downSampleRatio);
            this.maskBufferMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff
            });
            this.maskBufferMaterial.side = THREE.DoubleSide;
            this.renderTargetMaskBuffer = new THREE.WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
            this.renderTargetMaskBuffer.texture.name = 'OutlinePass.mask';
            this.renderTargetMaskBuffer.texture.generateMipmaps = false;
            this.depthMaterial = new THREE.MeshDepthMaterial();
            this.depthMaterial.side = THREE.DoubleSide;
            this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
            this.depthMaterial.blending = THREE.NoBlending;
            this.depthMaterial.skinning = true;
            this.prepareMaskMaterial = this.getPrepareMaskMaterial();
            this.prepareMaskMaterial.side = THREE.DoubleSide;
            this.prepareMaskMaterial.fragmentShader = replaceDepthToViewZ(this.prepareMaskMaterial.fragmentShader, this.renderCamera);
            this.prepareMaskMaterial.skinning = true;
            this.renderTargetDepthBuffer = new THREE.WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
            this.renderTargetDepthBuffer.texture.name = 'OutlinePass.depth';
            this.renderTargetDepthBuffer.texture.generateMipmaps = false;
            this.renderTargetMaskDownSampleBuffer = new THREE.WebGLRenderTarget(resx, resy, pars);
            this.renderTargetMaskDownSampleBuffer.texture.name = 'OutlinePass.depthDownSample';
            this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;
            this.renderTargetBlurBuffer1 = new THREE.WebGLRenderTarget(resx, resy, pars);
            this.renderTargetBlurBuffer1.texture.name = 'OutlinePass.blur1';
            this.renderTargetBlurBuffer1.texture.generateMipmaps = false;
            this.renderTargetBlurBuffer2 = new THREE.WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
            this.renderTargetBlurBuffer2.texture.name = 'OutlinePass.blur2';
            this.renderTargetBlurBuffer2.texture.generateMipmaps = false;
            this.edgeDetectionMaterial = this.getEdgeDetectionMaterial();
            this.renderTargetEdgeBuffer1 = new THREE.WebGLRenderTarget(resx, resy, pars);
            this.renderTargetEdgeBuffer1.texture.name = 'OutlinePass.edge1';
            this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;
            this.renderTargetEdgeBuffer2 = new THREE.WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
            this.renderTargetEdgeBuffer2.texture.name = 'OutlinePass.edge2';
            this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;
            const MAX_EDGE_THICKNESS = 4;
            const MAX_EDGE_GLOW = 4;
            this.separableBlurMaterial1 = this.getSeperableBlurMaterial(MAX_EDGE_THICKNESS);
            this.separableBlurMaterial1.uniforms['texSize'].value.set(resx, resy);
            this.separableBlurMaterial1.uniforms['kernelRadius'].value = 1;
            this.separableBlurMaterial2 = this.getSeperableBlurMaterial(MAX_EDGE_GLOW);
            this.separableBlurMaterial2.uniforms['texSize'].value.set(Math.round(resx / 2), Math.round(resy / 2));
            this.separableBlurMaterial2.uniforms['kernelRadius'].value = MAX_EDGE_GLOW; // Overlay material

            this.overlayMaterial = this.getOverlayMaterial(); // copy material

            if (THREE.CopyShader === undefined) console.error('THREE.OutlinePass relies on THREE.CopyShader');
            const copyShader = THREE.CopyShader;
            this.copyUniforms = THREE.UniformsUtils.clone(copyShader.uniforms);
            this.copyUniforms['opacity'].value = 1.0;
            this.materialCopy = new THREE.ShaderMaterial({
                uniforms: this.copyUniforms,
                vertexShader: copyShader.vertexShader,
                fragmentShader: copyShader.fragmentShader,
                blending: THREE.NoBlending,
                depthTest: false,
                depthWrite: false,
                transparent: true
            });
            this.enabled = true;
            this.needsSwap = false;
            this._oldClearColor = new THREE.Color();
            this.oldClearAlpha = 1;
            this.fsQuad = new THREE.FullScreenQuad(null);
            this.tempPulseColor1 = new THREE.Color();
            this.tempPulseColor2 = new THREE.Color();
            this.textureMatrix = new THREE.Matrix4();

            function replaceDepthToViewZ(string, camera) {

                var type = camera.isPerspectiveCamera ? 'perspective' : 'orthographic';
                return string.replace(/DEPTH_TO_VIEW_Z/g, type + 'DepthToViewZ');

            }

        }

        dispose() {

            this.renderTargetMaskBuffer.dispose();
            this.renderTargetDepthBuffer.dispose();
            this.renderTargetMaskDownSampleBuffer.dispose();
            this.renderTargetBlurBuffer1.dispose();
            this.renderTargetBlurBuffer2.dispose();
            this.renderTargetEdgeBuffer1.dispose();
            this.renderTargetEdgeBuffer2.dispose();

        }

        setSize(width, height) {

            this.renderTargetMaskBuffer.setSize(width, height);
            this.renderTargetDepthBuffer.setSize(width, height);
            let resx = Math.round(width / this.downSampleRatio);
            let resy = Math.round(height / this.downSampleRatio);
            this.renderTargetMaskDownSampleBuffer.setSize(resx, resy);
            this.renderTargetBlurBuffer1.setSize(resx, resy);
            this.renderTargetEdgeBuffer1.setSize(resx, resy);
            this.separableBlurMaterial1.uniforms['texSize'].value.set(resx, resy);
            resx = Math.round(resx / 2);
            resy = Math.round(resy / 2);
            this.renderTargetBlurBuffer2.setSize(resx, resy);
            this.renderTargetEdgeBuffer2.setSize(resx, resy);
            this.separableBlurMaterial2.uniforms['texSize'].value.set(resx, resy);

        }

        changeVisibilityOfSelectedObjects(bVisible) {

            const cache = this._visibilityCache;

            function gatherSelectedMeshesCallBack(object) {

                if (object.isMesh) {

                    if (bVisible === true) {

                        object.visible = cache.get(object);

                    } else {

                        cache.set(object, object.visible);
                        object.visible = bVisible;

                    }

                }

            }

            for (let i = 0; i < this.selectedObjects.length; i++) {

                const selectedObject = this.selectedObjects[i];
                selectedObject.traverse(gatherSelectedMeshesCallBack);

            }

        }

        changeVisibilityOfNonSelectedObjects(bVisible) {

            const cache = this._visibilityCache;
            const selectedMeshes = [];

            function gatherSelectedMeshesCallBack(object) {

                if (object.isMesh) selectedMeshes.push(object);

            }

            for (let i = 0; i < this.selectedObjects.length; i++) {

                const selectedObject = this.selectedObjects[i];
                selectedObject.traverse(gatherSelectedMeshesCallBack);

            }

            function VisibilityChangeCallBack(object) {

                if (object.isMesh || object.isSprite) {

                    // only meshes and sprites are supported by OutlinePass
                    let bFound = false;

                    for (let i = 0; i < selectedMeshes.length; i++) {

                        const selectedObjectId = selectedMeshes[i].id;

                        if (selectedObjectId === object.id) {

                            bFound = true;
                            break;

                        }

                    }

                    if (bFound === false) {

                        const visibility = object.visible;

                        if (bVisible === false || cache.get(object) === true) {

                            object.visible = bVisible;

                        }

                        cache.set(object, visibility);

                    }

                } else if (object.isPoints || object.isLine) {

                    // the visibilty of points and lines is always set to false in order to
                    // not affect the outline computation
                    if (bVisible === true) {

                        object.visible = cache.get(object); // restore

                    } else {

                        cache.set(object, object.visible);
                        object.visible = bVisible;

                    }

                }

            }

            this.renderScene.traverse(VisibilityChangeCallBack);

        }

        updateTextureMatrix() {

            this.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
            this.textureMatrix.multiply(this.renderCamera.projectionMatrix);
            this.textureMatrix.multiply(this.renderCamera.matrixWorldInverse);

        }

        render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {

            if (this.selectedObjects.length > 0) {

                renderer.getClearColor(this._oldClearColor);
                this.oldClearAlpha = renderer.getClearAlpha();
                const oldAutoClear = renderer.autoClear;
                renderer.autoClear = false;
                if (maskActive) renderer.state.buffers.stencil.setTest(false);
                renderer.setClearColor(0xffffff, 1); // Make selected objects invisible

                this.changeVisibilityOfSelectedObjects(false);
                const currentBackground = this.renderScene.background;
                this.renderScene.background = null; // 1. Draw Non Selected objects in the depth buffer

                this.renderScene.overrideMaterial = this.depthMaterial;
                renderer.setRenderTarget(this.renderTargetDepthBuffer);
                renderer.clear();
                renderer.render(this.renderScene, this.renderCamera); // Make selected objects visible

                this.changeVisibilityOfSelectedObjects(true);

                this._visibilityCache.clear(); // Update Texture Matrix for Depth compare


                this.updateTextureMatrix(); // Make non selected objects invisible, and draw only the selected objects, by comparing the depth buffer of non selected objects

                this.changeVisibilityOfNonSelectedObjects(false);
                this.renderScene.overrideMaterial = this.prepareMaskMaterial;
                this.prepareMaskMaterial.uniforms['cameraNearFar'].value.set(this.renderCamera.near, this.renderCamera.far);
                this.prepareMaskMaterial.uniforms['depthTexture'].value = this.renderTargetDepthBuffer.texture;
                this.prepareMaskMaterial.uniforms['textureMatrix'].value = this.textureMatrix;
                renderer.setRenderTarget(this.renderTargetMaskBuffer);
                renderer.clear();
                renderer.render(this.renderScene, this.renderCamera);
                this.renderScene.overrideMaterial = null;
                this.changeVisibilityOfNonSelectedObjects(true);

                this._visibilityCache.clear();

                this.renderScene.background = currentBackground; // 2. Downsample to Half resolution

                this.fsQuad.material = this.materialCopy;
                this.copyUniforms['tDiffuse'].value = this.renderTargetMaskBuffer.texture;
                renderer.setRenderTarget(this.renderTargetMaskDownSampleBuffer);
                renderer.clear();
                this.fsQuad.render(renderer);
                this.tempPulseColor1.copy(this.visibleEdgeColor);
                this.tempPulseColor2.copy(this.hiddenEdgeColor);

                if (this.pulsePeriod > 0) {

                    const scalar = (1 + 0.25) / 2 + Math.cos(performance.now() * 0.01 / this.pulsePeriod) * (1.0 - 0.25) / 2;
                    this.tempPulseColor1.multiplyScalar(scalar);
                    this.tempPulseColor2.multiplyScalar(scalar);

                } // 3. Apply Edge Detection THREE.Pass


                this.fsQuad.material = this.edgeDetectionMaterial;
                this.edgeDetectionMaterial.uniforms['maskTexture'].value = this.renderTargetMaskDownSampleBuffer.texture;
                this.edgeDetectionMaterial.uniforms['texSize'].value.set(this.renderTargetMaskDownSampleBuffer.width, this.renderTargetMaskDownSampleBuffer.height);
                this.edgeDetectionMaterial.uniforms['visibleEdgeColor'].value = this.tempPulseColor1;
                this.edgeDetectionMaterial.uniforms['hiddenEdgeColor'].value = this.tempPulseColor2;
                renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
                renderer.clear();
                this.fsQuad.render(renderer); // 4. Apply Blur on Half res

                this.fsQuad.material = this.separableBlurMaterial1;
                this.separableBlurMaterial1.uniforms['colorTexture'].value = this.renderTargetEdgeBuffer1.texture;
                this.separableBlurMaterial1.uniforms['direction'].value = OutlinePass.BlurDirectionX;
                this.separableBlurMaterial1.uniforms['kernelRadius'].value = this.edgeThickness;
                renderer.setRenderTarget(this.renderTargetBlurBuffer1);
                renderer.clear();
                this.fsQuad.render(renderer);
                this.separableBlurMaterial1.uniforms['colorTexture'].value = this.renderTargetBlurBuffer1.texture;
                this.separableBlurMaterial1.uniforms['direction'].value = OutlinePass.BlurDirectionY;
                renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
                renderer.clear();
                this.fsQuad.render(renderer); // Apply Blur on quarter res

                this.fsQuad.material = this.separableBlurMaterial2;
                this.separableBlurMaterial2.uniforms['colorTexture'].value = this.renderTargetEdgeBuffer1.texture;
                this.separableBlurMaterial2.uniforms['direction'].value = OutlinePass.BlurDirectionX;
                renderer.setRenderTarget(this.renderTargetBlurBuffer2);
                renderer.clear();
                this.fsQuad.render(renderer);
                this.separableBlurMaterial2.uniforms['colorTexture'].value = this.renderTargetBlurBuffer2.texture;
                this.separableBlurMaterial2.uniforms['direction'].value = OutlinePass.BlurDirectionY;
                renderer.setRenderTarget(this.renderTargetEdgeBuffer2);
                renderer.clear();
                this.fsQuad.render(renderer); // Blend it additively over the input texture

                this.fsQuad.material = this.overlayMaterial;
                this.overlayMaterial.uniforms['maskTexture'].value = this.renderTargetMaskBuffer.texture;
                this.overlayMaterial.uniforms['edgeTexture1'].value = this.renderTargetEdgeBuffer1.texture;
                this.overlayMaterial.uniforms['edgeTexture2'].value = this.renderTargetEdgeBuffer2.texture;
                this.overlayMaterial.uniforms['patternTexture'].value = this.patternTexture;
                this.overlayMaterial.uniforms['edgeStrength'].value = this.edgeStrength;
                this.overlayMaterial.uniforms['edgeGlow'].value = this.edgeGlow;
                this.overlayMaterial.uniforms['usePatternTexture'].value = this.usePatternTexture;
                if (maskActive) renderer.state.buffers.stencil.setTest(true);
                renderer.setRenderTarget(readBuffer);
                this.fsQuad.render(renderer);
                renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
                renderer.autoClear = oldAutoClear;

            }

            if (this.renderToScreen) {

                this.fsQuad.material = this.materialCopy;
                this.copyUniforms['tDiffuse'].value = readBuffer.texture;
                renderer.setRenderTarget(null);
                this.fsQuad.render(renderer);

            }

        }

        getPrepareMaskMaterial() {

            return new THREE.ShaderMaterial({
                uniforms: {
                    'depthTexture': {
                        value: null
                    },
                    'cameraNearFar': {
                        value: new THREE.Vector2(0.5, 0.5)
                    },
                    'textureMatrix': {
                        value: null
                    }
                },
                vertexShader: `#include <morphtarget_pars_vertex>
				#include <skinning_pars_vertex>
				varying vec4 projTexCoord;
				varying vec4 vPosition;
				uniform mat4 textureMatrix;
				void main() {
					#include <skinbase_vertex>
					#include <begin_vertex>
					#include <morphtarget_vertex>
					#include <skinning_vertex>
					#include <project_vertex>
					vPosition = mvPosition;
					vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
					projTexCoord = textureMatrix * worldPosition;
				}`,
                fragmentShader: `#include <packing>
				varying vec4 vPosition;
				varying vec4 projTexCoord;
				uniform sampler2D depthTexture;
				uniform vec2 cameraNearFar;
				void main() {
					float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));
					float viewZ = - DEPTH_TO_VIEW_Z( depth, cameraNearFar.x, cameraNearFar.y );
					float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;
					gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);
				}`
            });

        }

        getEdgeDetectionMaterial() {

            return new THREE.ShaderMaterial({
                uniforms: {
                    'maskTexture': {
                        value: null
                    },
                    'texSize': {
                        value: new THREE.Vector2(0.5, 0.5)
                    },
                    'visibleEdgeColor': {
                        value: new THREE.Vector3(1.0, 1.0, 1.0)
                    },
                    'hiddenEdgeColor': {
                        value: new THREE.Vector3(1.0, 1.0, 1.0)
                    }
                },
                vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
                fragmentShader: `varying vec2 vUv;
				uniform sampler2D maskTexture;
				uniform vec2 texSize;
				uniform vec3 visibleEdgeColor;
				uniform vec3 hiddenEdgeColor;
				void main() {
					vec2 invSize = 1.0 / texSize;
					vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
					vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
					vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
					vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
					vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
					float diff1 = (c1.r - c2.r)*0.5;
					float diff2 = (c3.r - c4.r)*0.5;
					float d = length( vec2(diff1, diff2) );
					float a1 = min(c1.g, c2.g);
					float a2 = min(c3.g, c4.g);
					float visibilityFactor = min(a1, a2);
					vec3 edgeColor = 1.0 - visibilityFactor > 0.001 ? visibleEdgeColor : hiddenEdgeColor;
					gl_FragColor = vec4(edgeColor, 1.0) * vec4(d);
				}`
            });

        }

        getSeperableBlurMaterial(maxRadius) {

            return new THREE.ShaderMaterial({
                defines: {
                    'MAX_RADIUS': maxRadius
                },
                uniforms: {
                    'colorTexture': {
                        value: null
                    },
                    'texSize': {
                        value: new THREE.Vector2(0.5, 0.5)
                    },
                    'direction': {
                        value: new THREE.Vector2(0.5, 0.5)
                    },
                    'kernelRadius': {
                        value: 1.0
                    }
                },
                vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
                fragmentShader: `#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;
				uniform float kernelRadius;
				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}
				void main() {
					vec2 invSize = 1.0 / texSize;
					float weightSum = gaussianPdf(0.0, kernelRadius);
					vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
					vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
					vec2 uvOffset = delta;
					for( int i = 1; i <= MAX_RADIUS; i ++ ) {
						float w = gaussianPdf(uvOffset.x, kernelRadius);
						vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
						vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
						diffuseSum += ((sample1 + sample2) * w);
						weightSum += (2.0 * w);
						uvOffset += delta;
					}
					gl_FragColor = diffuseSum/weightSum;
				}`
            });

        }

        getOverlayMaterial() {

            return new THREE.ShaderMaterial({
                uniforms: {
                    'maskTexture': {
                        value: null
                    },
                    'edgeTexture1': {
                        value: null
                    },
                    'edgeTexture2': {
                        value: null
                    },
                    'patternTexture': {
                        value: null
                    },
                    'edgeStrength': {
                        value: 1.0
                    },
                    'edgeGlow': {
                        value: 1.0
                    },
                    'usePatternTexture': {
                        value: 0.0
                    }
                },
                vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
                fragmentShader: `varying vec2 vUv;
				uniform sampler2D maskTexture;
				uniform sampler2D edgeTexture1;
				uniform sampler2D edgeTexture2;
				uniform sampler2D patternTexture;
				uniform float edgeStrength;
				uniform float edgeGlow;
				uniform bool usePatternTexture;
				void main() {
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
					vec4 maskColor = texture2D(maskTexture, vUv);
					vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
					float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
					vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
					vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
					if(usePatternTexture)
						finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
					gl_FragColor = finalColor;
				}`,
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false,
                transparent: true
            });

        }

    }

    OutlinePass.BlurDirectionX = new THREE.Vector2(1.0, 0.0);
    OutlinePass.BlurDirectionY = new THREE.Vector2(0.0, 1.0);

    THREE.OutlinePass = OutlinePass;

})();
(function() {

    /**
     * TODO
     */

    const SAOShader = {
        defines: {
            'NUM_SAMPLES': 7,
            'NUM_RINGS': 4,
            'NORMAL_TEXTURE': 0,
            'DIFFUSE_TEXTURE': 0,
            'DEPTH_PACKING': 1,
            'PERSPECTIVE_CAMERA': 1
        },
        uniforms: {
            'tDepth': {
                value: null
            },
            'tDiffuse': {
                value: null
            },
            'tNormal': {
                value: null
            },
            'size': {
                value: new THREE.Vector2(512, 512)
            },
            'cameraNear': {
                value: 1
            },
            'cameraFar': {
                value: 100
            },
            'cameraProjectionMatrix': {
                value: new THREE.Matrix4()
            },
            'cameraInverseProjectionMatrix': {
                value: new THREE.Matrix4()
            },
            'scale': {
                value: 1.0
            },
            'intensity': {
                value: 0.1
            },
            'bias': {
                value: 0.5
            },
            'minResolution': {
                value: 0.0
            },
            'kernelRadius': {
                value: 100.0
            },
            'randomSeed': {
                value: 0.0
            }
        },
        vertexShader:
        /* glsl */
            `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		#include <common>
		varying vec2 vUv;
		#if DIFFUSE_TEXTURE == 1
		uniform sampler2D tDiffuse;
		#endif
		uniform sampler2D tDepth;
		#if NORMAL_TEXTURE == 1
		uniform sampler2D tNormal;
		#endif
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;
		uniform float scale;
		uniform float intensity;
		uniform float bias;
		uniform float kernelRadius;
		uniform float minResolution;
		uniform vec2 size;
		uniform float randomSeed;
		// RGBA depth
		#include <packing>
		vec4 getDefaultColor( const in vec2 screenPosition ) {
			#if DIFFUSE_TEXTURE == 1
			return texture2D( tDiffuse, vUv );
			#else
			return vec4( 1.0 );
			#endif
		}
		float getDepth( const in vec2 screenPosition ) {
			#if DEPTH_PACKING == 1
			return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
			#else
			return texture2D( tDepth, screenPosition ).x;
			#endif
		}
		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
			return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
			#else
			return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
			#endif
		}
		vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {
			float clipW = cameraProjectionMatrix[2][3] * viewZ + cameraProjectionMatrix[3][3];
			vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );
			clipPosition *= clipW; // unprojection.
			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;
		}
		vec3 getViewNormal( const in vec3 viewPosition, const in vec2 screenPosition ) {
			#if NORMAL_TEXTURE == 1
			return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );
			#else
			return normalize( cross( dFdx( viewPosition ), dFdy( viewPosition ) ) );
			#endif
		}
		float scaleDividedByCameraFar;
		float minResolutionMultipliedByCameraFar;
		float getOcclusion( const in vec3 centerViewPosition, const in vec3 centerViewNormal, const in vec3 sampleViewPosition ) {
			vec3 viewDelta = sampleViewPosition - centerViewPosition;
			float viewDistance = length( viewDelta );
			float scaledScreenDistance = scaleDividedByCameraFar * viewDistance;
			return max(0.0, (dot(centerViewNormal, viewDelta) - minResolutionMultipliedByCameraFar) / scaledScreenDistance - bias) / (1.0 + pow2( scaledScreenDistance ) );
		}
		// moving costly divides into consts
		const float ANGLE_STEP = PI2 * float( NUM_RINGS ) / float( NUM_SAMPLES );
		const float INV_NUM_SAMPLES = 1.0 / float( NUM_SAMPLES );
		float getAmbientOcclusion( const in vec3 centerViewPosition ) {
			// precompute some variables require in getOcclusion.
			scaleDividedByCameraFar = scale / cameraFar;
			minResolutionMultipliedByCameraFar = minResolution * cameraFar;
			vec3 centerViewNormal = getViewNormal( centerViewPosition, vUv );
			// jsfiddle that shows sample pattern: https://jsfiddle.net/a16ff1p7/
			float angle = rand( vUv + randomSeed ) * PI2;
			vec2 radius = vec2( kernelRadius * INV_NUM_SAMPLES ) / size;
			vec2 radiusStep = radius;
			float occlusionSum = 0.0;
			float weightSum = 0.0;
			for( int i = 0; i < NUM_SAMPLES; i ++ ) {
				vec2 sampleUv = vUv + vec2( cos( angle ), sin( angle ) ) * radius;
				radius += radiusStep;
				angle += ANGLE_STEP;
				float sampleDepth = getDepth( sampleUv );
				if( sampleDepth >= ( 1.0 - EPSILON ) ) {
					continue;
				}
				float sampleViewZ = getViewZ( sampleDepth );
				vec3 sampleViewPosition = getViewPosition( sampleUv, sampleDepth, sampleViewZ );
				occlusionSum += getOcclusion( centerViewPosition, centerViewNormal, sampleViewPosition );
				weightSum += 1.0;
			}
			if( weightSum == 0.0 ) discard;
			return occlusionSum * ( intensity / weightSum );
		}
		void main() {
			float centerDepth = getDepth( vUv );
			if( centerDepth >= ( 1.0 - EPSILON ) ) {
				discard;
			}
			float centerViewZ = getViewZ( centerDepth );
			vec3 viewPosition = getViewPosition( vUv, centerDepth, centerViewZ );
			float ambientOcclusion = getAmbientOcclusion( viewPosition );
			gl_FragColor = getDefaultColor( vUv );
			gl_FragColor.xyz *=  1.0 - ambientOcclusion;
		}`
    };

    THREE.SAOShader = SAOShader;

})();
(function() {

    /**
     * TODO
     */

    const DepthLimitedBlurShader = {
        defines: {
            'KERNEL_RADIUS': 4,
            'DEPTH_PACKING': 1,
            'PERSPECTIVE_CAMERA': 1
        },
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'size': {
                value: new THREE.Vector2(512, 512)
            },
            'sampleUvOffsets': {
                value: [new THREE.Vector2(0, 0)]
            },
            'sampleWeights': {
                value: [1.0]
            },
            'tDepth': {
                value: null
            },
            'cameraNear': {
                value: 10
            },
            'cameraFar': {
                value: 1000
            },
            'depthCutoff': {
                value: 10
            }
        },
        vertexShader:
        /* glsl */
            `
		#include <common>
		uniform vec2 size;
		varying vec2 vUv;
		varying vec2 vInvSize;
		void main() {
			vUv = uv;
			vInvSize = 1.0 / size;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		#include <common>
		#include <packing>
		uniform sampler2D tDiffuse;
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform float depthCutoff;
		uniform vec2 sampleUvOffsets[ KERNEL_RADIUS + 1 ];
		uniform float sampleWeights[ KERNEL_RADIUS + 1 ];
		varying vec2 vUv;
		varying vec2 vInvSize;
		float getDepth( const in vec2 screenPosition ) {
			#if DEPTH_PACKING == 1
			return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
			#else
			return texture2D( tDepth, screenPosition ).x;
			#endif
		}
		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
			return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
			#else
			return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
			#endif
		}
		void main() {
			float depth = getDepth( vUv );
			if( depth >= ( 1.0 - EPSILON ) ) {
				discard;
			}
			float centerViewZ = -getViewZ( depth );
			bool rBreak = false, lBreak = false;
			float weightSum = sampleWeights[0];
			vec4 diffuseSum = texture2D( tDiffuse, vUv ) * weightSum;
			for( int i = 1; i <= KERNEL_RADIUS; i ++ ) {
				float sampleWeight = sampleWeights[i];
				vec2 sampleUvOffset = sampleUvOffsets[i] * vInvSize;
				vec2 sampleUv = vUv + sampleUvOffset;
				float viewZ = -getViewZ( getDepth( sampleUv ) );
				if( abs( viewZ - centerViewZ ) > depthCutoff ) rBreak = true;
				if( ! rBreak ) {
					diffuseSum += texture2D( tDiffuse, sampleUv ) * sampleWeight;
					weightSum += sampleWeight;
				}
				sampleUv = vUv - sampleUvOffset;
				viewZ = -getViewZ( getDepth( sampleUv ) );
				if( abs( viewZ - centerViewZ ) > depthCutoff ) lBreak = true;
				if( ! lBreak ) {
					diffuseSum += texture2D( tDiffuse, sampleUv ) * sampleWeight;
					weightSum += sampleWeight;
				}
			}
			gl_FragColor = diffuseSum / weightSum;
		}`
    };
    const BlurShaderUtils = {
        createSampleWeights: function(kernelRadius, stdDev) {

            const weights = [];

            for (let i = 0; i <= kernelRadius; i++) {

                weights.push(gaussian(i, stdDev));

            }

            return weights;

        },
        createSampleOffsets: function(kernelRadius, uvIncrement) {

            const offsets = [];

            for (let i = 0; i <= kernelRadius; i++) {

                offsets.push(uvIncrement.clone().multiplyScalar(i));

            }

            return offsets;

        },
        configure: function(material, kernelRadius, stdDev, uvIncrement) {

            material.defines['KERNEL_RADIUS'] = kernelRadius;
            material.uniforms['sampleUvOffsets'].value = BlurShaderUtils.createSampleOffsets(kernelRadius, uvIncrement);
            material.uniforms['sampleWeights'].value = BlurShaderUtils.createSampleWeights(kernelRadius, stdDev);
            material.needsUpdate = true;

        }
    };

    function gaussian(x, stdDev) {

        return Math.exp(-(x * x) / (2.0 * (stdDev * stdDev))) / (Math.sqrt(2.0 * Math.PI) * stdDev);

    }

    THREE.BlurShaderUtils = BlurShaderUtils;
    THREE.DepthLimitedBlurShader = DepthLimitedBlurShader;

})();
(function() {

    /**
     * Unpack RGBA depth shader
     * - show RGBA encoded depth as monochrome color
     */
    const UnpackDepthRGBAShader = {
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'opacity': {
                value: 1.0
            }
        },
        vertexShader:
        /* glsl */
            `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		uniform float opacity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		#include <packing>
		void main() {
			float depth = 1.0 - unpackRGBAToDepth( texture2D( tDiffuse, vUv ) );
			gl_FragColor = vec4( vec3( depth ), opacity );
		}`
    };

    THREE.UnpackDepthRGBAShader = UnpackDepthRGBAShader;

})();
(function() {

    /**
     * SAO implementation inspired from bhouston previous SAO work
     */

    class SAOPass extends THREE.Pass {

        constructor(scene, camera, depthTexture, useNormals, resolution) {

            super();
            this.scene = scene;
            this.camera = camera;
            this.clear = true;
            this.needsSwap = false;
            this.supportsDepthTextureExtension = depthTexture !== undefined ? depthTexture : false;
            this.supportsNormalTexture = useNormals !== undefined ? useNormals : false;
            this.originalClearColor = new THREE.Color();
            this._oldClearColor = new THREE.Color();
            this.oldClearAlpha = 1;
            this.params = {
                output: 0,
                saoBias: 0.5,
                saoIntensity: 0.18,
                saoScale: 1,
                saoKernelRadius: 100,
                saoMinResolution: 0,
                saoBlur: true,
                saoBlurRadius: 8,
                saoBlurStdDev: 4,
                saoBlurDepthCutoff: 0.01
            };
            this.resolution = resolution !== undefined ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256);
            this.saoRenderTarget = new THREE.WebGLRenderTarget(this.resolution.x, this.resolution.y, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            });
            this.blurIntermediateRenderTarget = this.saoRenderTarget.clone();
            this.beautyRenderTarget = this.saoRenderTarget.clone();
            this.normalRenderTarget = new THREE.WebGLRenderTarget(this.resolution.x, this.resolution.y, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat
            });
            this.depthRenderTarget = this.normalRenderTarget.clone();

            if (this.supportsDepthTextureExtension) {

                const depthTexture = new THREE.DepthTexture();
                depthTexture.type = THREE.UnsignedShortType;
                this.beautyRenderTarget.depthTexture = depthTexture;
                this.beautyRenderTarget.depthBuffer = true;

            }

            this.depthMaterial = new THREE.MeshDepthMaterial();
            this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
            this.depthMaterial.blending = THREE.NoBlending;
            this.normalMaterial = new THREE.MeshNormalMaterial();
            this.normalMaterial.blending = THREE.NoBlending;

            if (THREE.SAOShader === undefined) {

                console.error('THREE.SAOPass relies on THREE.SAOShader');

            }

            this.saoMaterial = new THREE.ShaderMaterial({
                defines: Object.assign({}, THREE.SAOShader.defines),
                fragmentShader: THREE.SAOShader.fragmentShader,
                vertexShader: THREE.SAOShader.vertexShader,
                uniforms: THREE.UniformsUtils.clone(THREE.SAOShader.uniforms)
            });
            this.saoMaterial.extensions.derivatives = true;
            this.saoMaterial.defines['DEPTH_PACKING'] = this.supportsDepthTextureExtension ? 0 : 1;
            this.saoMaterial.defines['NORMAL_TEXTURE'] = this.supportsNormalTexture ? 1 : 0;
            this.saoMaterial.defines['PERSPECTIVE_CAMERA'] = this.camera.isPerspectiveCamera ? 1 : 0;
            this.saoMaterial.uniforms['tDepth'].value = this.supportsDepthTextureExtension ? depthTexture : this.depthRenderTarget.texture;
            this.saoMaterial.uniforms['tNormal'].value = this.normalRenderTarget.texture;
            this.saoMaterial.uniforms['size'].value.set(this.resolution.x, this.resolution.y);
            this.saoMaterial.uniforms['cameraInverseProjectionMatrix'].value.copy(this.camera.projectionMatrixInverse);
            this.saoMaterial.uniforms['cameraProjectionMatrix'].value = this.camera.projectionMatrix;
            this.saoMaterial.blending = THREE.NoBlending;

            if (THREE.DepthLimitedBlurShader === undefined) {

                console.error('THREE.SAOPass relies on THREE.DepthLimitedBlurShader');

            }

            this.vBlurMaterial = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(THREE.DepthLimitedBlurShader.uniforms),
                defines: Object.assign({}, THREE.DepthLimitedBlurShader.defines),
                vertexShader: THREE.DepthLimitedBlurShader.vertexShader,
                fragmentShader: THREE.DepthLimitedBlurShader.fragmentShader
            });
            this.vBlurMaterial.defines['DEPTH_PACKING'] = this.supportsDepthTextureExtension ? 0 : 1;
            this.vBlurMaterial.defines['PERSPECTIVE_CAMERA'] = this.camera.isPerspectiveCamera ? 1 : 0;
            this.vBlurMaterial.uniforms['tDiffuse'].value = this.saoRenderTarget.texture;
            this.vBlurMaterial.uniforms['tDepth'].value = this.supportsDepthTextureExtension ? depthTexture : this.depthRenderTarget.texture;
            this.vBlurMaterial.uniforms['size'].value.set(this.resolution.x, this.resolution.y);
            this.vBlurMaterial.blending = THREE.NoBlending;
            this.hBlurMaterial = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(THREE.DepthLimitedBlurShader.uniforms),
                defines: Object.assign({}, THREE.DepthLimitedBlurShader.defines),
                vertexShader: THREE.DepthLimitedBlurShader.vertexShader,
                fragmentShader: THREE.DepthLimitedBlurShader.fragmentShader
            });
            this.hBlurMaterial.defines['DEPTH_PACKING'] = this.supportsDepthTextureExtension ? 0 : 1;
            this.hBlurMaterial.defines['PERSPECTIVE_CAMERA'] = this.camera.isPerspectiveCamera ? 1 : 0;
            this.hBlurMaterial.uniforms['tDiffuse'].value = this.blurIntermediateRenderTarget.texture;
            this.hBlurMaterial.uniforms['tDepth'].value = this.supportsDepthTextureExtension ? depthTexture : this.depthRenderTarget.texture;
            this.hBlurMaterial.uniforms['size'].value.set(this.resolution.x, this.resolution.y);
            this.hBlurMaterial.blending = THREE.NoBlending;

            if (THREE.CopyShader === undefined) {

                console.error('THREE.SAOPass relies on THREE.CopyShader');

            }

            this.materialCopy = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(THREE.CopyShader.uniforms),
                vertexShader: THREE.CopyShader.vertexShader,
                fragmentShader: THREE.CopyShader.fragmentShader,
                blending: THREE.NoBlending
            });
            this.materialCopy.transparent = true;
            this.materialCopy.depthTest = false;
            this.materialCopy.depthWrite = false;
            this.materialCopy.blending = THREE.CustomBlending;
            this.materialCopy.blendSrc = THREE.DstColorFactor;
            this.materialCopy.blendDst = THREE.ZeroFactor;
            this.materialCopy.blendEquation = THREE.AddEquation;
            this.materialCopy.blendSrcAlpha = THREE.DstAlphaFactor;
            this.materialCopy.blendDstAlpha = THREE.ZeroFactor;
            this.materialCopy.blendEquationAlpha = THREE.AddEquation;

            if (THREE.UnpackDepthRGBAShader === undefined) {

                console.error('THREE.SAOPass relies on THREE.UnpackDepthRGBAShader');

            }

            this.depthCopy = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(THREE.UnpackDepthRGBAShader.uniforms),
                vertexShader: THREE.UnpackDepthRGBAShader.vertexShader,
                fragmentShader: THREE.UnpackDepthRGBAShader.fragmentShader,
                blending: THREE.NoBlending
            });
            this.fsQuad = new THREE.FullScreenQuad(null);

        }

        render(renderer, writeBuffer, readBuffer
            /*, deltaTime, maskActive*/
        ) {

            // Rendering readBuffer first when rendering to screen
            if (this.renderToScreen) {

                this.materialCopy.blending = THREE.NoBlending;
                this.materialCopy.uniforms['tDiffuse'].value = readBuffer.texture;
                this.materialCopy.needsUpdate = true;
                this.renderPass(renderer, this.materialCopy, null);

            }

            if (this.params.output === 1) {

                return;

            }

            renderer.getClearColor(this._oldClearColor);
            this.oldClearAlpha = renderer.getClearAlpha();
            const oldAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            renderer.setRenderTarget(this.depthRenderTarget);
            renderer.clear();
            this.saoMaterial.uniforms['bias'].value = this.params.saoBias;
            this.saoMaterial.uniforms['intensity'].value = this.params.saoIntensity;
            this.saoMaterial.uniforms['scale'].value = this.params.saoScale;
            this.saoMaterial.uniforms['kernelRadius'].value = this.params.saoKernelRadius;
            this.saoMaterial.uniforms['minResolution'].value = this.params.saoMinResolution;
            this.saoMaterial.uniforms['cameraNear'].value = this.camera.near;
            this.saoMaterial.uniforms['cameraFar'].value = this.camera.far; // this.saoMaterial.uniforms['randomSeed'].value = Math.random();

            const depthCutoff = this.params.saoBlurDepthCutoff * (this.camera.far - this.camera.near);
            this.vBlurMaterial.uniforms['depthCutoff'].value = depthCutoff;
            this.hBlurMaterial.uniforms['depthCutoff'].value = depthCutoff;
            this.vBlurMaterial.uniforms['cameraNear'].value = this.camera.near;
            this.vBlurMaterial.uniforms['cameraFar'].value = this.camera.far;
            this.hBlurMaterial.uniforms['cameraNear'].value = this.camera.near;
            this.hBlurMaterial.uniforms['cameraFar'].value = this.camera.far;
            this.params.saoBlurRadius = Math.floor(this.params.saoBlurRadius);

            if (this.prevStdDev !== this.params.saoBlurStdDev || this.prevNumSamples !== this.params.saoBlurRadius) {

                THREE.BlurShaderUtils.configure(this.vBlurMaterial, this.params.saoBlurRadius, this.params.saoBlurStdDev, new THREE.Vector2(0, 1));
                THREE.BlurShaderUtils.configure(this.hBlurMaterial, this.params.saoBlurRadius, this.params.saoBlurStdDev, new THREE.Vector2(1, 0));
                this.prevStdDev = this.params.saoBlurStdDev;
                this.prevNumSamples = this.params.saoBlurRadius;

            } // Rendering scene to depth texture


            renderer.setClearColor(0x000000);
            renderer.setRenderTarget(this.beautyRenderTarget);
            renderer.clear();
            renderer.render(this.scene, this.camera); // Re-render scene if depth texture extension is not supported

            if (!this.supportsDepthTextureExtension) {

                // Clear rule : far clipping plane in both RGBA and Basic encoding
                this.renderOverride(renderer, this.depthMaterial, this.depthRenderTarget, 0x000000, 1.0);

            }

            if (this.supportsNormalTexture) {

                // Clear rule : default normal is facing the camera
                this.renderOverride(renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0);

            } // Rendering SAO texture


            this.renderPass(renderer, this.saoMaterial, this.saoRenderTarget, 0xffffff, 1.0); // Blurring SAO texture

            if (this.params.saoBlur) {

                this.renderPass(renderer, this.vBlurMaterial, this.blurIntermediateRenderTarget, 0xffffff, 1.0);
                this.renderPass(renderer, this.hBlurMaterial, this.saoRenderTarget, 0xffffff, 1.0);

            }

            let outputMaterial = this.materialCopy; // Setting up SAO rendering

            if (this.params.output === 3) {

                if (this.supportsDepthTextureExtension) {

                    this.materialCopy.uniforms['tDiffuse'].value = this.beautyRenderTarget.depthTexture;
                    this.materialCopy.needsUpdate = true;

                } else {

                    this.depthCopy.uniforms['tDiffuse'].value = this.depthRenderTarget.texture;
                    this.depthCopy.needsUpdate = true;
                    outputMaterial = this.depthCopy;

                }

            } else if (this.params.output === 4) {

                this.materialCopy.uniforms['tDiffuse'].value = this.normalRenderTarget.texture;
                this.materialCopy.needsUpdate = true;

            } else {

                this.materialCopy.uniforms['tDiffuse'].value = this.saoRenderTarget.texture;
                this.materialCopy.needsUpdate = true;

            } // Blending depends on output, only want a THREE.CustomBlending when showing SAO


            if (this.params.output === 0) {

                outputMaterial.blending = THREE.CustomBlending;

            } else {

                outputMaterial.blending = THREE.NoBlending;

            } // Rendering SAOPass result on top of previous pass


            this.renderPass(renderer, outputMaterial, this.renderToScreen ? null : readBuffer);
            renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
            renderer.autoClear = oldAutoClear;

        }

        renderPass(renderer, passMaterial, renderTarget, clearColor, clearAlpha) {

            // save original state
            renderer.getClearColor(this.originalClearColor);
            const originalClearAlpha = renderer.getClearAlpha();
            const originalAutoClear = renderer.autoClear;
            renderer.setRenderTarget(renderTarget); // setup pass state

            renderer.autoClear = false;

            if (clearColor !== undefined && clearColor !== null) {

                renderer.setClearColor(clearColor);
                renderer.setClearAlpha(clearAlpha || 0.0);
                renderer.clear();

            }

            this.fsQuad.material = passMaterial;
            this.fsQuad.render(renderer); // restore original state

            renderer.autoClear = originalAutoClear;
            renderer.setClearColor(this.originalClearColor);
            renderer.setClearAlpha(originalClearAlpha);

        }

        renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {

            renderer.getClearColor(this.originalClearColor);
            const originalClearAlpha = renderer.getClearAlpha();
            const originalAutoClear = renderer.autoClear;
            renderer.setRenderTarget(renderTarget);
            renderer.autoClear = false;
            clearColor = overrideMaterial.clearColor || clearColor;
            clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

            if (clearColor !== undefined && clearColor !== null) {

                renderer.setClearColor(clearColor);
                renderer.setClearAlpha(clearAlpha || 0.0);
                renderer.clear();

            }

            this.scene.overrideMaterial = overrideMaterial;
            renderer.render(this.scene, this.camera);
            this.scene.overrideMaterial = null; // restore original state

            renderer.autoClear = originalAutoClear;
            renderer.setClearColor(this.originalClearColor);
            renderer.setClearAlpha(originalClearAlpha);

        }

        setSize(width, height) {

            this.beautyRenderTarget.setSize(width, height);
            this.saoRenderTarget.setSize(width, height);
            this.blurIntermediateRenderTarget.setSize(width, height);
            this.normalRenderTarget.setSize(width, height);
            this.depthRenderTarget.setSize(width, height);
            this.saoMaterial.uniforms['size'].value.set(width, height);
            this.saoMaterial.uniforms['cameraInverseProjectionMatrix'].value.copy(this.camera.projectionMatrixInverse);
            this.saoMaterial.uniforms['cameraProjectionMatrix'].value = this.camera.projectionMatrix;
            this.saoMaterial.needsUpdate = true;
            this.vBlurMaterial.uniforms['size'].value.set(width, height);
            this.vBlurMaterial.needsUpdate = true;
            this.hBlurMaterial.uniforms['size'].value.set(width, height);
            this.hBlurMaterial.needsUpdate = true;

        }

    }

    SAOPass.OUTPUT = {
        'Beauty': 1,
        'Default': 0,
        'SAO': 2,
        'Depth': 3,
        'Normal': 4
    };

    THREE.SAOPass = SAOPass;

})();
(function() {

    class SSAOPass extends THREE.Pass {

        constructor(scene, camera, width, height) {

            super();
            this.width = width !== undefined ? width : 512;
            this.height = height !== undefined ? height : 512;
            this.clear = true;
            this.camera = camera;
            this.scene = scene;
            this.kernelRadius = 8;
            this.kernelSize = 32;
            this.kernel = [];
            this.noiseTexture = null;
            this.output = 0;
            this.minDistance = 0.005;
            this.maxDistance = 0.1;
            this._visibilityCache = new Map(); //

            this.generateSampleKernel();
            this.generateRandomKernelRotations(); // beauty render target

            const depthTexture = new THREE.DepthTexture();
            depthTexture.type = THREE.UnsignedShortType;
            this.beautyRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            }); // normal render target with depth buffer

            this.normalRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                depthTexture: depthTexture
            }); // ssao render target

            this.ssaoRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            });
            this.blurRenderTarget = this.ssaoRenderTarget.clone(); // ssao material

            if (THREE.SSAOShader === undefined) {

                console.error('THREE.SSAOPass: The pass relies on THREE.SSAOShader.');

            }

            this.ssaoMaterial = new THREE.ShaderMaterial({
                defines: Object.assign({}, THREE.SSAOShader.defines),
                uniforms: THREE.UniformsUtils.clone(THREE.SSAOShader.uniforms),
                vertexShader: THREE.SSAOShader.vertexShader,
                fragmentShader: THREE.SSAOShader.fragmentShader,
                blending: THREE.NoBlending
            });
            this.ssaoMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
            this.ssaoMaterial.uniforms['tNormal'].value = this.normalRenderTarget.texture;
            this.ssaoMaterial.uniforms['tDepth'].value = this.normalRenderTarget.depthTexture;
            this.ssaoMaterial.uniforms['tNoise'].value = this.noiseTexture;
            this.ssaoMaterial.uniforms['kernel'].value = this.kernel;
            this.ssaoMaterial.uniforms['cameraNear'].value = this.camera.near;
            this.ssaoMaterial.uniforms['cameraFar'].value = this.camera.far;
            this.ssaoMaterial.uniforms['resolution'].value.set(this.width, this.height);
            this.ssaoMaterial.uniforms['cameraProjectionMatrix'].value.copy(this.camera.projectionMatrix);
            this.ssaoMaterial.uniforms['cameraInverseProjectionMatrix'].value.copy(this.camera.projectionMatrixInverse); // normal material

            this.normalMaterial = new THREE.MeshNormalMaterial();
            this.normalMaterial.blending = THREE.NoBlending; // blur material

            this.blurMaterial = new THREE.ShaderMaterial({
                defines: Object.assign({}, THREE.SSAOBlurShader.defines),
                uniforms: THREE.UniformsUtils.clone(THREE.SSAOBlurShader.uniforms),
                vertexShader: THREE.SSAOBlurShader.vertexShader,
                fragmentShader: THREE.SSAOBlurShader.fragmentShader
            });
            this.blurMaterial.uniforms['tDiffuse'].value = this.ssaoRenderTarget.texture;
            this.blurMaterial.uniforms['resolution'].value.set(this.width, this.height); // material for rendering the depth

            this.depthRenderMaterial = new THREE.ShaderMaterial({
                defines: Object.assign({}, THREE.SSAODepthShader.defines),
                uniforms: THREE.UniformsUtils.clone(THREE.SSAODepthShader.uniforms),
                vertexShader: THREE.SSAODepthShader.vertexShader,
                fragmentShader: THREE.SSAODepthShader.fragmentShader,
                blending: THREE.NoBlending
            });
            this.depthRenderMaterial.uniforms['tDepth'].value = this.normalRenderTarget.depthTexture;
            this.depthRenderMaterial.uniforms['cameraNear'].value = this.camera.near;
            this.depthRenderMaterial.uniforms['cameraFar'].value = this.camera.far; // material for rendering the content of a render target

            this.copyMaterial = new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(THREE.CopyShader.uniforms),
                vertexShader: THREE.CopyShader.vertexShader,
                fragmentShader: THREE.CopyShader.fragmentShader,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                blendSrc: THREE.DstColorFactor,
                blendDst: THREE.ZeroFactor,
                blendEquation: THREE.AddEquation,
                blendSrcAlpha: THREE.DstAlphaFactor,
                blendDstAlpha: THREE.ZeroFactor,
                blendEquationAlpha: THREE.AddEquation
            });
            this.fsQuad = new THREE.FullScreenQuad(null);
            this.originalClearColor = new THREE.Color();

        }

        dispose() {

            // dispose render targets
            this.beautyRenderTarget.dispose();
            this.normalRenderTarget.dispose();
            this.ssaoRenderTarget.dispose();
            this.blurRenderTarget.dispose(); // dispose materials

            this.normalMaterial.dispose();
            this.blurMaterial.dispose();
            this.copyMaterial.dispose();
            this.depthRenderMaterial.dispose(); // dipsose full screen quad

            this.fsQuad.dispose();

        }

        render(renderer, writeBuffer
            /*, readBuffer, deltaTime, maskActive */
        ) {

            // render beauty
            renderer.setRenderTarget(this.beautyRenderTarget);
            renderer.clear();
            renderer.render(this.scene, this.camera); // render normals and depth (honor only meshes, points and lines do not contribute to SSAO)

            this.overrideVisibility();
            this.renderOverride(renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0);
            this.restoreVisibility(); // render SSAO

            this.ssaoMaterial.uniforms['kernelRadius'].value = this.kernelRadius;
            this.ssaoMaterial.uniforms['minDistance'].value = this.minDistance;
            this.ssaoMaterial.uniforms['maxDistance'].value = this.maxDistance;
            this.renderPass(renderer, this.ssaoMaterial, this.ssaoRenderTarget); // render blur

            this.renderPass(renderer, this.blurMaterial, this.blurRenderTarget); // output result to screen

            switch (this.output) {

                case SSAOPass.OUTPUT.SSAO:
                    this.copyMaterial.uniforms['tDiffuse'].value = this.ssaoRenderTarget.texture;
                    this.copyMaterial.blending = THREE.NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                case SSAOPass.OUTPUT.Blur:
                    this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget.texture;
                    this.copyMaterial.blending = THREE.NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                case SSAOPass.OUTPUT.Beauty:
                    this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = THREE.NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                case SSAOPass.OUTPUT.Depth:
                    this.renderPass(renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                case SSAOPass.OUTPUT.Normal:
                    this.copyMaterial.uniforms['tDiffuse'].value = this.normalRenderTarget.texture;
                    this.copyMaterial.blending = THREE.NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                case SSAOPass.OUTPUT.Default:
                    this.copyMaterial.uniforms['tDiffuse'].value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = THREE.NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    this.copyMaterial.uniforms['tDiffuse'].value = this.blurRenderTarget.texture;
                    this.copyMaterial.blending = THREE.CustomBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                    break;

                default:
                    console.warn('THREE.SSAOPass: Unknown output type.');

            }

        }

        renderPass(renderer, passMaterial, renderTarget, clearColor, clearAlpha) {

            // save original state
            renderer.getClearColor(this.originalClearColor);
            const originalClearAlpha = renderer.getClearAlpha();
            const originalAutoClear = renderer.autoClear;
            renderer.setRenderTarget(renderTarget); // setup pass state

            renderer.autoClear = false;

            if (clearColor !== undefined && clearColor !== null) {

                renderer.setClearColor(clearColor);
                renderer.setClearAlpha(clearAlpha || 0.0);
                renderer.clear();

            }

            this.fsQuad.material = passMaterial;
            this.fsQuad.render(renderer); // restore original state

            renderer.autoClear = originalAutoClear;
            renderer.setClearColor(this.originalClearColor);
            renderer.setClearAlpha(originalClearAlpha);

        }

        renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {

            renderer.getClearColor(this.originalClearColor);
            const originalClearAlpha = renderer.getClearAlpha();
            const originalAutoClear = renderer.autoClear;
            renderer.setRenderTarget(renderTarget);
            renderer.autoClear = false;
            clearColor = overrideMaterial.clearColor || clearColor;
            clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

            if (clearColor !== undefined && clearColor !== null) {

                renderer.setClearColor(clearColor);
                renderer.setClearAlpha(clearAlpha || 0.0);
                renderer.clear();

            }

            this.scene.overrideMaterial = overrideMaterial;
            renderer.render(this.scene, this.camera);
            this.scene.overrideMaterial = null; // restore original state

            renderer.autoClear = originalAutoClear;
            renderer.setClearColor(this.originalClearColor);
            renderer.setClearAlpha(originalClearAlpha);

        }

        setSize(width, height) {

            this.width = width;
            this.height = height;
            this.beautyRenderTarget.setSize(width, height);
            this.ssaoRenderTarget.setSize(width, height);
            this.normalRenderTarget.setSize(width, height);
            this.blurRenderTarget.setSize(width, height);
            this.ssaoMaterial.uniforms['resolution'].value.set(width, height);
            this.ssaoMaterial.uniforms['cameraProjectionMatrix'].value.copy(this.camera.projectionMatrix);
            this.ssaoMaterial.uniforms['cameraInverseProjectionMatrix'].value.copy(this.camera.projectionMatrixInverse);
            this.blurMaterial.uniforms['resolution'].value.set(width, height);

        }

        generateSampleKernel() {

            const kernelSize = this.kernelSize;
            const kernel = this.kernel;

            for (let i = 0; i < kernelSize; i++) {

                const sample = new THREE.Vector3();
                sample.x = Math.random() * 2 - 1;
                sample.y = Math.random() * 2 - 1;
                sample.z = Math.random();
                sample.normalize();
                let scale = i / kernelSize;
                scale = THREE.MathUtils.lerp(0.1, 1, scale * scale);
                sample.multiplyScalar(scale);
                kernel.push(sample);

            }

        }

        generateRandomKernelRotations() {

            const width = 4,
                height = 4;

            if (THREE.SimplexNoise === undefined) {

                console.error('THREE.SSAOPass: The pass relies on THREE.SimplexNoise.');

            }

            const simplex = new THREE.SimplexNoise();
            const size = width * height;
            const data = new Float32Array(size * 4);

            for (let i = 0; i < size; i++) {

                const stride = i * 4;
                const x = Math.random() * 2 - 1;
                const y = Math.random() * 2 - 1;
                const z = 0;
                const noise = simplex.noise3d(x, y, z);
                data[stride] = noise;
                data[stride + 1] = noise;
                data[stride + 2] = noise;
                data[stride + 3] = 1;

            }

            this.noiseTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
            this.noiseTexture.wrapS = THREE.RepeatWrapping;
            this.noiseTexture.wrapT = THREE.RepeatWrapping;

        }

        overrideVisibility() {

            const scene = this.scene;
            const cache = this._visibilityCache;
            scene.traverse(function(object) {

                cache.set(object, object.visible);
                if (object.isPoints || object.isLine) object.visible = false;

            });

        }

        restoreVisibility() {

            const scene = this.scene;
            const cache = this._visibilityCache;
            scene.traverse(function(object) {

                const visible = cache.get(object);
                object.visible = visible;

            });
            cache.clear();

        }

    }

    SSAOPass.OUTPUT = {
        'Default': 0,
        'SSAO': 1,
        'Blur': 2,
        'Beauty': 3,
        'Depth': 4,
        'Normal': 5
    };

    THREE.SSAOPass = SSAOPass;

})();
(function() {

    // Ported from Stefan Gustavson's java implementation
    // http://staffwww.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf
    // Read Stefan's excellent paper for details on how this code works.
    //
    // Sean McCullough banksean@gmail.com
    //
    // Added 4D noise

    /**
     * You can pass in a random number generator object if you like.
     * It is assumed to have a random() method.
     */
    class SimplexNoise {

        constructor(r = Math) {

            this.grad3 = [
                [1, 1, 0],
                [-1, 1, 0],
                [1, -1, 0],
                [-1, -1, 0],
                [1, 0, 1],
                [-1, 0, 1],
                [1, 0, -1],
                [-1, 0, -1],
                [0, 1, 1],
                [0, -1, 1],
                [0, 1, -1],
                [0, -1, -1]
            ];
            this.grad4 = [
                [0, 1, 1, 1],
                [0, 1, 1, -1],
                [0, 1, -1, 1],
                [0, 1, -1, -1],
                [0, -1, 1, 1],
                [0, -1, 1, -1],
                [0, -1, -1, 1],
                [0, -1, -1, -1],
                [1, 0, 1, 1],
                [1, 0, 1, -1],
                [1, 0, -1, 1],
                [1, 0, -1, -1],
                [-1, 0, 1, 1],
                [-1, 0, 1, -1],
                [-1, 0, -1, 1],
                [-1, 0, -1, -1],
                [1, 1, 0, 1],
                [1, 1, 0, -1],
                [1, -1, 0, 1],
                [1, -1, 0, -1],
                [-1, 1, 0, 1],
                [-1, 1, 0, -1],
                [-1, -1, 0, 1],
                [-1, -1, 0, -1],
                [1, 1, 1, 0],
                [1, 1, -1, 0],
                [1, -1, 1, 0],
                [1, -1, -1, 0],
                [-1, 1, 1, 0],
                [-1, 1, -1, 0],
                [-1, -1, 1, 0],
                [-1, -1, -1, 0]
            ];
            this.p = [];

            for (let i = 0; i < 256; i++) {

                this.p[i] = Math.floor(r.random() * 256);

            } // To remove the need for index wrapping, double the permutation table length


            this.perm = [];

            for (let i = 0; i < 512; i++) {

                this.perm[i] = this.p[i & 255];

            } // A lookup table to traverse the simplex around a given point in 4D.
            // Details can be found where this table is used, in the 4D noise method.


            this.simplex = [
                [0, 1, 2, 3],
                [0, 1, 3, 2],
                [0, 0, 0, 0],
                [0, 2, 3, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [1, 2, 3, 0],
                [0, 2, 1, 3],
                [0, 0, 0, 0],
                [0, 3, 1, 2],
                [0, 3, 2, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [1, 3, 2, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [1, 2, 0, 3],
                [0, 0, 0, 0],
                [1, 3, 0, 2],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [2, 3, 0, 1],
                [2, 3, 1, 0],
                [1, 0, 2, 3],
                [1, 0, 3, 2],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [2, 0, 3, 1],
                [0, 0, 0, 0],
                [2, 1, 3, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [2, 0, 1, 3],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [3, 0, 1, 2],
                [3, 0, 2, 1],
                [0, 0, 0, 0],
                [3, 1, 2, 0],
                [2, 1, 0, 3],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [3, 1, 0, 2],
                [0, 0, 0, 0],
                [3, 2, 0, 1],
                [3, 2, 1, 0]
            ];

        }

        dot(g, x, y) {

            return g[0] * x + g[1] * y;

        }

        dot3(g, x, y, z) {

            return g[0] * x + g[1] * y + g[2] * z;

        }

        dot4(g, x, y, z, w) {

            return g[0] * x + g[1] * y + g[2] * z + g[3] * w;

        }

        noise(xin, yin) {

                let n0; // Noise contributions from the three corners

                let n1;
                let n2; // Skew the input space to determine which simplex cell we're in

                const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
                const s = (xin + yin) * F2; // Hairy factor for 2D

                const i = Math.floor(xin + s);
                const j = Math.floor(yin + s);
                const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
                const t = (i + j) * G2;
                const X0 = i - t; // Unskew the cell origin back to (x,y) space

                const Y0 = j - t;
                const x0 = xin - X0; // The x,y distances from the cell origin

                const y0 = yin - Y0; // For the 2D case, the simplex shape is an equilateral triangle.
                // Determine which simplex we are in.

                let i1; // Offsets for second (middle) corner of simplex in (i,j) coords

                let j1;

                if (x0 > y0) {

                    i1 = 1;
                    j1 = 0; // lower triangle, XY order: (0,0)->(1,0)->(1,1)

                } else {

                    i1 = 0;
                    j1 = 1;

                } // upper triangle, YX order: (0,0)->(0,1)->(1,1)
                // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
                // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
                // c = (3-sqrt(3))/6


                const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords

                const y1 = y0 - j1 + G2;
                const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords

                const y2 = y0 - 1.0 + 2.0 * G2; // Work out the hashed gradient indices of the three simplex corners

                const ii = i & 255;
                const jj = j & 255;
                const gi0 = this.perm[ii + this.perm[jj]] % 12;
                const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
                const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12; // Calculate the contribution from the three corners

                let t0 = 0.5 - x0 * x0 - y0 * y0;
                if (t0 < 0) n0 = 0.0;
                else {

                    t0 *= t0;
                    n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0); // (x,y) of grad3 used for 2D gradient

                }

                let t1 = 0.5 - x1 * x1 - y1 * y1;
                if (t1 < 0) n1 = 0.0;
                else {

                    t1 *= t1;
                    n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);

                }

                let t2 = 0.5 - x2 * x2 - y2 * y2;
                if (t2 < 0) n2 = 0.0;
                else {

                    t2 *= t2;
                    n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);

                } // Add contributions from each corner to get the final noise value.
                // The result is scaled to return values in the interval [-1,1].

                return 70.0 * (n0 + n1 + n2);

            } // 3D simplex noise


        noise3d(xin, yin, zin) {

                let n0; // Noise contributions from the four corners

                let n1;
                let n2;
                let n3; // Skew the input space to determine which simplex cell we're in

                const F3 = 1.0 / 3.0;
                const s = (xin + yin + zin) * F3; // Very nice and simple skew factor for 3D

                const i = Math.floor(xin + s);
                const j = Math.floor(yin + s);
                const k = Math.floor(zin + s);
                const G3 = 1.0 / 6.0; // Very nice and simple unskew factor, too

                const t = (i + j + k) * G3;
                const X0 = i - t; // Unskew the cell origin back to (x,y,z) space

                const Y0 = j - t;
                const Z0 = k - t;
                const x0 = xin - X0; // The x,y,z distances from the cell origin

                const y0 = yin - Y0;
                const z0 = zin - Z0; // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
                // Determine which simplex we are in.

                let i1; // Offsets for second corner of simplex in (i,j,k) coords

                let j1;
                let k1;
                let i2; // Offsets for third corner of simplex in (i,j,k) coords

                let j2;
                let k2;

                if (x0 >= y0) {

                    if (y0 >= z0) {

                        i1 = 1;
                        j1 = 0;
                        k1 = 0;
                        i2 = 1;
                        j2 = 1;
                        k2 = 0; // X Y Z order

                    } else if (x0 >= z0) {

                        i1 = 1;
                        j1 = 0;
                        k1 = 0;
                        i2 = 1;
                        j2 = 0;
                        k2 = 1; // X Z Y order

                    } else {

                        i1 = 0;
                        j1 = 0;
                        k1 = 1;
                        i2 = 1;
                        j2 = 0;
                        k2 = 1;

                    } // Z X Y order

                } else {

                    // x0<y0
                    if (y0 < z0) {

                        i1 = 0;
                        j1 = 0;
                        k1 = 1;
                        i2 = 0;
                        j2 = 1;
                        k2 = 1; // Z Y X order

                    } else if (x0 < z0) {

                        i1 = 0;
                        j1 = 1;
                        k1 = 0;
                        i2 = 0;
                        j2 = 1;
                        k2 = 1; // Y Z X order

                    } else {

                        i1 = 0;
                        j1 = 1;
                        k1 = 0;
                        i2 = 1;
                        j2 = 1;
                        k2 = 0;

                    } // Y X Z order

                } // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
                // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
                // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
                // c = 1/6.


                const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords

                const y1 = y0 - j1 + G3;
                const z1 = z0 - k1 + G3;
                const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords

                const y2 = y0 - j2 + 2.0 * G3;
                const z2 = z0 - k2 + 2.0 * G3;
                const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords

                const y3 = y0 - 1.0 + 3.0 * G3;
                const z3 = z0 - 1.0 + 3.0 * G3; // Work out the hashed gradient indices of the four simplex corners

                const ii = i & 255;
                const jj = j & 255;
                const kk = k & 255;
                const gi0 = this.perm[ii + this.perm[jj + this.perm[kk]]] % 12;
                const gi1 = this.perm[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]] % 12;
                const gi2 = this.perm[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]] % 12;
                const gi3 = this.perm[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]] % 12; // Calculate the contribution from the four corners

                let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
                if (t0 < 0) n0 = 0.0;
                else {

                    t0 *= t0;
                    n0 = t0 * t0 * this.dot3(this.grad3[gi0], x0, y0, z0);

                }

                let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
                if (t1 < 0) n1 = 0.0;
                else {

                    t1 *= t1;
                    n1 = t1 * t1 * this.dot3(this.grad3[gi1], x1, y1, z1);

                }

                let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
                if (t2 < 0) n2 = 0.0;
                else {

                    t2 *= t2;
                    n2 = t2 * t2 * this.dot3(this.grad3[gi2], x2, y2, z2);

                }

                let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
                if (t3 < 0) n3 = 0.0;
                else {

                    t3 *= t3;
                    n3 = t3 * t3 * this.dot3(this.grad3[gi3], x3, y3, z3);

                } // Add contributions from each corner to get the final noise value.
                // The result is scaled to stay just inside [-1,1]

                return 32.0 * (n0 + n1 + n2 + n3);

            } // 4D simplex noise


        noise4d(x, y, z, w) {

            // For faster and easier lookups
            const grad4 = this.grad4;
            const simplex = this.simplex;
            const perm = this.perm; // The skewing and unskewing factors are hairy again for the 4D case

            const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
            const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;
            let n0; // Noise contributions from the five corners

            let n1;
            let n2;
            let n3;
            let n4; // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in

            const s = (x + y + z + w) * F4; // Factor for 4D skewing

            const i = Math.floor(x + s);
            const j = Math.floor(y + s);
            const k = Math.floor(z + s);
            const l = Math.floor(w + s);
            const t = (i + j + k + l) * G4; // Factor for 4D unskewing

            const X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space

            const Y0 = j - t;
            const Z0 = k - t;
            const W0 = l - t;
            const x0 = x - X0; // The x,y,z,w distances from the cell origin

            const y0 = y - Y0;
            const z0 = z - Z0;
            const w0 = w - W0; // For the 4D case, the simplex is a 4D shape I won't even try to describe.
            // To find out which of the 24 possible simplices we're in, we need to
            // determine the magnitude ordering of x0, y0, z0 and w0.
            // The method below is a good way of finding the ordering of x,y,z,w and
            // then find the correct traversal order for the simplex we’re in.
            // First, six pair-wise comparisons are performed between each possible pair
            // of the four coordinates, and the results are used to add up binary bits
            // for an integer index.

            const c1 = x0 > y0 ? 32 : 0;
            const c2 = x0 > z0 ? 16 : 0;
            const c3 = y0 > z0 ? 8 : 0;
            const c4 = x0 > w0 ? 4 : 0;
            const c5 = y0 > w0 ? 2 : 0;
            const c6 = z0 > w0 ? 1 : 0;
            const c = c1 + c2 + c3 + c4 + c5 + c6; // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
            // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
            // impossible. Only the 24 indices which have non-zero entries make any sense.
            // We use a thresholding to set the coordinates in turn from the largest magnitude.
            // The number 3 in the "simplex" array is at the position of the largest coordinate.

            const i1 = simplex[c][0] >= 3 ? 1 : 0;
            const j1 = simplex[c][1] >= 3 ? 1 : 0;
            const k1 = simplex[c][2] >= 3 ? 1 : 0;
            const l1 = simplex[c][3] >= 3 ? 1 : 0; // The number 2 in the "simplex" array is at the second largest coordinate.

            const i2 = simplex[c][0] >= 2 ? 1 : 0;
            const j2 = simplex[c][1] >= 2 ? 1 : 0;
            const k2 = simplex[c][2] >= 2 ? 1 : 0;
            const l2 = simplex[c][3] >= 2 ? 1 : 0; // The number 1 in the "simplex" array is at the second smallest coordinate.

            const i3 = simplex[c][0] >= 1 ? 1 : 0;
            const j3 = simplex[c][1] >= 1 ? 1 : 0;
            const k3 = simplex[c][2] >= 1 ? 1 : 0;
            const l3 = simplex[c][3] >= 1 ? 1 : 0; // The fifth corner has all coordinate offsets = 1, so no need to look that up.

            const x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords

            const y1 = y0 - j1 + G4;
            const z1 = z0 - k1 + G4;
            const w1 = w0 - l1 + G4;
            const x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords

            const y2 = y0 - j2 + 2.0 * G4;
            const z2 = z0 - k2 + 2.0 * G4;
            const w2 = w0 - l2 + 2.0 * G4;
            const x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords

            const y3 = y0 - j3 + 3.0 * G4;
            const z3 = z0 - k3 + 3.0 * G4;
            const w3 = w0 - l3 + 3.0 * G4;
            const x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords

            const y4 = y0 - 1.0 + 4.0 * G4;
            const z4 = z0 - 1.0 + 4.0 * G4;
            const w4 = w0 - 1.0 + 4.0 * G4; // Work out the hashed gradient indices of the five simplex corners

            const ii = i & 255;
            const jj = j & 255;
            const kk = k & 255;
            const ll = l & 255;
            const gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32;
            const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32;
            const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32;
            const gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32;
            const gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32; // Calculate the contribution from the five corners

            let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
            if (t0 < 0) n0 = 0.0;
            else {

                t0 *= t0;
                n0 = t0 * t0 * this.dot4(grad4[gi0], x0, y0, z0, w0);

            }

            let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
            if (t1 < 0) n1 = 0.0;
            else {

                t1 *= t1;
                n1 = t1 * t1 * this.dot4(grad4[gi1], x1, y1, z1, w1);

            }

            let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
            if (t2 < 0) n2 = 0.0;
            else {

                t2 *= t2;
                n2 = t2 * t2 * this.dot4(grad4[gi2], x2, y2, z2, w2);

            }

            let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
            if (t3 < 0) n3 = 0.0;
            else {

                t3 *= t3;
                n3 = t3 * t3 * this.dot4(grad4[gi3], x3, y3, z3, w3);

            }

            let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
            if (t4 < 0) n4 = 0.0;
            else {

                t4 *= t4;
                n4 = t4 * t4 * this.dot4(grad4[gi4], x4, y4, z4, w4);

            } // Sum up and scale the result to cover the range [-1,1]

            return 27.0 * (n0 + n1 + n2 + n3 + n4);

        }

    }

    THREE.SimplexNoise = SimplexNoise;

})();
(function() {

    /**
     * References:
     * http://john-chapman-graphics.blogspot.com/2013/01/ssao-tutorial.html
     * https://learnopengl.com/Advanced-Lighting/SSAO
     * https://github.com/McNopper/OpenGL/blob/master/Example28/shader/ssao.frag.glsl
     */

    const SSAOShader = {
        defines: {
            'PERSPECTIVE_CAMERA': 1,
            'KERNEL_SIZE': 32
        },
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'tNormal': {
                value: null
            },
            'tDepth': {
                value: null
            },
            'tNoise': {
                value: null
            },
            'kernel': {
                value: null
            },
            'cameraNear': {
                value: null
            },
            'cameraFar': {
                value: null
            },
            'resolution': {
                value: new THREE.Vector2()
            },
            'cameraProjectionMatrix': {
                value: new THREE.Matrix4()
            },
            'cameraInverseProjectionMatrix': {
                value: new THREE.Matrix4()
            },
            'kernelRadius': {
                value: 8
            },
            'minDistance': {
                value: 0.005
            },
            'maxDistance': {
                value: 0.05
            }
        },
        vertexShader:
        /* glsl */
            `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader:
        /* glsl */
            `
		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec3 kernel[ KERNEL_SIZE ];
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;
		uniform float kernelRadius;
		uniform float minDistance; // avoid artifacts caused by neighbour fragments with minimal depth difference
		uniform float maxDistance; // avoid the influence of fragments which are too far away
		varying vec2 vUv;
		#include <packing>
		float getDepth( const in vec2 screenPosition ) {
			return texture2D( tDepth, screenPosition ).x;
		}
		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}
		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
			#else
				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
			#endif
		}
		vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {
			float clipW = cameraProjectionMatrix[2][3] * viewZ + cameraProjectionMatrix[3][3];
			vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );
			clipPosition *= clipW; // unprojection.
			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;
		}
		vec3 getViewNormal( const in vec2 screenPosition ) {
			return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );
		}
		void main() {
			float depth = getDepth( vUv );
			float viewZ = getViewZ( depth );
			vec3 viewPosition = getViewPosition( vUv, depth, viewZ );
			vec3 viewNormal = getViewNormal( vUv );
			vec2 noiseScale = vec2( resolution.x / 4.0, resolution.y / 4.0 );
			vec3 random = texture2D( tNoise, vUv * noiseScale ).xyz;
			// compute matrix used to reorient a kernel vector
			vec3 tangent = normalize( random - viewNormal * dot( random, viewNormal ) );
			vec3 bitangent = cross( viewNormal, tangent );
			mat3 kernelMatrix = mat3( tangent, bitangent, viewNormal );
		 float occlusion = 0.0;
		 for ( int i = 0; i < KERNEL_SIZE; i ++ ) {
				vec3 sampleVector = kernelMatrix * kernel[ i ]; // reorient sample vector in view space
				vec3 samplePoint = viewPosition + ( sampleVector * kernelRadius ); // calculate sample point
				vec4 samplePointNDC = cameraProjectionMatrix * vec4( samplePoint, 1.0 ); // project point and calculate NDC
				samplePointNDC /= samplePointNDC.w;
				vec2 samplePointUv = samplePointNDC.xy * 0.5 + 0.5; // compute uv coordinates
				float realDepth = getLinearDepth( samplePointUv ); // get linear depth from depth texture
				float sampleDepth = viewZToOrthographicDepth( samplePoint.z, cameraNear, cameraFar ); // compute linear depth of the sample view Z value
				float delta = sampleDepth - realDepth;
				if ( delta > minDistance && delta < maxDistance ) { // if fragment is before sample point, increase occlusion
					occlusion += 1.0;
				}
			}
			occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );
			gl_FragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );
		}`
    };
    const SSAODepthShader = {
        defines: {
            'PERSPECTIVE_CAMERA': 1
        },
        uniforms: {
            'tDepth': {
                value: null
            },
            'cameraNear': {
                value: null
            },
            'cameraFar': {
                value: null
            }
        },
        vertexShader: `varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader: `uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;
		#include <packing>
		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}
		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );
		}`
    };
    const SSAOBlurShader = {
        uniforms: {
            'tDiffuse': {
                value: null
            },
            'resolution': {
                value: new THREE.Vector2()
            }
        },
        vertexShader: `varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
        fragmentShader: `uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		varying vec2 vUv;
		void main() {
			vec2 texelSize = ( 1.0 / resolution );
			float result = 0.0;
			for ( int i = - 2; i <= 2; i ++ ) {
				for ( int j = - 2; j <= 2; j ++ ) {
					vec2 offset = ( vec2( float( i ), float( j ) ) ) * texelSize;
					result += texture2D( tDiffuse, vUv + offset ).r;
				}
			}
			gl_FragColor = vec4( vec3( result / ( 5.0 * 5.0 ) ), 1.0 );
		}`
    };

    THREE.SSAOBlurShader = SSAOBlurShader;
    THREE.SSAODepthShader = SSAODepthShader;
    THREE.SSAOShader = SSAOShader;

})();