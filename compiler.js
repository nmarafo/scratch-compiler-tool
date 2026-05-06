/**
 * Scratch Compiler Tool Logic
 * Mapping NotebookLM JSON to Scratch 3.0 (.sb3)
 * @author nmarafo
 * @license Apache-2.0
 */

const Console = {
    el: document.getElementById('console'),
    log(msg, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `> ${msg}`;
        this.el.appendChild(line);
        this.el.scrollTop = this.el.scrollHeight;
    },
    clear() {
        this.el.innerHTML = '';
    }
};

const SCRATCH_TEMPLATE = {
    targets: [
        {
            isStage: true,
            name: "Stage",
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
                {
                    name: "backdrop1",
                    dataFormat: "svg",
                    assetId: "cd21514d0531fdffb22204e0ec5ed84a",
                    md5ext: "cd21514d0531fdffb22204e0ec5ed84a.svg",
                    rotationCenterX: 240,
                    rotationCenterY: 180
                }
            ],
            sounds: [],
            volume: 100,
            layerOrder: 0
        }
    ],
    monitors: [],
    extensions: [],
    meta: {
        semver: "3.0.0",
        vm: "0.2.0-prerelease.20190102210314",
        agent: "Scratch Compiler Tool v1.0"
    }
};

function generateId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
}

class ScratchCompiler {
    constructor() {
        this.zip = new JSZip();
        this.assets = [
            'cd21514d0531fdffb22204e0ec5ed84a.svg',
            'bcf454acf82e4504149f7ffe07081dbc.svg',
            '0fb9be3e8397c983338cb71dc84d0b25.svg',
            '83a9787d4cb6f3b7632b4ddfebf74367.wav',
            '83c36d806dc92327b9e7049a565c6bff.wav'
        ];
    }

    async fetchAsset(name) {
        try {
            const response = await fetch(`assets/${name}`);
            if (!response.ok) throw new Error(`Could not fetch ${name}`);
            return await response.blob();
        } catch (e) {
            Console.log(`Error cargando recurso: ${name}`, 'error');
            return null;
        }
    }

    mapActionToBlock(action, nextId, parentId) {
        const id = generateId();
        let block = {
            opcode: "",
            next: nextId,
            parent: parentId,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: !parentId
        };

        switch (action.type) {
            case 'move':
                if (action.x !== undefined || action.y !== undefined) {
                    block.opcode = "motion_gotoxy";
                    block.inputs.X = [1, [4, (action.x || 0).toString()]];
                    block.inputs.Y = [1, [4, (action.y || 0).toString()]];
                } else {
                    block.opcode = "motion_movesteps";
                    block.inputs.STEPS = [1, [4, (action.steps || 10).toString()]];
                }
                break;
            case 'say':
                block.opcode = "looks_say";
                block.inputs.MESSAGE = [1, [10, (action.text || "").toString()]];
                break;
            case 'wait':
                block.opcode = "control_wait";
                const dur = action.seconds || action.duration || 1;
                block.inputs.DURATION = [1, [5, dur.toString()]];
                break;
            case 'start':
                block.opcode = "event_whenflagclicked";
                block.x = 100;
                block.y = 100;
                break;
            default:
                return null;
        }
        return { id, block };
    }

    compile(inputJson) {
        Console.log("Iniciando compilación...");
        const project = JSON.parse(JSON.stringify(SCRATCH_TEMPLATE));
        
        // Add default Sprite
        const sprite = {
            isStage: false,
            name: "Sprite1",
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
                {
                    name: "costume1",
                    bitmapResolution: 1,
                    dataFormat: "svg",
                    assetId: "bcf454acf82e4504149f7ffe07081dbc",
                    md5ext: "bcf454acf82e4504149f7ffe07081dbc.svg",
                    rotationCenterX: 48,
                    rotationCenterY: 50
                }
            ],
            sounds: [],
            volume: 100,
            layerOrder: 1,
            visible: true,
            x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: "all around"
        };

        // Map NotebookLM Actions to Blocks
        if (inputJson.actions && Array.isArray(inputJson.actions)) {
            let lastId = null;
            // Reverse to link blocks correctly (next)
            const actions = [...inputJson.actions].reverse();
            
            for (const action of actions) {
                const result = this.mapActionToBlock(action, lastId, null);
                if (result) {
                    sprite.blocks[result.id] = result.block;
                    // Fix parents in next pass or link them now
                    if (lastId) {
                        sprite.blocks[lastId].parent = result.id;
                    }
                    lastId = result.id;
                }
            }
        }

        project.targets.push(sprite);
        return project;
    }

    async fetchExternalAsset(url) {
        try {
            Console.log(`Descargando recurso externo: ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error al descargar ${url}`);
            return await response.blob();
        } catch (e) {
            Console.log(`Error con recurso externo: ${url}. Usando predeterminado.`, 'error');
            return null;
        }
    }

    async generateSb3(inputJson) {
        try {
            Console.log("Iniciando compilación...");
            const projectJson = JSON.parse(JSON.stringify(SCRATCH_TEMPLATE));
            
            // Add Sprite
            const sprite = {
                isStage: false,
                name: "Sprite1",
                variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                currentCostume: 0,
                costumes: [],
                sounds: [],
                volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: "all around"
            };

            // Handle Costumes (Internal or External)
            if (inputJson.costumes && Array.isArray(inputJson.costumes)) {
                for (let cost of inputJson.costumes) {
                    let blob = null;
                    let fileName = "";
                    let assetId = "";
                    let costumeName = "";

                    // Support both string ["name"] and object [{name, url}]
                    if (typeof cost === 'string') {
                        costumeName = cost;
                    } else {
                        costumeName = cost.name || "costume";
                        if (cost.url) {
                            blob = await this.fetchExternalAsset(cost.url);
                            assetId = generateId();
                            const ext = cost.url.split('.').pop().split('?')[0] || 'png';
                            fileName = `${assetId}.${ext}`;
                        }
                    }

                    if (blob) {
                        this.zip.file(fileName, blob);
                        sprite.costumes.push({
                            name: costumeName,
                            bitmapResolution: 1,
                            dataFormat: fileName.split('.').pop(),
                            assetId: assetId,
                            md5ext: fileName,
                            rotationCenterX: 50,
                            rotationCenterY: 50
                        });
                    } else if (typeof cost === 'string' || (cost && !cost.url)) {
                        // Use default asset if no URL or just a name
                        const defaultId = "bcf454acf82e4504149f7ffe07081dbc";
                        const defaultBlob = await this.fetchAsset(`${defaultId}.svg`);
                        if (defaultBlob) {
                            this.zip.file(`${defaultId}.svg`, defaultBlob);
                            sprite.costumes.push({
                                name: costumeName,
                                bitmapResolution: 1,
                                dataFormat: "svg",
                                assetId: defaultId,
                                md5ext: `${defaultId}.svg`,
                                rotationCenterX: 48,
                                rotationCenterY: 50
                            });
                        }
                    }
                }
            }

            // If no costumes were added, add default
            if (sprite.costumes.length === 0) {
                const defaultBlob = await this.fetchAsset('bcf454acf82e4504149f7ffe07081dbc.svg');
                if (defaultBlob) {
                    this.zip.file('bcf454acf82e4504149f7ffe07081dbc.svg', defaultBlob);
                    sprite.costumes.push({
                        name: "costume1",
                        bitmapResolution: 1,
                        dataFormat: "svg",
                        assetId: "bcf454acf82e4504149f7ffe07081dbc",
                        md5ext: "bcf454acf82e4504149f7ffe07081dbc.svg",
                        rotationCenterX: 48,
                        rotationCenterY: 50
                    });
                }
            }

            // Map Blocks
            if (inputJson.actions && Array.isArray(inputJson.actions)) {
                let lastId = null;
                const actions = [...inputJson.actions].reverse();
                for (const action of actions) {
                    const result = this.mapActionToBlock(action, lastId, null);
                    if (result) {
                        sprite.blocks[result.id] = result.block;
                        if (lastId) sprite.blocks[lastId].parent = result.id;
                        lastId = result.id;
                    }
                }
            }

            projectJson.targets.push(sprite);
            this.zip.file("project.json", JSON.stringify(projectJson));

            // Add other base assets (Stage, etc.)
            for (const assetName of this.assets) {
                if (assetName.startsWith('cd21514')) { // Backdrop
                    const blob = await this.fetchAsset(assetName);
                    if (blob) this.zip.file(assetName, blob);
                }
            }

            Console.log("Generando archivo .sb3...");
            const content = await this.zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${inputJson.name || 'proyecto'}.sb3`;
            a.click();
            Console.log("¡Compilación exitosa!", "success");
        } catch (e) {
            Console.log(`Error: ${e.message}`, "error");
            console.error(e);
        }
    }
}

const compiler = new ScratchCompiler();

document.getElementById('compile-btn').addEventListener('click', async () => {
    const input = document.getElementById('json-input').value;
    if (!input) {
        Console.log("Por favor, introduce un JSON válido.", "error");
        return;
    }

    try {
        const json = JSON.parse(input);
        await compiler.generateSb3(json);
    } catch (e) {
        Console.log("Error de formato en el JSON: " + e.message, "error");
    }
});

document.getElementById('load-example').addEventListener('click', () => {
    const example = {
        name: "Galdós en Scratch",
        costumes: [
            { 
                name: "Benito Pérez Galdós", 
                url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Benito_P%C3%A9rez_Gald%C3%B3s_por_Sorolla.jpg/220px-Benito_P%C3%A9rez_Gald%C3%B3s_por_Sorolla.jpg" 
            }
        ],
        actions: [
            { type: "start" },
            { type: "say", text: "¡Bienvenidos a la Gran Canaria de Galdós!" },
            { type: "wait", seconds: 2 },
            { type: "say", text: "Soy Benito Pérez Galdós, y hoy exploraremos mi historia." }
        ]
    };
    document.getElementById('json-input').value = JSON.stringify(example, null, 2);
    Console.log("Ejemplo con imagen externa cargado.");
});

// Modal Logic
const modal = document.getElementById('guide-modal');
const openBtn = document.getElementById('open-guide');
const closeBtn = document.getElementById('close-guide');

openBtn.onclick = () => modal.style.display = 'flex';
closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

// Quick Copy Master Prompt
document.getElementById('copy-master-quick').onclick = function() {
    copyText('master-prompt-text', this);
};

function copyText(elementId, btn) {
    const text = document.getElementById(elementId).textContent.trim();
    navigator.clipboard.writeText(text);
    Console.log("Texto copiado al portapapeles.", "success");
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" size="14"></i> Copiado';
    lucide.createIcons();
    setTimeout(() => {
        btn.innerHTML = originalText;
        lucide.createIcons();
    }, 2000);
}
window.copyText = copyText;
