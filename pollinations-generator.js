/**
 * pollinations-generator.js
 * Pollinations.ai integration for Assets_Maker.AI
 *
 * Why Pollinations (HuggingFace was removed — its free image-generation
 * tier became unreliable/discontinued for this use case):
 *  - No API key / no secret required for the anonymous tier, so nothing to
 *    leak in client-side code. Auth is just a "referrer" hint, which is
 *    public by design.
 *  - One simple GET request returns the image directly — no separate
 *    "which provider serves this model" lookup needed.
 *
 * Trade-offs to keep in mind:
 *  - Anonymous tier is rate-limited to ~1 request every 15 seconds, and may
 *    stamp a small watermark on the image (register at auth.pollinations.ai
 *    and pass a token to lift both limits — out of scope for this client-only
 *    integration, see the note in generate()).
 *  - There's no documented negative_prompt parameter, so negativePrompt is
 *    folded into the main prompt as an "avoid:" hint instead of a real
 *    negative-prompt conditioning pass.
 */

const PollinationsGenerator = (() => {
    const BASE_URL = 'https://image.pollinations.ai/prompt/';

    // Pollinations model catalogue changes over time; these two are the
    // long-standing general-purpose options. 'flux' = best quality,
    // 'turbo' = faster, both fine for game-asset-sized images.
    const STYLE_MODEL_MAP = {
        pixel: 'turbo',
        vector: 'flux',
        cartoon: 'flux',
        realistic: 'flux',
        voxel: 'turbo',
    };

    const STYLE_PROMPT_SUFFIX = {
        pixel: ', pixel art, 8-bit, retro game sprite, flat colors, pixel perfect, game asset, transparent background',
        vector: ', vector art, clean lines, flat design, SVG style, sharp edges, minimalist, game icon',
        cartoon: ', cartoon style, cel shaded, vibrant colors, thick outlines, animated series style, expressive',
        realistic: ', highly detailed, photorealistic, cinematic lighting, 8k, ray tracing, physically based rendering, professional render',
        voxel: ', voxel art, isometric, 3D pixel, low poly, minecraft style, cuboid, game asset',
    };

    // Rough hex -> descriptive color name mapping so the prompt reads
    // naturally ("solid white background") instead of a raw hex code, which
    // diffusion models tend to ignore or misinterpret.
    function describeHexColor(hex) {
        if (!hex) return 'white';
        const h = hex.replace('#', '').toLowerCase();
        const map = {
            ffffff: 'pure white', '000000': 'pure black',
            '00ff00': 'chroma key green', '0f0': 'chroma key green',
            ff00ff: 'chroma key magenta', f0f: 'chroma key magenta',
            '00ffff': 'cyan',
        };
        if (map[h]) return map[h];
        // Fallback: parse RGB and describe roughly
        const r = parseInt(h.substring(0, 2), 16) || 0;
        const g = parseInt(h.substring(2, 4), 16) || 0;
        const b = parseInt(h.substring(4, 6), 16) || 0;
        if (r > 235 && g > 235 && b > 235) return 'pure white';
        if (r < 20 && g < 20 && b < 20) return 'pure black';
        return `solid flat color (RGB ${r},${g},${b})`;
    }

    // Item prompts trip up diffusion models more than characters do:
    // duplicated parts, a floating disembodied hand "holding" the item,
    // off-center/angled poses instead of a clean icon view, fused or
    // asymmetrical shapes. We add targeted boosters/negatives per item
    // CATEGORY rather than one generic "weapon" bucket — mixing categories
    // is what caused a bug where asking for "escudo" (shield) started
    const ITEM_CATEGORIES = [
        // ── Weapons ────────────────────────────────────────────────────────────
        {
            name: 'blade',
            keywords: ['espada', 'sable', 'katana', 'daga', 'puñal', 'cuchillo', 'machete', 'navaja',
                       'sword', 'dagger', 'blade', 'knife'],
            positive: ', single bladed weapon, one blade only, clean side profile icon view, symmetrical blade, sharp clean silhouette, no hand, no fingers, not held, floating in place, game inventory icon, weapon asset',
            negative: 'duplicate blade, two swords, extra blade, fused blade, floating fingers, holding hand, asymmetrical blade, warped blade, bent blade',
        },
        {
            name: 'polearmOrBlunt',
            keywords: ['lanza', 'hacha', 'maza', 'martillo de guerra', 'bastón', 'vara',
                       'axe', 'spear', 'mace', 'warhammer', 'staff', 'wand'],
            positive: ', single weapon, one item only, clean side profile icon view, symmetrical design, sharp clean silhouette, no hand, no fingers, game inventory icon, weapon asset',
            negative: 'duplicate weapon, two weapons, fused parts, floating fingers, holding hand, asymmetrical',
        },
        {
            name: 'ranged',
            keywords: ['arco', 'ballesta', 'pistola', 'rifle', 'escopeta',
                       'bow', 'crossbow', 'gun', 'pistol', 'rifle'],
            positive: ', single ranged weapon, one item only, clean side profile icon view, symmetrical design, sharp clean silhouette, no hand, no fingers, game inventory icon',
            negative: 'duplicate weapon, two weapons, floating fingers, holding hand, asymmetrical',
        },
        {
            name: 'shield',
            keywords: ['escudo', 'shield'],
            positive: ', single shield, one item only, front view, symmetrical design, clean silhouette, no hand, not held, game inventory icon, shield icon',
            negative: 'duplicate shield, two shields, floating fingers, holding hand, asymmetrical',
        },
        // ── Armor / Wearables ───────────────────────────────────────────────────
        {
            name: 'helmet',
            keywords: ['casco', 'yelmo', 'coraza', 'helmet', 'helm', 'armor', 'armadura'],
            positive: ', game armor piece, single item, clean front view, symmetrical, highly detailed, metallic sheen, rune engravings, RPG game asset, inventory icon',
            negative: 'person wearing it, character, body, asymmetrical, broken, missing pieces',
        },
        // ── Items / Consumables ─────────────────────────────────────────────────
        {
            name: 'potion',
            keywords: ['pocion', 'potion', 'elixir', 'frasco', 'botella', 'flask', 'vial', 'brebaje'],
            positive: ', glass potion bottle, single item, glowing liquid, detailed glass material, alchemical flask, RPG game asset, inventory icon, centered, floating',
            negative: 'character, hand, person, multiple bottles, duplicated',
        },
        {
            name: 'chest',
            keywords: ['cofre', 'chest', 'tesoro', 'treasure', 'baul'],
            positive: ', treasure chest, single item, 3/4 isometric view, detailed wood and metal, glowing gems, RPG game asset, dungeon loot, centered',
            negative: 'open flat, person, character, multiple chests',
        },
        {
            name: 'food',
            keywords: ['comida', 'food', 'manzana', 'apple', 'pan', 'bread', 'carne', 'meat',
                       'fruta', 'fruit', 'baya', 'berry', 'pez', 'fish', 'pastel', 'cake',
                       'queso', 'cheese', 'zanahoria', 'carrot', 'calabaza', 'pumpkin', 'maiz', 'corn'],
            positive: ', single food item, clean view from above, game asset icon, juicy and appetizing, warm colors, highly detailed, RPG game food item, isolated, centered',
            negative: 'character, hand, plate with multiple foods, person eating, restaurant scene',
        },
        {
            name: 'coin',
            keywords: ['moneda', 'coin', 'dinero', 'money', 'bolsa de oro', 'bag of gold'],
            positive: ', golden coin or coin bag, single item, top-down or 3/4 view, metallic gold, inscriptions, RPG game asset, inventory icon, shiny',
            negative: 'person, hand, wallet, credit card, many scattered coins',
        },
        {
            name: 'scroll',
            keywords: ['pergamino', 'scroll', 'libro', 'book', 'tomo', 'grimoire', 'spellbook'],
            positive: ', magical scroll or ancient book, single item, 3/4 view, worn parchment, rune text, glowing arcane symbols, RPG game asset, inventory icon',
            negative: 'person reading, hand holding, modern book, flat magazine',
        },
        {
            name: 'key',
            keywords: ['llave', 'key'],
            positive: ', ornate fantasy key, single item, side view, detailed metalwork, old-fashioned, glowing gem in handle, RPG game asset, inventory icon',
            negative: 'modern key, car key, person holding, duplicate keys',
        },
        {
            name: 'ring',
            keywords: ['anillo', 'ring', 'alianza', 'joya', 'gema', 'amuleto', 'amulet'],
            positive: ', single fantasy ring or amulet, top-down view, glowing gemstone, detailed metalwork, RPG magic item, inventory icon, centered',
            negative: 'person wearing ring, hand, duplicate rings, necklace with chain',
        },
        // ── Environment / World ─────────────────────────────────────────────────
        {
            name: 'street',
            keywords: ['calle', 'road', 'camino', 'sendero', 'path', 'acera', 'avenida',
                       'carretera', 'autopista', 'highway', 'street', 'adoquin', 'cobblestone',
                       'asfalto', 'asphalt', 'calzada', 'piso', 'baldosa', 'vereda'],
            positive: ', isometric street tile, cobblestone or asphalt road, slight top-down isometric perspective, detailed pavement texture, sidewalk edges, road markings, 3D isometric tile, game environment tile, RPG world map asset',
            negative: 'car, vehicle, person, building, character, aerial satellite photo, modern city skyline',
        },
        {
            name: 'bridge',
            keywords: ['puente', 'bridge', 'pasarela', 'viaducto'],
            positive: ', fantasy stone or wood bridge, isometric 3/4 view, arched underside, stone bricks, wooden planks, railing, river below with water reflections, RPG game world asset, detailed environment prop',
            negative: 'modern concrete highway bridge, character, person, vehicle on bridge, aerial view',
        },
        {
            name: 'water',
            keywords: ['lago', 'lake', 'rio', 'river', 'cascada', 'waterfall', 'fuente', 'fountain',
                       'estanque', 'pond', 'agua', 'water', 'piscina', 'pool', 'ocean', 'pantano', 'swamp'],
            positive: ', isometric water tile, crystal clear blue water, animated ripple effect, lily pads, light reflections, detailed caustics, RPG game world tile, top-down isometric perspective',
            negative: 'person swimming, boat, fish closeup, underwater scene, ocean from above satellite',
        },
        {
            name: 'house',
            keywords: ['casa', 'house', 'cabaña', 'cabin', 'choza', 'hut', 'hogar',
                       'cottage', 'chalé', 'bungalow', 'vivienda'],
            positive: ', cozy fantasy cottage or house, isometric 3D view, pitched thatched or tiled roof, stone walls, wooden door, glowing warm windows, chimney with smoke, flower garden, fence, detailed RPG game world building, exterior view',
            negative: 'interior only, person inside, top-down floor plan, modern building, skyscraper, apartment',
        },
        {
            name: 'farm',
            keywords: ['granja', 'farm', 'establo', 'barn', 'molino', 'windmill', 'silo', 'corral', 'rancho'],
            positive: ', fantasy farm building, isometric 3/4 view, red barn or windmill, wooden planks, hay bales, farm animals nearby, crop field, weathervane, detailed RPG game world asset',
            negative: 'interior of barn, person, flat top-down, modern industrial farm',
        },
        {
            name: 'shop',
            keywords: ['tienda', 'shop', 'taverna', 'taberna', 'posada', 'inn',
                       'mercado', 'market', 'comercio', 'herrero', 'blacksmith'],
            positive: ', medieval fantasy shop or tavern, isometric 3/4 view, colourful awning canopy, hanging wooden sign with symbol, goods displayed in window, stone and timber facade, lantern light, detailed RPG game world building',
            negative: 'modern store, interior only, person inside, flat top-down blueprint',
        },
        {
            name: 'church',
            keywords: ['iglesia', 'church', 'catedral', 'cathedral', 'templo', 'temple',
                       'shrine', 'capilla', 'chapel', 'santuario', 'monastery'],
            positive: ', fantasy medieval church or temple, isometric 3D view, tall steeple or bell tower, arched stained glass windows glowing, stone walls, cross or arcane symbol on top, detailed RPG game world building',
            negative: 'interior only, ruins, modern church, person inside, flat top-down',
        },
        {
            name: 'tower',
            keywords: ['torre', 'tower', 'castillo', 'castle', 'fortaleza', 'fortress',
                       'ciudadela', 'citadel', 'palacio', 'palace', 'muralla', 'wall'],
            positive: ', fantasy castle or medieval tower, isometric 3D view, stone battlements, iron gate, arrow slits, flags flying from ramparts, detailed stonework, moat or cliff edge, dramatic RPG game world building',
            negative: 'interior only, modern skyscraper, person, flat top-down',
        },
        {
            name: 'cave',
            keywords: ['mina', 'mine', 'cueva', 'cave', 'gruta', 'grotto', 'mazmorra', 'dungeon'],
            positive: ', fantasy cave or dungeon entrance, isometric 3D view, jagged dark rock formations, glowing crystals inside, stalactites hanging, wooden mine supports, eerie ambient light, detailed RPG dungeon tile',
            negative: 'person inside, character, modern tunnel, flat top-down',
        },
        // ── Characters / Creatures ──────────────────────────────────────────────
        {
            name: 'character_hero',
            keywords: ['guerrero', 'warrior', 'heroe', 'mago', 'mage', 'wizard',
                       'ladron', 'rogue', 'arquero', 'archer', 'paladin', 'caballero', 'knight'],
            positive: ', single RPG fantasy character, full body portrait, detailed armor or robes, heroic pose, dynamic lighting, front-facing or 3/4 view, game character sprite, highly detailed face and clothing, no background',
            negative: 'group of characters, multiple figures, crowd, faceless, blob',
        },
        {
            name: 'character_creature',
            keywords: ['goblin', 'dragon', 'orco', 'orc', 'esqueleto', 'skeleton',
                       'lobo', 'wolf', 'araña', 'spider', 'slime', 'fantasma', 'ghost', 'boss'],
            positive: ', single RPG fantasy creature or monster, full body view, detailed anatomy, fierce expression or pose, dynamic lighting, game enemy sprite, highly detailed, isolated',
            negative: 'group, multiple monsters, landscape, background elements',
        },
        // ── Nature / Props ──────────────────────────────────────────────────────
        {
            name: 'tree',
            keywords: ['árbol', 'arbol', 'tree', 'bosque', 'forest', 'planta', 'plant',
                       'flor', 'flower', 'hongo', 'mushroom', 'arbusto', 'bush'],
            positive: ', single fantasy tree or plant, isometric 3D view, lush foliage, detailed bark or petals, glowing magical elements, centered, RPG world environment prop, isolated on background',
            negative: 'person, character, full forest panorama, flat sprite',
        },
        {
            name: 'vehicle',
            keywords: ['carro', 'auto', 'coche', 'car', 'barco', 'boat', 'buque', 'ship',
                       'carreta', 'cart', 'barca', 'canoa', 'canoe', 'velero'],
            positive: ', fantasy vehicle, isometric 3D view, detailed wood planks or metal, sails or wheels, worn and adventurous, RPG game world prop, centered on white background',
            negative: 'modern car, person riding, aerial view from above, flat top-down',
        },
        {
            name: 'ui_icon',
            keywords: ['icono', 'icon', 'boton', 'button', 'ui', 'hud', 'badge',
                       'insignia', 'medal', 'medalla', 'logo', 'interfaz'],
            positive: ', clean game UI icon, flat vector or slightly 3D raised button, glowing border, RPG game HUD element, vibrant color scheme, centered, simple bold design, icon badge',
            negative: 'character, landscape, complex scene, multiple elements, cluttered',
        },
    ];

    function detectItemCategory(userPrompt) {
        const p = userPrompt.toLowerCase();
        return ITEM_CATEGORIES.find(cat => cat.keywords.some(kw => p.includes(kw))) || null;
    }

    // Detect the best viewing angle for the asset type
    function detectComposition(userPrompt) {
        const p = userPrompt.toLowerCase();
        if (['calle','road','camino','street','tile','terreno','suelo','ground','piso','baldosa','lago','lake','rio','river','agua','water'].some(kw => p.includes(kw))) {
            return 'isometric top-down view, 45 degree angle isometric perspective';
        }
        if (['casa','house','cabaña','cabin','tienda','shop','taverna','iglesia','church','torre','tower','castillo','castle','granja','farm','puente','bridge'].some(kw => p.includes(kw))) {
            return 'isometric 3/4 view, slightly elevated perspective showing front and one side of the building';
        }
        if (['espada','sword','arma','weapon','escudo','shield','hacha','axe','lanza','spear','baston','staff'].some(kw => p.includes(kw))) {
            return 'clean side profile view, centered in frame';
        }
        if (['personaje','character','guerrero','warrior','mago','mage','criatura','creature','goblin','dragon'].some(kw => p.includes(kw))) {
            return 'full body front view or 3/4 view, centered';
        }
        return 'centered composition';
    }

    function buildPrompt(userPrompt, style, negativePrompt, bgColor) {
        const styleTag = STYLE_PROMPT_SUFFIX[style] || STYLE_PROMPT_SUFFIX.realistic;
        const bgDescription = bgColor ? describeHexColor(bgColor) : 'plain';
        const itemCategory = detectItemCategory(userPrompt);
        const composition = detectComposition(userPrompt);
        const backdropPhrase = (bgColor && (bgDescription.includes('chroma key') || bgDescription === 'pure white'))
            ? `shot in front of a professional ${bgDescription} screen studio backdrop (like a television green screen), the backdrop itself is a separate evenly and brightly lit flat surface completely unaffected by the subject's own lighting, mood, or shadows`
            : `isolated on a single solid ${bgDescription} background, flat uniform background color`;
        let enhanced = `${userPrompt}, ${composition}, game asset, high detail${styleTag}${itemCategory ? itemCategory.positive : ', RPG game asset, detailed, centered, high quality render'}, ${backdropPhrase}, no gradient on backdrop, no shadow on backdrop, no vignette, no texture on background`;
        const combinedNegative = itemCategory
            ? (negativePrompt ? `${itemCategory.negative}, ${negativePrompt}` : itemCategory.negative)
            : negativePrompt;
        if (combinedNegative) {
            enhanced += `, avoid: ${combinedNegative}`;
        }
        return enhanced;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate an image via Pollinations.
     * Returns { dataUrl, modelUsed } on success, throws on failure.
     * onProgress(percent, statusText) is called during the attempt.
     */
    async function generate({ prompt, style = 'realistic', negativePrompt = '', width = 512, height = 512, seed = null, bgColor = null, onProgress = null }) {
        const model = STYLE_MODEL_MAP[style] || 'flux';
        const enhancedPrompt = buildPrompt(prompt, style, negativePrompt, bgColor);

        const params = new URLSearchParams({
            model,
            width: String(Math.min(Math.max(width, 256), 1024)),
            height: String(Math.min(Math.max(height, 256), 1024)),
            nologo: 'true',
            safe: 'true',
            // Public-by-design app identifier — not a secret, safe to leave in client code.
            referrer: (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'assets-maker-ai'
        });
        if (seed !== null && seed !== undefined) params.set('seed', String(seed));

        const url = `${BASE_URL}${encodeURIComponent(enhancedPrompt)}?${params.toString()}`;

        // The anonymous tier allows roughly 1 request/15s. If we get rate
        // limited (429) we back off and retry a couple of times rather than
        // failing immediately.
        const maxAttempts = 3;
        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (onProgress) onProgress(15 + attempt * 25, attempt === 0 ? 'Enviando prompt a Pollinations...' : `Reintentando (${attempt + 1}/${maxAttempts})...`);

            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(60000) });

                if (response.status === 429) {
                    lastError = new Error('Límite de velocidad (429): la capa gratuita anónima permite ~1 solicitud cada 15s.');
                    if (onProgress) onProgress(30 + attempt * 20, 'Límite de velocidad, esperando 15s...');
                    await sleep(15000);
                    continue;
                }

                if (!response.ok) {
                    const bodyText = await response.text().catch(() => '');
                    throw new Error(`Pollinations error ${response.status}: ${bodyText.slice(0, 200)}`);
                }

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) {
                    throw new Error(`Respuesta no es una imagen: ${contentType}`);
                }

                const blob = await response.blob();
                const dataUrl = await blobToDataUrl(blob);

                if (onProgress) onProgress(100, '¡Imagen generada con éxito!');
                return { dataUrl, modelUsed: `pollinations/${model}` };

            } catch (err) {
                lastError = err;
                if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                    lastError = new Error('Tiempo de espera agotado contactando Pollinations.');
                }
                // Network/CORS failures won't benefit from retrying immediately
                if (!String(lastError.message).includes('429')) break;
            }
        }

        throw lastError || new Error('Pollinations falló sin detalle de error');
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    return { generate };
})();

// Make globally available
window.PollinationsGenerator = PollinationsGenerator;
