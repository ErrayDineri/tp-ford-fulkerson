// Game state
let currentLevel = null;
let levelData = null;
let flows = {};
let nodePositions = {};
let animationFrame = null;
let flowAnimations = {};

// Canvas setup
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

// Animation particles for flow visualization
class FlowParticle {
    constructor(startX, startY, endX, endY, color = '#667eea') {
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;
        this.controlX = (startX + endX) / 2;
        this.controlY = (startY + endY) / 2;
        this.x = startX;
        this.y = startY;
        this.progress = Math.random();
        this.speed = 0.008 + Math.random() * 0.006;
        this.color = color;
        this.size = 5;
    }
    
    update() {
        this.progress += this.speed;
        if (this.progress >= 1) {
            this.progress = 0;
        }
        // Follow quadratic bezier curve
        const t = this.progress;
        this.x = (1-t)*(1-t)*this.startX + 2*(1-t)*t*this.controlX + t*t*this.endX;
        this.y = (1-t)*(1-t)*this.startY + 2*(1-t)*t*this.controlY + t*t*this.endY;
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// DOM elements
const levelSelectDiv = document.getElementById('level-select');
const gameAreaDiv = document.getElementById('game-area');
const levelBtns = document.querySelectorAll('.level-btn');
const verifyBtn = document.getElementById('verify-btn');
const hintBtn = document.getElementById('hint-btn');
const backBtn = document.getElementById('back-btn');

// Event listeners
levelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const levelId = parseInt(btn.dataset.level);
        loadLevel(levelId);
    });
});

verifyBtn.addEventListener('click', verifyFlow);
hintBtn.addEventListener('click', getHint);
backBtn.addEventListener('click', backToLevels);

// Resize canvas when window resizes
window.addEventListener('resize', () => {
    if (currentLevel) {
        calculateNodePositions();
        drawGraph();
    }
});

// Animation loop
function animate() {
    if (currentLevel && levelData) {
        drawGraph();
        
        // Draw animated particles
        for (let flowId in flowAnimations) {
            const particles = flowAnimations[flowId];
            particles.forEach(particle => {
                particle.update();
                particle.draw(ctx);
            });
        }
    }
    animationFrame = requestAnimationFrame(animate);
}

// Start animation loop when game loads
function startAnimation() {
    if (!animationFrame) {
        animate();
    }
}

function stopAnimation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

async function loadLevel(levelId) {
    try {
        const response = await fetch(`/api/level/${levelId}`);
        levelData = await response.json();
        currentLevel = levelId;

        // Update UI
        document.getElementById('level-title').textContent = levelData.name;
        document.getElementById('level-description').textContent = levelData.description;
        
        // Update progress
        const progress = (levelId / 5) * 100;
        document.getElementById('level-progress').style.width = progress + '%';
        document.getElementById('level-counter').textContent = `Level ${levelId} / 5`;

        // Initialize flows
        flows = {};
        flowAnimations = {};
        levelData.edges.forEach((edge, index) => {
            flows[`${edge.from}-${edge.to}`] = 0;
        });

        // Show game area FIRST so container has proper dimensions
        levelSelectDiv.style.display = 'none';
        gameAreaDiv.style.display = 'block';

        // Create flow controls
        createFlowControls();

        // Use requestAnimationFrame to ensure DOM is updated before measuring
        requestAnimationFrame(() => {
            // Calculate node positions (needs container to be visible)
            calculateNodePositions();
            
            // Draw graph
            drawGraph();
            
            // Start animation
            startAnimation();
        });

        // Clear status message
        clearStatusMessage();

    } catch (error) {
        console.error('Error loading level:', error);
    }
}

function calculateNodePositions() {
    const container = document.querySelector('.graph-container');
    
    // Get the actual container width
    const containerRect = container.getBoundingClientRect();
    const width = Math.floor(containerRect.width) - 40;
    const height = 400;
    
    canvas.width = width;
    canvas.height = height;
    
    // Padding for node positioning
    const paddingX = 100;
    const paddingY = 80;
    const availableWidth = width - 2 * paddingX;
    const availableHeight = height - 2 * paddingY;

    nodePositions = {};

    const numNodes = levelData.nodes;
    
    // Use BFS-based layer assignment
    const layers = assignLayers();
    const nodesPerLayer = {};
    const nodesByLayer = {};

    // Count nodes per layer and group them
    for (let i = 0; i < numNodes; i++) {
        const layer = layers[i];
        nodesPerLayer[layer] = (nodesPerLayer[layer] || 0) + 1;
        if (!nodesByLayer[layer]) nodesByLayer[layer] = [];
        nodesByLayer[layer].push(i);
    }

    const layerNumbers = Object.keys(nodesPerLayer).map(Number).sort((a, b) => a - b);
    const numLayers = layerNumbers.length;
    
    // Position nodes layer by layer
    layerNumbers.forEach((layer, layerIndex) => {
        const nodesInLayer = nodesByLayer[layer] || [];
        const layerCount = nodesInLayer.length;
        
        // X position: spread layers evenly across the width
        let xPos;
        if (numLayers === 1) {
            xPos = width / 2;
        } else {
            xPos = paddingX + (layerIndex / (numLayers - 1)) * availableWidth;
        }
        
        // Y positions: center nodes vertically
        nodesInLayer.forEach((nodeId, idx) => {
            let yPos;
            if (layerCount === 1) {
                yPos = height / 2;
            } else {
                yPos = paddingY + (idx / (layerCount - 1)) * availableHeight;
            }
            nodePositions[nodeId] = { x: xPos, y: yPos };
        });
    });
}

function assignLayers() {
    const layers = {};
    const visited = new Set();
    const queue = [levelData.source];
    layers[levelData.source] = 0;
    visited.add(levelData.source);

    // BFS to assign layers
    while (queue.length > 0) {
        const u = queue.shift();
        for (const edge of levelData.edges) {
            if (edge.from === u && !visited.has(edge.to)) {
                visited.add(edge.to);
                layers[edge.to] = (layers[u] || 0) + 1;
                queue.push(edge.to);
            }
        }
    }

    // Assign default layer to unvisited nodes
    const maxLayerValue = Object.keys(layers).length > 0 ? Math.max(...Object.values(layers)) : 0;
    for (let i = 0; i < levelData.nodes; i++) {
        if (layers[i] === undefined) {
            layers[i] = maxLayerValue + 1;
        }
    }
    
    // Ensure sink is in the last layer
    const finalMaxLayer = Math.max(...Object.values(layers));
    if (layers[levelData.sink] !== finalMaxLayer) {
        layers[levelData.sink] = finalMaxLayer;
    }

    return layers;
}

function drawGraph() {
    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // Draw edges
    levelData.edges.forEach(edge => {
        drawEdge(edge);
    });

    // Draw nodes
    for (let i = 0; i < levelData.nodes; i++) {
        drawNode(i);
    }
}

function drawEdge(edge) {
    const from = nodePositions[edge.from];
    const to = nodePositions[edge.to];
    const flowValue = flows[`${edge.from}-${edge.to}`] || 0;
    const nodeRadius = 28;
    
    // Check if there's a reverse edge (bidirectional)
    const hasReverseEdge = levelData.edges.some(e => e.from === edge.to && e.to === edge.from);
    
    // Calculate direction and distance
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist; // normalized direction
    const ny = dy / dist;
    
    // Adjust start and end points to be on node edge
    const startX = from.x + nx * nodeRadius;
    const startY = from.y + ny * nodeRadius;
    const endX = to.x - nx * nodeRadius;
    const endY = to.y - ny * nodeRadius;
    
    // Calculate control point for curved edge
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    
    // Curve offset - larger for bidirectional edges
    const curveOffset = hasReverseEdge ? Math.max(40, dist * 0.2) : Math.min(25, dist * 0.1);
    const controlX = midX - ny * curveOffset;
    const controlY = midY + nx * curveOffset;
    
    // Calculate flow percentage
    const flowPercent = flowValue / edge.capacity;
    
    // Draw curved line with gradient based on flow
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    if (flowValue > 0) {
        gradient.addColorStop(0, flowPercent >= 0.9 ? '#dc3545' : '#667eea');
        gradient.addColorStop(1, flowPercent >= 0.9 ? '#ff6b7a' : '#8b9cff');
    } else {
        gradient.addColorStop(0, '#aaa');
        gradient.addColorStop(1, '#ccc');
    }
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3 + flowPercent * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();

    // Draw arrow at the end of the edge (near target node)
    const t = 0.85;
    const arrowX = (1-t)*(1-t)*startX + 2*(1-t)*t*controlX + t*t*endX;
    const arrowY = (1-t)*(1-t)*startY + 2*(1-t)*t*controlY + t*t*endY;
    const t2 = 0.80;
    const arrowPrevX = (1-t2)*(1-t2)*startX + 2*(1-t2)*t2*controlX + t2*t2*endX;
    const arrowPrevY = (1-t2)*(1-t2)*startY + 2*(1-t2)*t2*controlY + t2*t2*endY;
    const angle = Math.atan2(arrowY - arrowPrevY, arrowX - arrowPrevX);
    const arrowSize = 10;

    ctx.fillStyle = flowValue > 0 ? (flowPercent >= 0.9 ? '#dc3545' : '#667eea') : '#aaa';
    ctx.beginPath();
    ctx.moveTo(arrowX + arrowSize * Math.cos(angle), arrowY + arrowSize * Math.sin(angle));
    ctx.lineTo(arrowX - arrowSize * Math.cos(angle - Math.PI / 6), 
               arrowY - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrowX - arrowSize * Math.cos(angle + Math.PI / 6), 
               arrowY - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Draw edge label at curve midpoint
    const labelT = 0.5;
    const labelX = (1-labelT)*(1-labelT)*startX + 2*(1-labelT)*labelT*controlX + labelT*labelT*endX;
    const labelY = (1-labelT)*(1-labelT)*startY + 2*(1-labelT)*labelT*controlY + labelT*labelT*endY;
    const label = `${flowValue}/${edge.capacity}`;

    // Background for label with shadow
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.fillStyle = 'white';
    const labelWidth = 58;
    const labelHeight = 26;
    const labelBorderRadius = 13;
    ctx.beginPath();
    ctx.roundRect(labelX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight, labelBorderRadius);
    ctx.fill();
    ctx.restore();
    
    // Border for label
    ctx.strokeStyle = flowValue > 0 ? (flowPercent >= 0.9 ? '#dc3545' : '#667eea') : '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(labelX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight, labelBorderRadius);
    ctx.stroke();

    // Text
    ctx.fillStyle = flowValue > 0 ? (flowPercent >= 0.9 ? '#dc3545' : '#667eea') : '#666';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX, labelY);
}

function drawNode(nodeId) {
    const pos = nodePositions[nodeId];
    const radius = 28;
    
    // Determine node color and create gradient
    let color1, color2, label;
    if (nodeId === levelData.source) {
        color1 = '#28a745';
        color2 = '#20c997';
        label = 'S';
    } else if (nodeId === levelData.sink) {
        color1 = '#dc3545';
        color2 = '#ff6b7a';
        label = 'T';
    } else {
        color1 = '#667eea';
        color2 = '#764ba2';
        label = nodeId.toString();
    }
    
    // Draw shadow
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    // Create radial gradient for node
    const gradient = ctx.createRadialGradient(pos.x - 8, pos.y - 8, 0, pos.x, pos.y, radius);
    gradient.addColorStop(0, color2);
    gradient.addColorStop(1, color1);

    // Draw circle with gradient
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // Draw border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y);
    
    // Draw node type label below
    if (nodeId === levelData.source || nodeId === levelData.sink) {
        ctx.fillStyle = '#666';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(nodeId === levelData.source ? 'Source' : 'Sink', pos.x, pos.y + radius + 18);
    }
}

function createFlowControls() {
    const container = document.getElementById('flow-controls');
    container.innerHTML = '';

    levelData.edges.forEach(edge => {
        const flowId = `${edge.from}-${edge.to}`;
        
        const controlDiv = document.createElement('div');
        controlDiv.className = 'flow-control';
        
        const label = document.createElement('label');
        label.htmlFor = flowId;
        label.textContent = `Edge ${edge.from} → ${edge.to}`;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = flowId;
        input.min = '0';
        input.max = edge.capacity;
        input.value = flows[flowId] || '0';
        input.addEventListener('change', (e) => {
            let value = parseInt(e.target.value) || 0;
            value = Math.max(0, Math.min(value, edge.capacity));
            e.target.value = value;
            flows[flowId] = value;
            
            // Create flow particles for animation
            updateFlowParticles(edge.from, edge.to, value);
            
            drawGraph();
        });
        
        const capacity = document.createElement('div');
        capacity.className = 'flow-capacity';
        capacity.textContent = `Capacity: ${edge.capacity} units`;
        
        controlDiv.appendChild(label);
        controlDiv.appendChild(input);
        controlDiv.appendChild(capacity);
        
        container.appendChild(controlDiv);
    });
}

async function verifyFlow() {
    clearStatusMessage();
    
    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                level_id: currentLevel,
                flows: flows
            })
        });

        const result = await response.json();
        
        if (result.is_valid) {
            showStatusMessage(result.message, 'success');
            document.getElementById('flow-info').textContent = 
                `Maximum Flow: ${result.max_flow} units ✓`;
            
            // Show next level button after success
            setTimeout(() => {
                showNextLevelPrompt();
            }, 1000);
        } else {
            showStatusMessage(result.message, 'error');
            document.getElementById('flow-info').textContent = 
                `Current: ${result.user_flow} units | Max: ${result.max_flow} units`;
        }
    } catch (error) {
        console.error('Error verifying flow:', error);
        showStatusMessage('Error verifying flow. Try again.', 'error');
    }
}

function showNextLevelPrompt() {
    if (currentLevel < 5) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = `→ Continue to Level ${currentLevel + 1}`;
        nextBtn.style.marginTop = '20px';
        nextBtn.addEventListener('click', () => {
            loadLevel(currentLevel + 1);
        });
        document.querySelector('.actions').appendChild(nextBtn);
    } else {
        showStatusMessage('🎉 Congratulations! You completed all levels!', 'success');
    }
}

async function getHint() {
    try {
        const response = await fetch(`/api/hint/${currentLevel}`);
        const result = await response.json();
        
        const hintDiv = document.createElement('div');
        hintDiv.className = 'hint-message';
        hintDiv.innerHTML = `<strong>Hint:</strong> ${result.hint}`;
        
        const statusDiv = document.getElementById('status-message');
        statusDiv.parentNode.insertBefore(hintDiv, statusDiv);
    } catch (error) {
        console.error('Error getting hint:', error);
    }
}

function showStatusMessage(message, type) {
    const statusMsg = document.getElementById('status-message');
    statusMsg.textContent = message;
    statusMsg.className = `status-message ${type}`;
}

function clearStatusMessage() {
    const statusMsg = document.getElementById('status-message');
    statusMsg.textContent = '';
    statusMsg.className = 'status-message';
    
    const hints = document.querySelectorAll('.hint-message');
    hints.forEach(hint => hint.remove());
}

function updateFlowParticles(from, to, flowValue) {
    const flowId = `${from}-${to}`;
    const fromPos = nodePositions[from];
    const toPos = nodePositions[to];
    const nodeRadius = 28;
    
    // Check if there's a reverse edge (bidirectional)
    const hasReverseEdge = levelData.edges.some(e => e.from === to && e.to === from);
    
    // Calculate curve control point (same as in drawEdge)
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    
    const startX = fromPos.x + nx * nodeRadius;
    const startY = fromPos.y + ny * nodeRadius;
    const endX = toPos.x - nx * nodeRadius;
    const endY = toPos.y - ny * nodeRadius;
    
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const curveOffset = hasReverseEdge ? Math.max(40, dist * 0.2) : Math.min(25, dist * 0.1);
    const controlX = midX - ny * curveOffset;
    const controlY = midY + nx * curveOffset;
    
    if (flowValue > 0) {
        const numParticles = Math.min(5, Math.ceil(flowValue / 2));
        flowAnimations[flowId] = [];
        for (let i = 0; i < numParticles; i++) {
            const particle = new FlowParticle(startX, startY, endX, endY, '#667eea');
            particle.controlX = controlX;
            particle.controlY = controlY;
            particle.progress = i / numParticles; // Stagger particles
            flowAnimations[flowId].push(particle);
        }
    } else {
        delete flowAnimations[flowId];
    }
}

function backToLevels() {
    currentLevel = null;
    levelData = null;
    flows = {};
    flowAnimations = {};
    stopAnimation();
    levelSelectDiv.style.display = 'block';
    gameAreaDiv.style.display = 'none';
    clearStatusMessage();
}

// Initialize canvas size when page loads
window.addEventListener('load', () => {
    const container = document.querySelector('.graph-container');
    if (container) {
        const rect = container.getBoundingClientRect();
        canvas.width = Math.floor(rect.width) - 40;
        canvas.height = 400;
    }
});

// Polyfill for roundRect if not supported
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
        return this;
    };
}
