/**
 * realistic-character.js
 * Complete procedural realistic 3D humanoid character system for Assets_Maker.AI
 * Uses Three.js r128 global namespace (window.THREE)
 * 
 * Features:
 *  - Smooth organic geometry (NOT voxels)
 *  - 13-bone skeleton via nested THREE.Group hierarchy
 *  - PBR materials with skin subsurface scattering simulation
 *  - Full facial features: eyes, brows, nose, mouth, ears
 *  - Hair system (multiple styles)
 *  - Clothing layers adapted to character type
 *  - Interactive joint selection + drag-to-rotate
 *  - 6 Preset poses: T-Pose, A-Pose, Combat, Run, Rest, Dance
 */

const RealisticCharacter = (function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // JOINT LIMITS (radians) — prevents unnatural poses
    // ─────────────────────────────────────────────────────────────────────────
    const JOINT_LIMITS = {
        head:         { x: [-0.6, 0.5],  y: [-1.1, 1.1],  z: [-0.4, 0.4]  },
        neck:         { x: [-0.4, 0.3],  y: [-0.6, 0.6],  z: [-0.3, 0.3]  },
        spine:        { x: [-0.5, 0.4],  y: [-0.5, 0.5],  z: [-0.3, 0.3]  },
        lShoulder:    { x: [-2.4, 0.4],  y: [-0.2, 2.0],  z: [-1.6, 1.6]  },
        rShoulder:    { x: [-2.4, 0.4],  y: [-2.0, 0.2],  z: [-1.6, 1.6]  },
        lElbow:       { x: [-2.4, 0.0],  y: [-0.3, 0.3],  z: [-0.2, 0.2]  },
        rElbow:       { x: [-2.4, 0.0],  y: [-0.3, 0.3],  z: [-0.2, 0.2]  },
        lWrist:       { x: [-0.6, 0.6],  y: [-1.2, 1.2],  z: [-0.5, 0.5]  },
        rWrist:       { x: [-0.6, 0.6],  y: [-1.2, 1.2],  z: [-0.5, 0.5]  },
        lHip:         { x: [-0.3, 2.2],  y: [-0.8, 0.8],  z: [-0.3, 0.8]  },
        rHip:         { x: [-0.3, 2.2],  y: [-0.8, 0.8],  z: [-0.8, 0.3]  },
        lKnee:        { x: [-2.4, 0.1],  y: [-0.1, 0.1],  z: [-0.1, 0.1]  },
        rKnee:        { x: [-2.4, 0.1],  y: [-0.1, 0.1],  z: [-0.1, 0.1]  },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PRESET POSES
    // ─────────────────────────────────────────────────────────────────────────
    const POSES = {
        tpose: {
            name: 'T-Pose',
            joints: {
                lShoulder: { x: 0,    y: 0,    z:  1.55 },
                rShoulder: { x: 0,    y: 0,    z: -1.55 },
                lElbow:    { x: 0,    y: 0,    z:  0    },
                rElbow:    { x: 0,    y: 0,    z:  0    },
            }
        },
        apose: {
            name: 'A-Pose',
            joints: {
                lShoulder: { x: 0.05, y: 0,    z:  0.55 },
                rShoulder: { x: 0.05, y: 0,    z: -0.55 },
                lElbow:    { x: 0,    y: 0,    z:  0    },
                rElbow:    { x: 0,    y: 0,    z:  0    },
            }
        },
        combat: {
            name: 'Combate',
            joints: {
                spine:     { x: 0.18, y: 0.05, z:  0    },
                head:      { x: 0.1,  y: 0.08, z:  0    },
                lShoulder: { x:-0.4,  y: 0.2,  z:  0.35 },
                rShoulder: { x:-1.0,  y:-0.3,  z: -0.3  },
                lElbow:    { x:-0.8,  y: 0,    z:  0    },
                rElbow:    { x:-1.5,  y: 0,    z:  0    },
                lHip:      { x: 0.3,  y: 0,    z:  0.15 },
                rHip:      { x:-0.1,  y: 0,    z: -0.1  },
                lKnee:     { x:-0.45, y: 0,    z:  0    },
                rKnee:     { x:-0.15, y: 0,    z:  0    },
            }
        },
        run: {
            name: 'Correr',
            joints: {
                spine:     { x: 0.22, y: 0,    z:  0    },
                head:      { x: 0.15, y: 0,    z:  0    },
                lShoulder: { x:-0.8,  y: 0,    z:  0.2  },
                rShoulder: { x: 0.5,  y: 0,    z: -0.2  },
                lElbow:    { x:-0.9,  y: 0,    z:  0    },
                rElbow:    { x:-0.9,  y: 0,    z:  0    },
                lHip:      { x: 0.7,  y: 0,    z:  0.1  },
                rHip:      { x:-0.6,  y: 0,    z: -0.1  },
                lKnee:     { x:-0.9,  y: 0,    z:  0    },
                rKnee:     { x:-1.4,  y: 0,    z:  0    },
            }
        },
        rest: {
            name: 'Descanso',
            joints: {
                spine:     { x:-0.05, y: 0,    z:  0    },
                head:      { x:-0.12, y: 0.15, z:  0    },
                lShoulder: { x: 0.1,  y: 0,    z:  0.32 },
                rShoulder: { x: 0.1,  y: 0,    z: -0.32 },
                lElbow:    { x:-0.6,  y: 0,    z:  0    },
                rElbow:    { x:-0.6,  y: 0,    z:  0    },
            }
        },
        dance: {
            name: 'Bailar',
            joints: {
                spine:     { x: 0,    y: 0.3,  z:  0.12 },
                head:      { x: 0,    y:-0.3,  z:  0.05 },
                lShoulder: { x:-0.5,  y: 0.5,  z:  0.9  },
                rShoulder: { x: 0.4,  y:-0.4,  z: -0.7  },
                lElbow:    { x:-1.2,  y: 0.2,  z:  0    },
                rElbow:    { x:-0.8,  y:-0.2,  z:  0    },
                lHip:      { x: 0.2,  y: 0.1,  z:  0.15 },
                rHip:      { x:-0.3,  y:-0.1,  z: -0.15 },
                lKnee:     { x:-0.3,  y: 0,    z:  0    },
                rKnee:     { x:-0.5,  y: 0,    z:  0    },
            }
        },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function hexToColor(hex) {
        return new THREE.Color(hex);
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** Make a smooth tapered limb cylinder */
    function limb(rTop, rBot, height, segs = 14) {
        return new THREE.CylinderGeometry(rTop, rBot, height, segs, 3);
    }

    /** Skin material with SSS simulation and custom canvas mapping support */
    function skinMat(color) {
        const c = new THREE.Color(color);
        // If a canvas texture is available, we blend it or use standard texture mapping
        const texture = window.materials && window.materials.canvasTex ? window.materials.canvasTex : null;
        return new THREE.MeshStandardMaterial({
            color: c,
            map: texture,
            roughness: 0.65,
            metalness: 0.02,
            emissive: c.clone().multiplyScalar(0.08),
        });
    }

    /** Cloth material with canvas texture support for complex clothing patterns */
    function clothMat(color, rough = 0.85) {
        const texture = window.materials && window.materials.canvasTex ? window.materials.canvasTex : null;
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            map: texture,
            roughness: rough,
            metalness: 0.05,
        });
    }

    /** Metal material */
    function metalMat(color, rough = 0.22, metal = 0.88) {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: rough,
            metalness: metal,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD HEAD
    // ─────────────────────────────────────────────────────────────────────────
    function buildHead(opts) {
        const { skinColor, hairColor, type, gender } = opts;
        const group = new THREE.Group();
        group.name = 'head';

        // Skull (slightly ovoid)
        const headGeo = new THREE.SphereGeometry(0.42, 32, 32);
        // Slightly flatten vertically for skull shape
        headGeo.scale(1.0, 1.05, 0.95);
        
        // Planar frontal UV projection mapping for the head face
        const headUvs = headGeo.attributes.uv;
        const headPositions = headGeo.attributes.position;
        for (let i = 0; i < headPositions.count; i++) {
            const x = headPositions.getX(i);
            const y = headPositions.getY(i);
            const z = headPositions.getZ(i);
            // Project XY flatly for the front face (z > 0)
            if (z > -0.1) {
                const u = 0.5 + (x / 0.84) * 0.8;
                const v = 0.5 + (y / 0.84) * 0.8;
                headUvs.setXY(i, clamp(u, 0, 1), clamp(v, 0, 1));
            }
        }
        
        const headMesh = new THREE.Mesh(headGeo, skinMat(skinColor));
        headMesh.castShadow = true;
        headMesh.name = 'head_mesh';
        group.add(headMesh);

        // Jaw / lower face widening
        const jawGeo = new THREE.SphereGeometry(0.33, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
        const jaw = new THREE.Mesh(jawGeo, skinMat(skinColor));
        jaw.position.y = -0.15;
        jaw.castShadow = true;
        group.add(jaw);

        // Ears
        [-1, 1].forEach(side => {
            const earOuter = new THREE.SphereGeometry(0.09, 12, 10);
            const ear = new THREE.Mesh(earOuter, skinMat(skinColor));
            ear.position.set(side * 0.42, 0.02, 0.0);
            ear.scale.set(0.65, 1.0, 0.5);
            ear.castShadow = true;
            group.add(ear);

            // Inner ear detail
            const innerGeo = new THREE.SphereGeometry(0.055, 8, 8);
            const inner = new THREE.Mesh(innerGeo, skinMat(darken(skinColor, 0.12)));
            inner.position.set(side * 0.44, 0.0, 0.0);
            inner.scale.set(0.4, 0.7, 0.4);
            group.add(inner);
        });

        // Eyes
        [-1, 1].forEach(side => {
            // White sclera
            const scleraGeo = new THREE.SphereGeometry(0.075, 14, 10);
            const sclera = new THREE.Mesh(scleraGeo, new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 }));
            sclera.position.set(side * 0.155, 0.1, 0.355);
            sclera.scale.set(1.0, 0.72, 0.72);
            sclera.castShadow = false;
            group.add(sclera);

            // Iris
            const irisGeo = new THREE.CircleGeometry(0.045, 16);
            const irisMat = new THREE.MeshStandardMaterial({ color: 0x3b6ab5, roughness: 0.3, metalness: 0.05 });
            const iris = new THREE.Mesh(irisGeo, irisMat);
            iris.position.set(side * 0.155, 0.1, 0.408);
            group.add(iris);

            // Pupil
            const pupilGeo = new THREE.CircleGeometry(0.022, 12);
            const pupil = new THREE.Mesh(pupilGeo, new THREE.MeshStandardMaterial({ color: 0x080808 }));
            pupil.position.set(side * 0.155, 0.1, 0.412);
            group.add(pupil);

            // Highlight spec
            const specGeo = new THREE.CircleGeometry(0.009, 8);
            const spec = new THREE.Mesh(specGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }));
            spec.position.set(side * 0.155 + 0.016, 0.117, 0.415);
            group.add(spec);

            // Eyelid top
            const lidGeo = new THREE.SphereGeometry(0.078, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
            const lid = new THREE.Mesh(lidGeo, skinMat(skinColor));
            lid.position.set(side * 0.155, 0.13, 0.36);
            lid.rotation.x = 0.5;
            lid.scale.set(1.05, 0.55, 0.75);
            group.add(lid);

            // Eyebrow
            const browGeo = new THREE.BoxGeometry(0.12, 0.016, 0.02);
            const browColor = hairColor || '#1a0a00';
            const brow = new THREE.Mesh(browGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(browColor) }));
            brow.position.set(side * 0.155, 0.225, 0.355);
            brow.rotation.z = side * 0.12;
            group.add(brow);
        });

        // Nose
        const noseGeo = new THREE.SphereGeometry(0.055, 10, 8);
        const nose = new THREE.Mesh(noseGeo, skinMat(darken(skinColor, 0.05)));
        nose.scale.set(1.0, 0.7, 0.9);
        nose.position.set(0, 0.0, 0.39);
        group.add(nose);

        // Nose bridge
        const bridgeGeo = new THREE.BoxGeometry(0.032, 0.1, 0.04);
        const bridge = new THREE.Mesh(bridgeGeo, skinMat(darken(skinColor, 0.03)));
        bridge.position.set(0, 0.07, 0.385);
        group.add(bridge);

        // Nostrils
        [-1, 1].forEach(side => {
            const nostrilGeo = new THREE.SphereGeometry(0.025, 8, 6);
            const nostril = new THREE.Mesh(nostrilGeo, skinMat(darken(skinColor, 0.18)));
            nostril.position.set(side * 0.045, -0.025, 0.4);
            nostril.scale.set(0.8, 0.55, 0.7);
            group.add(nostril);
        });

        // Lips / Mouth
        // Upper lip
        const upperLipGeo = new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
        const lipColor = lighten(skinColor, -0.08);
        const upperLip = new THREE.Mesh(upperLipGeo, skinMat(lipColor));
        upperLip.scale.set(1.4, 0.55, 0.7);
        upperLip.position.set(0, -0.115, 0.375);
        group.add(upperLip);

        // Lower lip
        const lowerLipGeo = new THREE.SphereGeometry(0.072, 12, 8);
        const lowerLip = new THREE.Mesh(lowerLipGeo, skinMat(lighten(skinColor, -0.05)));
        lowerLip.scale.set(1.3, 0.45, 0.62);
        lowerLip.position.set(0, -0.165, 0.37);
        group.add(lowerLip);

        // Chin
        const chinGeo = new THREE.SphereGeometry(0.12, 12, 8);
        const chin = new THREE.Mesh(chinGeo, skinMat(skinColor));
        chin.scale.set(0.95, 0.65, 0.75);
        chin.position.set(0, -0.28, 0.22);
        group.add(chin);

        // Cheekbones subtle
        [-1, 1].forEach(side => {
            const cheekGeo = new THREE.SphereGeometry(0.12, 10, 8);
            const cheek = new THREE.Mesh(cheekGeo, skinMat(skinColor));
            cheek.scale.set(0.9, 0.6, 0.55);
            cheek.position.set(side * 0.26, 0.0, 0.29);
            group.add(cheek);
        });

        // ── HAIR ──
        buildHair(group, opts);

        return group;
    }

    function darken(hex, amt) {
        const c = new THREE.Color(hex);
        c.r = clamp(c.r - amt, 0, 1);
        c.g = clamp(c.g - amt, 0, 1);
        c.b = clamp(c.b - amt, 0, 1);
        return '#' + c.getHexString();
    }

    function lighten(hex, amt) {
        return darken(hex, -amt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HAIR
    // ─────────────────────────────────────────────────────────────────────────
    function buildHair(headGroup, opts) {
        const { hairColor, type, gender } = opts;
        const hMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(hairColor || '#1a0a00'),
            roughness: 0.78,
            metalness: 0.02,
        });

        const isLong = gender === 'female' || type === 'princess' || type === 'noble' || type === 'mage';
        const isBald = type === 'skeleton' || type === 'boss';
        const hasBun = type === 'elder' || type === 'innkeeper';
        const hasMohawk = type === 'warrior' || type === 'bandit';

        if (isBald) return;

        // Skull cap
        const capGeo = new THREE.SphereGeometry(0.44, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.58);
        const cap = new THREE.Mesh(capGeo, hMat);
        cap.position.y = 0.04;
        cap.castShadow = true;
        headGroup.add(cap);

        if (isLong) {
            // Long flowing hair down back
            const longGeo = new THREE.CylinderGeometry(0.36, 0.15, 0.85, 16, 4);
            const longHair = new THREE.Mesh(longGeo, hMat);
            longHair.position.set(0, -0.25, -0.1);
            longHair.rotation.x = -0.18;
            longHair.castShadow = true;
            headGroup.add(longHair);

            // Side strands
            [-1, 1].forEach(side => {
                const strandGeo = new THREE.CylinderGeometry(0.1, 0.04, 0.7, 10, 3);
                const strand = new THREE.Mesh(strandGeo, hMat);
                strand.position.set(side * 0.28, -0.32, 0.05);
                strand.rotation.z = side * 0.25;
                headGroup.add(strand);
            });
        } else if (hasBun) {
            const bunGeo = new THREE.SphereGeometry(0.15, 12, 10);
            const bun = new THREE.Mesh(bunGeo, hMat);
            bun.position.set(0, 0.42, -0.15);
            bun.scale.set(1, 0.8, 0.8);
            headGroup.add(bun);
        } else if (hasMohawk) {
            // Mohawk strip
            for (let i = 0; i < 6; i++) {
                const spGeo = new THREE.ConeGeometry(0.06, 0.22 - i * 0.02, 6);
                const sp = new THREE.Mesh(spGeo, hMat);
                sp.position.set(0, 0.44, -0.18 + i * 0.1);
                sp.rotation.x = 0.2 * i;
                headGroup.add(sp);
            }
        } else {
            // Short side hair
            [-1, 1].forEach(side => {
                const sideGeo = new THREE.SphereGeometry(0.22, 12, 10);
                const sideHair = new THREE.Mesh(sideGeo, hMat);
                sideHair.position.set(side * 0.35, 0.08, -0.08);
                sideHair.scale.set(0.55, 0.8, 0.65);
                headGroup.add(sideHair);
            });
            // Back
            const backGeo = new THREE.SphereGeometry(0.3, 14, 10);
            const backHair = new THREE.Mesh(backGeo, hMat);
            backHair.position.set(0, 0.05, -0.26);
            backHair.scale.set(0.9, 0.75, 0.6);
            headGroup.add(backHair);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD TORSO
    // ─────────────────────────────────────────────────────────────────────────
    function buildTorso(opts) {
        const { skinColor, primaryColor, type, gender } = opts;
        const group = new THREE.Group();
        group.name = 'torso';

        const isFemale = gender === 'female';
        const clothColor = primaryColor || '#4a6fa5';

        // Torso body — tapered box-like shape using LatheGeometry approximation
        // Use a BoxGeometry with slight shoulder taper
        const torsoGeo = new THREE.BoxGeometry(0.64, 0.82, 0.36, 2, 4, 2);
        // Manually reshape vertices to taper shoulders wider and waist narrower
        const posAttr = torsoGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            // y ranges from -0.41 to 0.41
            // Shoulder width at top, narrow at waist (y≈0), wider at hip (y at bottom)
            const t = (y + 0.41) / 0.82; // 0=bottom, 1=top
            let xScale;
            if (t > 0.6) {
                xScale = 1.05 + (t - 0.6) * 0.5; // shoulders wider
            } else if (t > 0.35) {
                xScale = 0.82 + (t - 0.35) * (1.05 - 0.82) / 0.25;
            } else {
                xScale = 0.82 - (0.35 - t) * 0.15; // slight hip flare
            }
            if (isFemale) {
                // Hourglass — narrower waist
                if (t > 0.3 && t < 0.65) {
                    xScale *= 0.78;
                }
            }
            posAttr.setX(i, posAttr.getX(i) * xScale);
        }
        
        // Planar frontal UV projection mapping for torso front details
        const torsoUvs = torsoGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);
            if (z > -0.05) {
                // Project flatly from the canvas space
                const u = 0.5 + (x / 1.0) * 0.9;
                const v = 0.5 + (y / 1.2) * 0.9;
                torsoUvs.setXY(i, clamp(u, 0, 1), clamp(v, 0, 1));
            }
        }
        
        torsoGeo.computeVertexNormals();

        const torsoMesh = new THREE.Mesh(torsoGeo, clothMat(clothColor));
        torsoMesh.castShadow = true;
        torsoMesh.name = 'torso_mesh';
        group.add(torsoMesh);

        // Collar / neck connection
        const collarGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.1, 16);
        const collar = new THREE.Mesh(collarGeo, clothMat(clothColor));
        collar.position.y = 0.43;
        group.add(collar);

        // Belt (if has one)
        if (type !== 'mage' && type !== 'child') {
            const beltGeo = new THREE.CylinderGeometry(0.285, 0.285, 0.07, 20);
            const beltColor = type === 'warrior' || type === 'guard' ? '#1a1a1a' : '#5c3a1e';
            const belt = new THREE.Mesh(beltGeo, metalMat(beltColor, 0.6, 0.3));
            belt.position.y = -0.25;
            group.add(belt);

            // Belt buckle
            const buckleGeo = new THREE.BoxGeometry(0.1, 0.07, 0.04);
            const buckle = new THREE.Mesh(buckleGeo, metalMat('#d4a017', 0.2, 0.8));
            buckle.position.set(0, -0.25, 0.19);
            group.add(buckle);
        }

        // Chest detail based on type
        if (type === 'warrior' || type === 'guard' || type === 'knight') {
            // Breastplate
            const plateGeo = new THREE.BoxGeometry(0.5, 0.52, 0.08);
            const plate = new THREE.Mesh(plateGeo, metalMat('#8a9bb0', 0.25, 0.7));
            plate.position.set(0, 0.1, 0.19);
            plate.rotation.x = 0.08;
            group.add(plate);

            // Pauldrons (shoulder guards) — added to shoulder joints separately
        } else if (type === 'mage' || type === 'wizard') {
            // Robe front panel
            const robeGeo = new THREE.PlaneGeometry(0.44, 0.6);
            const robeMesh = new THREE.Mesh(robeGeo, clothMat(darken(clothColor, 0.08)));
            robeMesh.position.set(0, 0.02, 0.19);
            group.add(robeMesh);
        }

        // Spine definition (back muscle line)
        const spineGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.65, 8);
        const spineMesh = new THREE.Mesh(spineGeo, clothMat(darken(clothColor, 0.12)));
        spineMesh.position.set(0, 0.05, -0.18);
        group.add(spineMesh);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD ARM (left or right)
    // ─────────────────────────────────────────────────────────────────────────
    function buildArm(opts, side) {
        const { skinColor, primaryColor, type } = opts;
        const s = side; // 1 = left, -1 = right
        const group = new THREE.Group();
        group.name = side === 1 ? 'lArm' : 'rArm';

        // Upper arm
        const upperGeo = limb(0.115, 0.1, 0.55);
        const upper = new THREE.Mesh(upperGeo, clothMat(primaryColor || '#4a6fa5'));
        upper.position.y = -0.275;
        upper.castShadow = true;
        upper.name = 'upper_arm';
        group.add(upper);

        // Elbow joint group (pivot point)
        const elbowGroup = new THREE.Group();
        elbowGroup.name = side === 1 ? 'lElbow' : 'rElbow';
        elbowGroup.position.y = -0.55;
        group.add(elbowGroup);

        // Forearm
        const foreGeo = limb(0.095, 0.075, 0.5);
        const fore = new THREE.Mesh(foreGeo, skinMat(skinColor));
        fore.position.y = -0.25;
        fore.castShadow = true;
        elbowGroup.add(fore);

        // Wrist pivot
        const wristGroup = new THREE.Group();
        wristGroup.name = side === 1 ? 'lWrist' : 'rWrist';
        wristGroup.position.y = -0.5;
        elbowGroup.add(wristGroup);

        // Hand
        buildHand(wristGroup, opts, side);

        // Cuff/sleeve decoration
        const cuffGeo = new THREE.CylinderGeometry(0.102, 0.102, 0.06, 16);
        const cuff = new THREE.Mesh(cuffGeo, clothMat(darken(primaryColor || '#4a6fa5', 0.12)));
        cuff.position.y = -0.29;
        group.add(cuff);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD HAND
    // ─────────────────────────────────────────────────────────────────────────
    function buildHand(parent, opts, side) {
        const { skinColor } = opts;
        const group = new THREE.Group();
        group.name = side === 1 ? 'lHand' : 'rHand';

        // Palm
        const palmGeo = new THREE.BoxGeometry(0.14, 0.16, 0.065);
        const palm = new THREE.Mesh(palmGeo, skinMat(skinColor));
        palm.position.y = -0.09;
        palm.castShadow = true;
        group.add(palm);

        // Thumb
        const thumbGeo = limb(0.025, 0.02, 0.1, 8);
        const thumb = new THREE.Mesh(thumbGeo, skinMat(skinColor));
        thumb.position.set(side * 0.075, -0.065, 0);
        thumb.rotation.z = side * 0.6;
        group.add(thumb);

        // Fingers (4)
        const fingerOffsets = [-0.045, -0.015, 0.015, 0.045];
        fingerOffsets.forEach((ox, fi) => {
            const finLen = 0.105 - fi * 0.006;
            const finGeo = limb(0.02, 0.015, finLen, 8);
            const finger = new THREE.Mesh(finGeo, skinMat(skinColor));
            finger.position.set(ox, -0.19 - finLen / 2, 0);
            group.add(finger);
        });

        parent.add(group);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD LEG
    // ─────────────────────────────────────────────────────────────────────────
    function buildLeg(opts, side) {
        const { skinColor, primaryColor, accentColor, type } = opts;
        const group = new THREE.Group();
        group.name = side === 1 ? 'lLeg' : 'rLeg';

        const pantsColor = accentColor || '#2d3a4a';

        // Thigh
        const thighGeo = limb(0.145, 0.125, 0.58);
        const thigh = new THREE.Mesh(thighGeo, clothMat(pantsColor));
        thigh.position.y = -0.29;
        thigh.castShadow = true;
        group.add(thigh);

        // Knee pivot
        const kneeGroup = new THREE.Group();
        kneeGroup.name = side === 1 ? 'lKnee' : 'rKnee';
        kneeGroup.position.y = -0.58;
        group.add(kneeGroup);

        // Shin
        const shinGeo = limb(0.115, 0.085, 0.55);
        const shin = new THREE.Mesh(shinGeo, clothMat(darken(pantsColor, 0.06)));
        shin.position.y = -0.275;
        shin.castShadow = true;
        kneeGroup.add(shin);

        // Knee cap detail
        const kneecapGeo = new THREE.SphereGeometry(0.07, 10, 8);
        const kneecap = new THREE.Mesh(kneecapGeo, skinMat(skinColor));
        kneecap.scale.set(1.0, 0.7, 0.8);
        kneecap.position.set(0, 0.02, 0.06);
        kneeGroup.add(kneecap);

        // Foot
        const footGroup = new THREE.Group();
        footGroup.name = side === 1 ? 'lFoot' : 'rFoot';
        footGroup.position.y = -0.55;
        kneeGroup.add(footGroup);
        buildFoot(footGroup, opts);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD FOOT
    // ─────────────────────────────────────────────────────────────────────────
    function buildFoot(parent, opts) {
        const { skinColor, type } = opts;
        const bootColor = type === 'warrior' || type === 'guard' ? '#1a1a1a' :
                          type === 'mage' ? '#2d1a4a' : '#5c3a1e';

        // Ankle
        const ankleGeo = limb(0.085, 0.08, 0.1, 12);
        const ankle = new THREE.Mesh(ankleGeo, clothMat(bootColor));
        ankle.position.y = -0.05;
        parent.add(ankle);

        // Boot/foot
        const footGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3);
        const foot = new THREE.Mesh(footGeo, clothMat(bootColor));
        foot.position.set(0, -0.14, 0.065);
        foot.castShadow = true;
        parent.add(foot);

        // Boot sole
        const soleGeo = new THREE.BoxGeometry(0.19, 0.025, 0.31);
        const sole = new THREE.Mesh(soleGeo, clothMat(darken(bootColor, 0.2)));
        sole.position.set(0, -0.195, 0.065);
        parent.add(sole);

        // Toe cap
        const toeGeo = new THREE.SphereGeometry(0.075, 10, 6);
        const toe = new THREE.Mesh(toeGeo, clothMat(bootColor));
        toe.position.set(0, -0.14, 0.19);
        toe.scale.set(1.1, 0.7, 0.65);
        parent.add(toe);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD NECK
    // ─────────────────────────────────────────────────────────────────────────
    function buildNeck(opts) {
        const { skinColor } = opts;
        const neckGeo = limb(0.1, 0.12, 0.22, 16);
        const neck = new THREE.Mesh(neckGeo, skinMat(skinColor));
        neck.castShadow = true;
        neck.name = 'neck_mesh';
        return neck;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ASSEMBLE FULL CHARACTER
    // ─────────────────────────────────────────────────────────────────────────
    function build(opts) {
        const {
            type = 'warrior',
            skinColor = '#e8b89a',
            hairColor = '#1a0a00',
            primaryColor = '#4a6fa5',
            accentColor = '#2d3a4a',
            gender = 'male',
        } = opts;

        const charOpts = { type, skinColor, hairColor, primaryColor, accentColor, gender };

        // ROOT group (pelvis)
        const root = new THREE.Group();
        root.name = 'character_root';

        // Scale for appropriate world size
        root.scale.setScalar(0.85);

        // ── PELVIS / HIP ──
        const hipGeo = new THREE.BoxGeometry(0.52, 0.22, 0.3);
        const hipMesh = new THREE.Mesh(hipGeo, clothMat(accentColor));
        hipMesh.castShadow = true;
        hipMesh.name = 'hip_mesh';
        root.add(hipMesh);

        // ── SPINE GROUP ──
        const spineGroup = new THREE.Group();
        spineGroup.name = 'spine';
        spineGroup.position.y = 0.11;
        root.add(spineGroup);

        // ── TORSO ──
        const torso = buildTorso(charOpts);
        torso.position.y = 0.42;
        spineGroup.add(torso);

        // ── NECK ──
        const neckGroup = new THREE.Group();
        neckGroup.name = 'neck';
        neckGroup.position.y = 0.88;
        spineGroup.add(neckGroup);

        const neckMesh = buildNeck(charOpts);
        neckMesh.position.y = 0.11;
        neckGroup.add(neckMesh);

        // ── HEAD ──
        const headGroup = new THREE.Group();
        headGroup.name = 'head';
        headGroup.position.y = 0.22;
        neckGroup.add(headGroup);

        const head = buildHead(charOpts);
        head.position.y = 0.44;
        headGroup.add(head);

        // ── LEFT SHOULDER ──
        const lShoulderGroup = new THREE.Group();
        lShoulderGroup.name = 'lShoulder';
        lShoulderGroup.position.set(0.38, 0.82, 0);
        spineGroup.add(lShoulderGroup);

        // Shoulder ball
        const lShoulderGeo = new THREE.SphereGeometry(0.1, 14, 12);
        const lShoulderMesh = new THREE.Mesh(lShoulderGeo, clothMat(primaryColor));
        lShoulderMesh.position.set(0.09, 0, 0);
        lShoulderGroup.add(lShoulderMesh);

        const lArm = buildArm(charOpts, 1);
        lArm.name = 'lArm_container';
        lArm.position.set(0.18, 0, 0);
        lShoulderGroup.add(lArm);

        // ── RIGHT SHOULDER ──
        const rShoulderGroup = new THREE.Group();
        rShoulderGroup.name = 'rShoulder';
        rShoulderGroup.position.set(-0.38, 0.82, 0);
        spineGroup.add(rShoulderGroup);

        const rShoulderGeo = new THREE.SphereGeometry(0.1, 14, 12);
        const rShoulderMesh = new THREE.Mesh(rShoulderGeo, clothMat(primaryColor));
        rShoulderMesh.position.set(-0.09, 0, 0);
        rShoulderGroup.add(rShoulderMesh);

        const rArm = buildArm(charOpts, -1);
        rArm.name = 'rArm_container';
        rArm.position.set(-0.18, 0, 0);
        rShoulderGroup.add(rArm);

        // ── LEFT HIP / LEG ──
        const lHipGroup = new THREE.Group();
        lHipGroup.name = 'lHip';
        lHipGroup.position.set(0.155, -0.11, 0);
        root.add(lHipGroup);

        const lLeg = buildLeg(charOpts, 1);
        lHipGroup.add(lLeg);

        // ── RIGHT HIP / LEG ──
        const rHipGroup = new THREE.Group();
        rHipGroup.name = 'rHip';
        rHipGroup.position.set(-0.155, -0.11, 0);
        root.add(rHipGroup);

        const rLeg = buildLeg(charOpts, -1);
        rHipGroup.add(rLeg);

        // Position the whole character above the ground plane
        root.position.y = 1.3;

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FIND JOINT GROUP BY NAME — walks the hierarchy
    // ─────────────────────────────────────────────────────────────────────────
    function findJoint(root, name) {
        let found = null;
        root.traverse(obj => {
            if (obj.name === name && obj.isGroup) found = obj;
        });
        return found;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APPLY POSE
    // ─────────────────────────────────────────────────────────────────────────
    function applyPose(root, poseName) {
        const pose = POSES[poseName];
        if (!pose) return;
        for (const [jointName, rot] of Object.entries(pose.joints)) {
            const j = findJoint(root, jointName);
            if (!j) continue;
            if (rot.x !== undefined) j.rotation.x = rot.x;
            if (rot.y !== undefined) j.rotation.y = rot.y;
            if (rot.z !== undefined) j.rotation.z = rot.z;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESET TO A-POSE
    // ─────────────────────────────────────────────────────────────────────────
    function resetPose(root) {
        applyPose(root, 'apose');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERACTIVE JOINT CONTROLLER
    // ─────────────────────────────────────────────────────────────────────────
    function createJointController(root, renderer, camera, orbitControls) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // All meshes inside the character (for raycasting)
        const allMeshes = [];
        root.traverse(obj => {
            if (obj.isMesh) {
                obj.userData.originalMaterial = obj.material;
                allMeshes.push(obj);
            }
        });

        // Highlight material for selected joint
        const highlightMat = new THREE.MeshStandardMaterial({
            color: 0xff7700,
            emissive: 0xff4400,
            emissiveIntensity: 0.45,
            roughness: 0.5,
        });

        let selectedJoint = null;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let startRotX = 0;
        let startRotZ = 0;
        const JOINT_NAMES = Object.keys(JOINT_LIMITS);

        function getNearestJointParent(mesh) {
            let obj = mesh.parent;
            while (obj) {
                if (obj.name && JOINT_NAMES.includes(obj.name)) return obj;
                obj = obj.parent;
            }
            // Fallback: check if the mesh itself is named as a joint
            if (mesh.name && JOINT_NAMES.includes(mesh.name)) return mesh;
            return null;
        }

        function clearHighlight() {
            allMeshes.forEach(m => {
                if (m.userData.originalMaterial) {
                    m.material = m.userData.originalMaterial;
                }
            });
        }

        function highlightJoint(joint) {
            if (!joint) return;
            joint.traverse(obj => {
                if (obj.isMesh) {
                    obj.material = highlightMat;
                }
            });
        }

        function showJointInfo(name) {
            const el = document.getElementById('joint-info-label');
            if (el) {
                const labels = {
                    head: '🧠 Cabeza',
                    neck: '🔗 Cuello',
                    spine: '🦴 Columna',
                    lShoulder: '💪 Hombro Izq.',
                    rShoulder: '💪 Hombro Der.',
                    lElbow: '🦾 Codo Izq.',
                    rElbow: '🦾 Codo Der.',
                    lWrist: '✋ Muñeca Izq.',
                    rWrist: '✋ Muñeca Der.',
                    lHip: '🦵 Cadera Izq.',
                    rHip: '🦵 Cadera Der.',
                    lKnee: '🦵 Rodilla Izq.',
                    rKnee: '🦵 Rodilla Der.',
                };
                el.textContent = name ? (labels[name] || name) : '';
                el.style.display = name ? 'block' : 'none';
            }
        }

        const canvas3d = renderer.domElement;

        canvas3d.addEventListener('mousedown', onMouseDown);
        canvas3d.addEventListener('mousemove', onMouseMove);
        canvas3d.addEventListener('mouseup', onMouseUp);
        canvas3d.addEventListener('dblclick', onDblClick);

        function getMouseNDC(e) {
            const rect = canvas3d.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
            };
        }

        function onMouseDown(e) {
            if (e.button !== 0) return;
            const ndc = getMouseNDC(e);
            mouse.set(ndc.x, ndc.y);
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(allMeshes, false);
            if (hits.length > 0) {
                const joint = getNearestJointParent(hits[0].object);
                if (joint) {
                    clearHighlight();
                    selectedJoint = joint;
                    highlightJoint(joint);
                    showJointInfo(joint.name);
                    isDragging = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    startRotX = joint.rotation.x;
                    startRotZ = joint.rotation.z;
                    // Disable orbit while dragging joint
                    if (orbitControls) orbitControls.enabled = false;
                    e.stopPropagation();
                }
            } else {
                clearHighlight();
                selectedJoint = null;
                showJointInfo(null);
                if (orbitControls) orbitControls.enabled = true;
            }
        }

        function onMouseMove(e) {
            if (!isDragging || !selectedJoint) return;
            const dx = (e.clientX - dragStartX) * 0.012;
            const dy = (e.clientY - dragStartY) * 0.012;
            const jn = selectedJoint.name;
            const limits = JOINT_LIMITS[jn] || { x: [-Math.PI, Math.PI], y: [-Math.PI, Math.PI], z: [-Math.PI, Math.PI] };

            selectedJoint.rotation.x = clamp(startRotX + dy, limits.x[0], limits.x[1]);
            selectedJoint.rotation.z = clamp(startRotZ - dx, limits.z[0], limits.z[1]);
        }

        function onMouseUp() {
            isDragging = false;
            if (orbitControls) orbitControls.enabled = true;
        }

        function onDblClick(e) {
            const ndc = getMouseNDC(e);
            mouse.set(ndc.x, ndc.y);
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(allMeshes, false);
            if (hits.length > 0) {
                const joint = getNearestJointParent(hits[0].object);
                if (joint) {
                    // Reset this joint to neutral
                    joint.rotation.set(0, 0, 0);
                }
            }
        }

        // Touch support
        canvas3d.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                onMouseDown({ button: 0, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, stopPropagation: () => {} });
            }
        }, { passive: true });
        canvas3d.addEventListener('touchmove', e => {
            if (e.touches.length === 1) {
                onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
            }
        }, { passive: true });
        canvas3d.addEventListener('touchend', () => onMouseUp());

        return {
            destroy() {
                canvas3d.removeEventListener('mousedown', onMouseDown);
                canvas3d.removeEventListener('mousemove', onMouseMove);
                canvas3d.removeEventListener('mouseup', onMouseUp);
                canvas3d.removeEventListener('dblclick', onDblClick);
            },
            applyPose(poseName) { applyPose(root, poseName); },
            resetPose() { resetPose(root); },
            getSelectedJoint() { return selectedJoint; }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────
    return {
        build,
        applyPose,
        resetPose,
        findJoint,
        createJointController,
        POSES,
        JOINT_LIMITS,
    };
})();

// Make available globally
window.RealisticCharacter = RealisticCharacter;
