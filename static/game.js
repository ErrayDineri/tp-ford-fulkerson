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
            
            // Check flow conservation (Kirchhoff's law)
            checkFlowConservation();
            
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

// Check Kirchhoff's law: flow in = flow out for all intermediate nodes
function checkFlowConservation() {
    const violations = [];
    
    for (let node = 0; node < levelData.nodes; node++) {
        // Skip source and sink
        if (node === levelData.source || node === levelData.sink) continue;
        
        // Calculate incoming flow
        let inFlow = 0;
        for (const edge of levelData.edges) {
            if (edge.to === node) {
                inFlow += flows[`${edge.from}-${edge.to}`] || 0;
            }
        }
        
        // Calculate outgoing flow
        let outFlow = 0;
        for (const edge of levelData.edges) {
            if (edge.from === node) {
                outFlow += flows[`${edge.from}-${edge.to}`] || 0;
            }
        }
        
        // Check if there's a violation (only if there's some flow through the node)
        if (inFlow !== outFlow && (inFlow > 0 || outFlow > 0)) {
            violations.push({
                node: node,
                inFlow: inFlow,
                outFlow: outFlow,
                difference: inFlow - outFlow
            });
        }
    }
    
    // Display warnings
    displayFlowWarnings(violations);
    
    return violations;
}

function displayFlowWarnings(violations) {
    // Remove existing warnings
    const existingWarnings = document.querySelectorAll('.flow-warning');
    existingWarnings.forEach(w => w.remove());
    
    if (violations.length === 0) {
        // Show success indicator if there's any flow
        const totalFlow = Object.values(flows).reduce((a, b) => a + b, 0);
        if (totalFlow > 0) {
            const flowInfo = document.getElementById('flow-info');
            flowInfo.innerHTML = `<span style="color: #28a745;">✓ Flow conservation satisfied</span>`;
        }
        return;
    }
    
    // Create warning container
    const warningDiv = document.createElement('div');
    warningDiv.className = 'flow-warning';
    
    let warningHTML = '<strong>⚠️ Kirchhoff\'s Law Violations:</strong><ul>';
    violations.forEach(v => {
        const nodeLabel = v.node === levelData.source ? 'Source' : 
                         v.node === levelData.sink ? 'Sink' : `Node ${v.node}`;
        warningHTML += `<li><strong>${nodeLabel}</strong>: In=${v.inFlow}, Out=${v.outFlow} `;
        if (v.difference > 0) {
            warningHTML += `<span class="warning-excess">(${v.difference} units stuck)</span>`;
        } else {
            warningHTML += `<span class="warning-deficit">(${Math.abs(v.difference)} units missing)</span>`;
        }
        warningHTML += '</li>';
    });
    warningHTML += '</ul>';
    
    warningDiv.innerHTML = warningHTML;
    
    // Insert before flow-info
    const flowInfo = document.getElementById('flow-info');
    flowInfo.parentNode.insertBefore(warningDiv, flowInfo);
    
    // Update flow info
    flowInfo.innerHTML = `<span style="color: #dc3545;">✗ Fix flow conservation before verifying</span>`;
}

async function verifyFlow() {
    clearStatusMessage();
    
    // Check flow conservation first
    const violations = checkFlowConservation();
    if (violations.length > 0) {
        showStatusMessage('Fix Kirchhoff\'s law violations first! Flow in must equal flow out at each intermediate node.', 'error');
        return;
    }
    
    try {
        const requestBody = {
            level_id: currentLevel,
            flows: flows
        };
        
        // Include level data for custom graphs
        if (currentLevel === 'custom') {
            requestBody.level_data = levelData;
        }
        
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
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
    
    // Also clear flow warnings
    const warnings = document.querySelectorAll('.flow-warning');
    warnings.forEach(w => w.remove());
    
    // Reset flow info
    const flowInfo = document.getElementById('flow-info');
    if (flowInfo) flowInfo.textContent = '';
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

// ==========================================
// CUSTOM GRAPH BUILDER
// ==========================================

let customGraph = {
    nodes: 4,
    edges: [],
    source: 0,
    sink: 3
};

let previewCanvas, previewCtx;

// Initialize builder when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    previewCanvas = document.getElementById('preview-canvas');
    if (previewCanvas) {
        previewCtx = previewCanvas.getContext('2d');
    }
    
    // Builder button events
    const createCustomBtn = document.getElementById('create-custom-btn');
    if (createCustomBtn) {
        createCustomBtn.addEventListener('click', openGraphBuilder);
    }
    
    const setNodesBtn = document.getElementById('set-nodes-btn');
    if (setNodesBtn) {
        setNodesBtn.addEventListener('click', setNodeCount);
    }
    
    const addEdgeBtn = document.getElementById('add-edge-btn');
    if (addEdgeBtn) {
        addEdgeBtn.addEventListener('click', addEdge);
    }
    
    const playCustomBtn = document.getElementById('play-custom-btn');
    if (playCustomBtn) {
        playCustomBtn.addEventListener('click', playCustomGraph);
    }
    
    const clearGraphBtn = document.getElementById('clear-graph-btn');
    if (clearGraphBtn) {
        clearGraphBtn.addEventListener('click', clearCustomGraph);
    }
    
    const backFromBuilderBtn = document.getElementById('back-from-builder-btn');
    if (backFromBuilderBtn) {
        backFromBuilderBtn.addEventListener('click', backFromBuilder);
    }
    
    // Source/Sink select change events
    const sourceSelect = document.getElementById('source-select');
    const sinkSelect = document.getElementById('sink-select');
    if (sourceSelect) {
        sourceSelect.addEventListener('change', (e) => {
            customGraph.source = parseInt(e.target.value);
            updatePreview();
        });
    }
    if (sinkSelect) {
        sinkSelect.addEventListener('change', (e) => {
            customGraph.sink = parseInt(e.target.value);
            updatePreview();
        });
    }
});

function openGraphBuilder() {
    document.getElementById('level-select').style.display = 'none';
    document.getElementById('graph-builder').style.display = 'block';
    
    // Initialize with default 4 nodes
    customGraph = {
        nodes: 4,
        edges: [],
        source: 0,
        sink: 3
    };
    
    updateNodeSelects();
    updateEdgeList();
    updatePreview();
}

function backFromBuilder() {
    document.getElementById('graph-builder').style.display = 'none';
    document.getElementById('level-select').style.display = 'block';
}

function setNodeCount() {
    const count = parseInt(document.getElementById('node-count').value);
    if (count < 2 || count > 10) {
        alert('Node count must be between 2 and 10');
        return;
    }
    
    customGraph.nodes = count;
    customGraph.source = 0;
    customGraph.sink = count - 1;
    
    // Remove edges that reference removed nodes
    customGraph.edges = customGraph.edges.filter(e => 
        e.from < count && e.to < count
    );
    
    updateNodeSelects();
    updateEdgeList();
    updatePreview();
}

function updateNodeSelects() {
    const sourceSelect = document.getElementById('source-select');
    const sinkSelect = document.getElementById('sink-select');
    const edgeFrom = document.getElementById('edge-from');
    const edgeTo = document.getElementById('edge-to');
    
    const options = [];
    for (let i = 0; i < customGraph.nodes; i++) {
        options.push(`<option value="${i}">Node ${i}</option>`);
    }
    const optionsHTML = options.join('');
    
    sourceSelect.innerHTML = optionsHTML;
    sinkSelect.innerHTML = optionsHTML;
    edgeFrom.innerHTML = optionsHTML;
    edgeTo.innerHTML = optionsHTML;
    
    sourceSelect.value = customGraph.source;
    sinkSelect.value = customGraph.sink;
    edgeTo.value = Math.min(1, customGraph.nodes - 1);
}

function addEdge() {
    const from = parseInt(document.getElementById('edge-from').value);
    const to = parseInt(document.getElementById('edge-to').value);
    const capacity = parseInt(document.getElementById('edge-capacity').value);
    
    if (from === to) {
        alert('Cannot create self-loop edge');
        return;
    }
    
    if (capacity < 1 || capacity > 100) {
        alert('Capacity must be between 1 and 100');
        return;
    }
    
    // Check if edge already exists
    const exists = customGraph.edges.some(e => e.from === from && e.to === to);
    if (exists) {
        alert('This edge already exists');
        return;
    }
    
    customGraph.edges.push({ from, to, capacity });
    
    updateEdgeList();
    updatePreview();
    updatePlayButton();
}

function removeEdge(index) {
    customGraph.edges.splice(index, 1);
    updateEdgeList();
    updatePreview();
    updatePlayButton();
}

function updateEdgeList() {
    const edgeList = document.getElementById('edge-list');
    const edgeCount = document.getElementById('edge-count');
    
    edgeCount.textContent = `(${customGraph.edges.length})`;
    
    if (customGraph.edges.length === 0) {
        edgeList.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No edges yet. Add some edges above.</div>';
        return;
    }
    
    edgeList.innerHTML = customGraph.edges.map((edge, i) => `
        <div class="edge-item">
            <div class="edge-item-info">
                <span class="from-node">${edge.from}</span>
                <span>→</span>
                <span class="to-node">${edge.to}</span>
                <span class="capacity">(capacity: ${edge.capacity})</span>
            </div>
            <button onclick="removeEdge(${i})">✕</button>
        </div>
    `).join('');
}

function updatePlayButton() {
    const playBtn = document.getElementById('play-custom-btn');
    // Need at least one edge to play
    playBtn.disabled = customGraph.edges.length === 0;
}

function clearCustomGraph() {
    customGraph.edges = [];
    updateEdgeList();
    updatePreview();
    updatePlayButton();
}

function updatePreview() {
    if (!previewCanvas || !previewCtx) return;
    
    const container = document.querySelector('.preview-container');
    const width = container.clientWidth - 20;
    const height = Math.max(300, container.clientHeight - 20);
    
    previewCanvas.width = width;
    previewCanvas.height = height;
    
    // Draw background
    const gradient = previewCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    previewCtx.fillStyle = gradient;
    previewCtx.fillRect(0, 0, width, height);
    
    // Calculate node positions for preview
    const previewPositions = calculatePreviewPositions(width, height);
    
    // Draw edges
    customGraph.edges.forEach(edge => {
        drawPreviewEdge(previewPositions, edge);
    });
    
    // Draw nodes
    for (let i = 0; i < customGraph.nodes; i++) {
        drawPreviewNode(previewPositions, i);
    }
}

function calculatePreviewPositions(width, height) {
    const positions = {};
    const padding = 60;
    const availableWidth = width - 2 * padding;
    const availableHeight = height - 2 * padding;
    
    // Simple BFS-like layer assignment
    const layers = {};
    const visited = new Set();
    const queue = [customGraph.source];
    layers[customGraph.source] = 0;
    visited.add(customGraph.source);
    
    while (queue.length > 0) {
        const u = queue.shift();
        for (const edge of customGraph.edges) {
            if (edge.from === u && !visited.has(edge.to)) {
                visited.add(edge.to);
                layers[edge.to] = (layers[u] || 0) + 1;
                queue.push(edge.to);
            }
        }
    }
    
    // Assign remaining nodes
    let maxLayer = Math.max(0, ...Object.values(layers));
    for (let i = 0; i < customGraph.nodes; i++) {
        if (layers[i] === undefined) {
            layers[i] = maxLayer + 1;
            maxLayer++;
        }
    }
    
    // Ensure sink is at the end
    layers[customGraph.sink] = Math.max(...Object.values(layers));
    
    // Group by layer
    const nodesByLayer = {};
    for (let i = 0; i < customGraph.nodes; i++) {
        const layer = layers[i];
        if (!nodesByLayer[layer]) nodesByLayer[layer] = [];
        nodesByLayer[layer].push(i);
    }
    
    const layerNumbers = Object.keys(nodesByLayer).map(Number).sort((a, b) => a - b);
    const numLayers = layerNumbers.length;
    
    layerNumbers.forEach((layer, layerIndex) => {
        const nodesInLayer = nodesByLayer[layer];
        const layerCount = nodesInLayer.length;
        
        const xPos = numLayers === 1 ? width / 2 : padding + (layerIndex / (numLayers - 1)) * availableWidth;
        
        nodesInLayer.forEach((nodeId, idx) => {
            const yPos = layerCount === 1 ? height / 2 : padding + (idx / (layerCount - 1)) * availableHeight;
            positions[nodeId] = { x: xPos, y: yPos };
        });
    });
    
    return positions;
}

function drawPreviewEdge(positions, edge) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;
    
    const nodeRadius = 22;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    
    const nx = dx / dist;
    const ny = dy / dist;
    
    const startX = from.x + nx * nodeRadius;
    const startY = from.y + ny * nodeRadius;
    const endX = to.x - nx * nodeRadius;
    const endY = to.y - ny * nodeRadius;
    
    // Check for reverse edge
    const hasReverse = customGraph.edges.some(e => e.from === edge.to && e.to === edge.from);
    const curveOffset = hasReverse ? 30 : 15;
    
    const midX = (startX + endX) / 2 - ny * curveOffset;
    const midY = (startY + endY) / 2 + nx * curveOffset;
    
    // Draw line
    previewCtx.strokeStyle = '#667eea';
    previewCtx.lineWidth = 2;
    previewCtx.beginPath();
    previewCtx.moveTo(startX, startY);
    previewCtx.quadraticCurveTo(midX, midY, endX, endY);
    previewCtx.stroke();
    
    // Draw arrow
    const t = 0.85;
    const arrowX = (1-t)*(1-t)*startX + 2*(1-t)*t*midX + t*t*endX;
    const arrowY = (1-t)*(1-t)*startY + 2*(1-t)*t*midY + t*t*endY;
    const t2 = 0.8;
    const arrowPrevX = (1-t2)*(1-t2)*startX + 2*(1-t2)*t2*midX + t2*t2*endX;
    const arrowPrevY = (1-t2)*(1-t2)*startY + 2*(1-t2)*t2*midY + t2*t2*endY;
    const angle = Math.atan2(arrowY - arrowPrevY, arrowX - arrowPrevX);
    
    previewCtx.fillStyle = '#667eea';
    previewCtx.beginPath();
    previewCtx.moveTo(arrowX + 6 * Math.cos(angle), arrowY + 6 * Math.sin(angle));
    previewCtx.lineTo(arrowX - 6 * Math.cos(angle - Math.PI / 6), arrowY - 6 * Math.sin(angle - Math.PI / 6));
    previewCtx.lineTo(arrowX - 6 * Math.cos(angle + Math.PI / 6), arrowY - 6 * Math.sin(angle + Math.PI / 6));
    previewCtx.closePath();
    previewCtx.fill();
    
    // Draw capacity label
    const labelT = 0.5;
    const labelX = (1-labelT)*(1-labelT)*startX + 2*(1-labelT)*labelT*midX + labelT*labelT*endX;
    const labelY = (1-labelT)*(1-labelT)*startY + 2*(1-labelT)*labelT*midY + labelT*labelT*endY;
    
    previewCtx.fillStyle = 'white';
    previewCtx.beginPath();
    previewCtx.arc(labelX, labelY, 14, 0, 2 * Math.PI);
    previewCtx.fill();
    previewCtx.strokeStyle = '#667eea';
    previewCtx.lineWidth = 1.5;
    previewCtx.stroke();
    
    previewCtx.fillStyle = '#667eea';
    previewCtx.font = 'bold 11px Arial';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText(edge.capacity, labelX, labelY);
}

function drawPreviewNode(positions, nodeId) {
    const pos = positions[nodeId];
    if (!pos) return;
    
    const radius = 22;
    
    let color1, color2, label;
    if (nodeId === customGraph.source) {
        color1 = '#28a745';
        color2 = '#20c997';
        label = 'S';
    } else if (nodeId === customGraph.sink) {
        color1 = '#dc3545';
        color2 = '#ff6b7a';
        label = 'T';
    } else {
        color1 = '#667eea';
        color2 = '#764ba2';
        label = nodeId.toString();
    }
    
    // Draw shadow
    previewCtx.save();
    previewCtx.shadowBlur = 8;
    previewCtx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    previewCtx.shadowOffsetX = 2;
    previewCtx.shadowOffsetY = 2;
    
    const gradient = previewCtx.createRadialGradient(pos.x - 4, pos.y - 4, 0, pos.x, pos.y, radius);
    gradient.addColorStop(0, color2);
    gradient.addColorStop(1, color1);
    
    previewCtx.fillStyle = gradient;
    previewCtx.beginPath();
    previewCtx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    previewCtx.fill();
    previewCtx.restore();
    
    // Border
    previewCtx.strokeStyle = '#fff';
    previewCtx.lineWidth = 3;
    previewCtx.beginPath();
    previewCtx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    previewCtx.stroke();
    
    // Label
    previewCtx.fillStyle = '#fff';
    previewCtx.font = 'bold 14px Arial';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText(label, pos.x, pos.y);
}

function playCustomGraph() {
    if (customGraph.edges.length === 0) {
        alert('Please add at least one edge');
        return;
    }
    
    // Create level data from custom graph
    levelData = {
        id: 'custom',
        name: 'Custom Graph',
        description: 'Your custom flow network',
        nodes: customGraph.nodes,
        edges: [...customGraph.edges],
        source: customGraph.source,
        sink: customGraph.sink
    };
    
    currentLevel = 'custom';
    
    // Update UI
    document.getElementById('level-title').textContent = 'Custom Graph';
    document.getElementById('level-description').textContent = 'Your custom flow network - find the maximum flow!';
    
    // Hide progress for custom level
    const progressSection = document.getElementById('progress-section');
    if (progressSection) progressSection.style.display = 'none';
    
    // Initialize flows
    flows = {};
    flowAnimations = {};
    levelData.edges.forEach(edge => {
        flows[`${edge.from}-${edge.to}`] = 0;
    });
    
    // Show game area
    document.getElementById('graph-builder').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    
    // Create flow controls
    createFlowControls();
    
    // Draw graph after DOM update
    requestAnimationFrame(() => {
        calculateNodePositions();
        drawGraph();
        startAnimation();
    });
    
    clearStatusMessage();
}
